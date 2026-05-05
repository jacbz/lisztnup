import { browser } from '$app/environment';
import type { LeaderboardEntry, TimelineReplayLog } from '$lib/types';

const LEADERBOARD_CACHE_TTL_MS = 60_000;
const QUEUE_KEY = 'lisztnup:api-write-queue:v1';
const SEQUENCE_KEY = 'lisztnup:api-write-sequence:v1';
const MAX_ATTEMPTS = 8;
const BACKOFF_MS = [1_000, 5_000, 30_000, 120_000, 300_000, 900_000];

type JsonObject = Record<string, unknown>;

interface QueuedWrite {
	id: string;
	clientSequence: number;
	method: 'POST' | 'PATCH';
	url: string;
	payload: JsonObject;
	occurredAt: string;
	createdAt: string;
	lastAttemptAt: string | null;
	nextAttemptAt: number;
	attempts: number;
	keepalive?: boolean;
}

interface LeaderboardResponse {
	entries: LeaderboardEntry[];
}

export interface LeaderboardQuery {
	limit?: number;
	tracklist?: string | null;
	target?: number | string | null;
	token?: string | null;
}

export interface LeaderboardSubmission {
	playerToken: string;
	playerName: string | null;
	score: number;
	target: number;
	attempts: number;
	averageTime?: number | null;
	longestStreak: number;
	tracklistId?: string | null;
	sessionId?: string | null;
	log?: TimelineReplayLog;
}

export class ApiNetworkError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'ApiNetworkError';
	}
}

export class ApiHttpError extends Error {
	constructor(
		public readonly status: number,
		public readonly statusText: string,
		public readonly response: Response
	) {
		super(`HTTP ${status} ${statusText}`);
		this.name = 'ApiHttpError';
	}
}

const leaderboardCache = new Map<string, { expiresAt: number; data: LeaderboardResponse }>();
const inFlightLeaderboard = new Map<string, Promise<LeaderboardResponse>>();
let isDraining = false;
let drainTimer: ReturnType<typeof setTimeout> | null = null;
let fallbackSequence = Date.now();

function nowIso() {
	return new Date().toISOString();
}

function isRetryableStatus(status: number) {
	return status === 429 || status >= 500;
}

function getRetryDelay(error: ApiHttpError | null, attempts: number) {
	const retryAfter = error?.response.headers.get('Retry-After');
	if (retryAfter) {
		const seconds = Number(retryAfter);
		if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
		const dateMs = Date.parse(retryAfter);
		if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
	}
	return BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
}

function normalizeLeaderboardUrl(query: LeaderboardQuery) {
	const params = new URLSearchParams();
	if (query.limit != null) params.set('limit', String(query.limit));
	if (query.tracklist) params.set('tracklist', query.tracklist);
	if (query.target != null) params.set('target', String(query.target));
	if (query.token) params.set('token', query.token);
	params.sort();
	return `/api/game/leaderboard?${params.toString()}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	let response: Response;
	try {
		response = await fetch(url, init);
	} catch (error) {
		throw new ApiNetworkError(`Network error fetching ${url}`, error);
	}

	if (!response.ok) {
		throw new ApiHttpError(response.status, response.statusText, response);
	}

	return (await response.json()) as T;
}

function loadQueue(): QueuedWrite[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(QUEUE_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function saveQueue(queue: QueuedWrite[]) {
	if (!browser) return;
	try {
		localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
	} catch {
		// If storage is unavailable, keep explicit calls unchanged and drop background retry state.
	}
}

function nextSequence() {
	if (!browser) return fallbackSequence++;
	try {
		const current = Number(localStorage.getItem(SEQUENCE_KEY) ?? '0');
		const next = Number.isFinite(current) ? current + 1 : 1;
		localStorage.setItem(SEQUENCE_KEY, String(next));
		return next;
	} catch {
		return fallbackSequence++;
	}
}

function enqueueWrite(
	method: QueuedWrite['method'],
	url: string,
	payload: JsonObject,
	options?: { occurredAt?: string; keepalive?: boolean }
) {
	const timestamp = options?.occurredAt ?? nowIso();
	const entry: QueuedWrite = {
		id:
			typeof crypto !== 'undefined' && crypto.randomUUID
				? crypto.randomUUID()
				: `${Date.now()}-${Math.random()}`,
		clientSequence: nextSequence(),
		method,
		url,
		payload: { ...payload, occurredAt: timestamp },
		occurredAt: timestamp,
		createdAt: nowIso(),
		lastAttemptAt: null,
		nextAttemptAt: Date.now(),
		attempts: 0,
		keepalive: options?.keepalive
	};
	const queue = loadQueue();
	queue.push(entry);
	queue.sort((a, b) => a.clientSequence - b.clientSequence);
	saveQueue(queue);
	scheduleDrain(0);
}

function scheduleDrain(delayMs: number) {
	if (!browser) return;
	if (drainTimer) clearTimeout(drainTimer);
	drainTimer = setTimeout(() => {
		void drainQueue();
	}, delayMs);
}

async function sendQueuedWrite(entry: QueuedWrite) {
	await fetchJson(entry.url, {
		method: entry.method,
		keepalive: entry.keepalive,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(entry.payload)
	});
	if (entry.url === '/api/game/leaderboard') {
		invalidateLeaderboardCache();
	}
}

async function drainQueue() {
	if (!browser || isDraining) return;
	isDraining = true;
	try {
		while (true) {
			const queue = loadQueue().sort((a, b) => a.clientSequence - b.clientSequence);
			const entry = queue[0];
			if (!entry) return;

			const now = Date.now();
			if (entry.nextAttemptAt > now) {
				scheduleDrain(entry.nextAttemptAt - now);
				return;
			}

			entry.attempts += 1;
			entry.lastAttemptAt = nowIso();
			queue[0] = entry;
			saveQueue(queue);

			try {
				await sendQueuedWrite(entry);
				saveQueue(queue.slice(1));
			} catch (error) {
				const retryable =
					error instanceof ApiNetworkError ||
					(error instanceof ApiHttpError && isRetryableStatus(error.status));

				if (!retryable || entry.attempts >= MAX_ATTEMPTS) {
					saveQueue(queue.slice(1));
					continue;
				}

				entry.nextAttemptAt =
					Date.now() + getRetryDelay(error instanceof ApiHttpError ? error : null, entry.attempts);
				queue[0] = entry;
				saveQueue(queue);
				scheduleDrain(entry.nextAttemptAt - Date.now());
				return;
			}
		}
	} finally {
		isDraining = false;
	}
}

export function invalidateLeaderboardCache() {
	leaderboardCache.clear();
	inFlightLeaderboard.clear();
}

export async function getLeaderboard(query: LeaderboardQuery): Promise<LeaderboardResponse> {
	const url = normalizeLeaderboardUrl(query);
	const cached = leaderboardCache.get(url);
	if (cached && cached.expiresAt > Date.now()) return cached.data;

	const inFlight = inFlightLeaderboard.get(url);
	if (inFlight) return inFlight;

	const request = fetchJson<LeaderboardResponse>(url)
		.then((data) => {
			const normalized = { entries: data.entries ?? [] };
			leaderboardCache.set(url, {
				expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS,
				data: normalized
			});
			return normalized;
		})
		.finally(() => {
			inFlightLeaderboard.delete(url);
		});
	inFlightLeaderboard.set(url, request);
	return request;
}

export async function submitLeaderboard(
	payload: LeaderboardSubmission,
	options?: { queueOnTransient?: boolean; occurredAt?: string }
): Promise<{ success: boolean; id?: number } | null> {
	const body = { ...payload, occurredAt: options?.occurredAt ?? nowIso() };
	try {
		const data = await fetchJson<{ success: boolean; id?: number }>('/api/game/leaderboard', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		invalidateLeaderboardCache();
		return data;
	} catch (error) {
		if (
			options?.queueOnTransient &&
			(error instanceof ApiNetworkError ||
				(error instanceof ApiHttpError && isRetryableStatus(error.status)))
		) {
			enqueueWrite('POST', '/api/game/leaderboard', payload as unknown as JsonObject, {
				occurredAt: body.occurredAt
			});
			return null;
		}
		throw error;
	}
}

export async function patchLeaderboardName(payload: {
	id: number;
	playerToken: string;
	playerName: string;
}) {
	const data = await fetchJson<{ success: boolean }>('/api/game/leaderboard', {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	invalidateLeaderboardCache();
	return data;
}

export async function postJson<T>(url: string, payload: JsonObject): Promise<T> {
	return fetchJson<T>(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
}

export function preloadAsset(url: string) {
	fetch(url)
		.then((response) => response.blob())
		.catch(() => {});
}

export function postBackgroundJson(
	url: string,
	payload: JsonObject,
	options?: { keepalive?: boolean }
) {
	const occurredAt = typeof payload.occurredAt === 'string' ? payload.occurredAt : nowIso();
	fetchJson(url, {
		method: 'POST',
		keepalive: options?.keepalive,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ...payload, occurredAt })
	}).catch((error) => {
		if (
			error instanceof ApiNetworkError ||
			(error instanceof ApiHttpError && isRetryableStatus(error.status))
		) {
			enqueueWrite('POST', url, payload, { occurredAt, keepalive: options?.keepalive });
		}
	});
}

if (browser) {
	window.addEventListener('online', () => scheduleDrain(0));
	scheduleDrain(0);
}

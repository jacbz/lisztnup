import type { D1Database } from '@cloudflare/workers-types';

export type LogSeverity = 'INFO' | 'WARN' | 'ERROR';

interface LogOptions {
	db: D1Database;
	severity: LogSeverity;
	message: string;
	context?: Record<string, unknown>;
	userHash?: string | null;
	country?: string | null;
	sessionId?: string | null;
}

/**
 * Logs a message to the database for persistent server-side diagnostics.
 * session_id is kept as a standalone column for easy indexing/tracing.
 * user_hash and country are folded into the context JSON.
 */
export async function logToDb(options: LogOptions): Promise<void> {
	const { db, severity, message, context, userHash, country, sessionId } = options;

	// Merge userHash and country into the context blob for a cleaner schema
	const mergedContext = {
		...context,
		...(userHash ? { userHash } : {}),
		...(country ? { country } : {})
	};

	try {
		await db
			.prepare(
				`INSERT INTO logs (severity, message, context, session_id)
				 VALUES (?1, ?2, ?3, ?4)`
			)
			.bind(
				severity,
				message,
				Object.keys(mergedContext).length > 0 ? JSON.stringify(mergedContext) : null,
				sessionId ?? null
			)
			.run();
	} catch (e) {
		// Fallback to console if DB write fails to avoid losing the log entirely
		console.error('Failed to write to logs table:', e);
		console.log(`[${severity}] ${message}`, mergedContext);
	}
}

export const logger = {
	info: (
		db: D1Database,
		message: string,
		options: Omit<LogOptions, 'db' | 'severity' | 'message'> = {}
	) => logToDb({ db, severity: 'INFO', message, ...options }),
	warn: (
		db: D1Database,
		message: string,
		options: Omit<LogOptions, 'db' | 'severity' | 'message'> = {}
	) => logToDb({ db, severity: 'WARN', message, ...options }),
	error: (
		db: D1Database,
		message: string,
		options: Omit<LogOptions, 'db' | 'severity' | 'message'> = {}
	) => logToDb({ db, severity: 'ERROR', message, ...options })
};

import type { Persona, TableDefinition } from './types';

export const PERSONAS: readonly Persona[] = [
	{
		id: 'random',
		label: 'Random Guesser',
		skill: 0,
		yearSigma: 420,
		obscurityPenalty: 0.1,
		randomPlacementRate: 0.8,
		slipRate: 0.12,
		timeoutRate: 0.03,
		baseSeconds: 11,
		speedSigma: 4,
		confidenceSeconds: 1,
		behavior: 'normal'
	},
	{
		id: 'new-listener',
		label: 'New Listener',
		skill: 1,
		yearSigma: 150,
		obscurityPenalty: 0.7,
		randomPlacementRate: 0.22,
		slipRate: 0.1,
		timeoutRate: 0.025,
		baseSeconds: 15,
		speedSigma: 5,
		confidenceSeconds: 3,
		behavior: 'normal'
	},
	{
		id: 'casual',
		label: 'Casual Fan',
		skill: 2,
		yearSigma: 95,
		obscurityPenalty: 0.55,
		randomPlacementRate: 0.12,
		slipRate: 0.08,
		timeoutRate: 0.015,
		baseSeconds: 13,
		speedSigma: 4,
		confidenceSeconds: 4,
		behavior: 'normal'
	},
	{
		id: 'careful-casual',
		label: 'Careful Casual',
		skill: 3,
		yearSigma: 75,
		obscurityPenalty: 0.5,
		randomPlacementRate: 0.08,
		slipRate: 0.045,
		timeoutRate: 0.012,
		baseSeconds: 18,
		speedSigma: 4,
		confidenceSeconds: 2,
		behavior: 'normal'
	},
	{
		id: 'speedster',
		label: 'Speedster',
		skill: 4,
		yearSigma: 70,
		obscurityPenalty: 0.45,
		randomPlacementRate: 0.07,
		slipRate: 0.11,
		timeoutRate: 0.005,
		baseSeconds: 4.5,
		speedSigma: 2,
		confidenceSeconds: 1.5,
		behavior: 'normal'
	},
	{
		id: 'enthusiast',
		label: 'Enthusiast',
		skill: 5,
		yearSigma: 42,
		obscurityPenalty: 0.35,
		randomPlacementRate: 0.035,
		slipRate: 0.035,
		timeoutRate: 0.004,
		baseSeconds: 9,
		speedSigma: 3,
		confidenceSeconds: 3.5,
		behavior: 'normal'
	},
	{
		id: 'expert',
		label: 'Expert',
		skill: 6,
		yearSigma: 20,
		obscurityPenalty: 0.22,
		randomPlacementRate: 0.012,
		slipRate: 0.018,
		timeoutRate: 0.002,
		baseSeconds: 5.8,
		speedSigma: 2.5,
		confidenceSeconds: 2.5,
		behavior: 'normal'
	},
	{
		id: 'farmer',
		label: 'Adversarial Farmer',
		skill: 0.5,
		yearSigma: 35,
		obscurityPenalty: 0,
		randomPlacementRate: 0,
		slipRate: 0,
		timeoutRate: 0,
		baseSeconds: 19,
		speedSigma: 1.5,
		confidenceSeconds: 0,
		behavior: 'farmer'
	}
] as const;

export const TABLES: readonly TableDefinition[] = [
	...PERSONAS.map((persona) => ({
		id: `solo-${persona.id}`,
		label: `Solo: ${persona.label}`,
		personaIds: [persona.id]
	})),
	{
		id: 'mixed-party',
		label: 'Mixed Party',
		personaIds: ['new-listener', 'casual', 'enthusiast', 'expert']
	},
	{
		id: 'fast-table',
		label: 'Fast Table',
		personaIds: ['speedster', 'casual', 'speedster', 'enthusiast']
	},
	{
		id: 'family-table',
		label: 'Family Table',
		personaIds: ['random', 'new-listener', 'careful-casual', 'casual']
	},
	{
		id: 'anti-farming',
		label: 'Anti-Farming Table',
		personaIds: ['farmer', 'random', 'casual', 'enthusiast']
	}
] as const;

export function getPersona(id: string): Persona {
	const persona = PERSONAS.find((candidate) => candidate.id === id);
	if (!persona) throw new Error(`Unknown persona: ${id}`);
	return persona;
}

export function getTable(id: string): TableDefinition {
	const table = TABLES.find((candidate) => candidate.id === id);
	if (!table) throw new Error(`Unknown table: ${id}`);
	return table;
}

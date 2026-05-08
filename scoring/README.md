# Scoring Simulation Suite

This directory contains the Timeline scoring simulator. It is a tuning and regression tool: it runs seeded games against the real `static/lisztnup.json` catalog, uses `TracklistGenerator` filtering, and evaluates every simulated trace with one or more `TimelineScoringParameters` presets.

## Commands

```bash
pnpm score:sim:quick
pnpm score:sim
pnpm score:sim:heavy
pnpm score:test
pnpm score:check
```

- `pnpm score:sim:quick`: 2,000-game smoke run. Uses a smaller tracklist subset and production scoring only. Best for checking that the suite still works.
- `pnpm score:sim`: balanced default. Runs 100,000 games across all default tracklists, targets 6/10/15, all personas/tables, and the built-in parameter presets.
- `pnpm score:sim:heavy`: 300,000-game tuning sweep with the same broad matrix as balanced. Best before committing scoring changes.
- `pnpm score:test`: focused deterministic tests for scoring invariants, seeded reproducibility, paired parameter comparison, and basic skill signal.
- `pnpm score:check`: TypeScript check for the scoring suite and imported production logic.

Useful flags for `score:sim`, `score:sim:quick`, and `score:sim:heavy`:

```bash
pnpm score:sim -- --profile quick --sets production,precision-heavy
pnpm score:sim -- --games 100000 --seed tuning-2026-05 --tracklists difficulty --targets 6,10
pnpm score:sim -- --json-out scoring/results/my-run.json
```

- `--profile quick|balanced|heavy`: choose the default scenario matrix and game count.
- `--games <n>`: override the number of simulated games.
- `--seed <text>`: make a run reproducible; same seed + same inputs produce the same trace stream.
- `--sets <ids|all>`: scoring parameter sets to compare, e.g. `production,precision-heavy`.
- `--tracklists all|difficulty|id,id`: select all presets, difficulty presets, or specific tracklists.
- `--targets 6,10,15`: choose Timeline target card counts.
- `--tables id,id`: restrict to specific solo/multiplayer table definitions.
- `--json-out <path|none>`: write a JSON report or disable report files. Default reports go to `scoring/results/`.

## Profiles

- `quick`: 2,000-game deterministic smoke run for local iteration.
- `balanced`: 100,000 games; all default tracklists, targets 6/10/15, solo personas and representative multiplayer tables.
- `heavy`: 300,000 games for final tuning sweeps. Use `--games` to go higher when you want a long overnight run.

Timeline simulations always require real work years, matching game startup behavior. The suite does not load audio and never calls Deezer.

## Personas

The suite models user archetypes rather than perfect bots:

- **Random guesser**: Mostly chooses slots blindly. This checks whether low-skill play can accidentally score too well.
- **New listener**: Has rough era intuition but weak work knowledge, slow decisions, and frequent uncertainty.
- **Casual fan**: Recognizes broad style periods and famous works, but misses dense or obscure timeline placements.
- **Careful casual**: Similar knowledge to a casual fan, but slower and less sloppy. Helps compare accuracy versus speed rewards.
- **Speedster**: Answers quickly with decent intuition, but makes more slip errors. Tests whether speed bonuses overpower precision.
- **Enthusiast**: Strong chronological knowledge with moderate speed. Should beat casual profiles consistently.
- **Expert**: Accurate and quick across tracklists. Should define the top of normal human play.
- **Adversarial farmer**: Intentionally makes near misses to probe consolation-score exploitation.

Placement decisions use the actual year, current timeline density, work popularity, persona noise, slips, random guesses, timeouts, and timing distributions. The farmer persona intentionally tries near misses to test whether consolation points can be exploited.

## Metrics

Terminal output summarizes:

- **Score mean/median/p95/max**: Overall scoring distribution. Mean shows expected value, median shows typical play, p95 shows strong-but-plausible games, and max exposes outliers.
- **Delta**: Difference from production mean score for each candidate parameter set. Useful for seeing whether a preset inflates or deflates the economy.
- **Completion rate**: Share of players who reached the target. Low values mean the target/scoring model may be too punishing; very high low-skill completion can indicate too much luck.
- **Win rate**: How often a persona wins its table. A healthy system should favor stronger personas while still allowing some upsets.
- **Upset rate**: Multiplayer games won by someone below the highest-skill player at the table. This measures party-game volatility and comeback potential.
- **Solo/Multiplayer persona tables**: Persona metrics are printed separately for solo games and multiplayer tables so completion and win behavior are not blended.
- **Accuracy**: Correct placements divided by attempts. If score rises without accuracy rising, bonuses may be too generous.
- **Attempts**: How many tries players need. High attempts with high score can indicate farming or overly strong consolation.
- **Longest streak**: Captures how often streak multipliers activate. If this dominates score separation, streaks may be too powerful.
- **Completion bonus share**: Portion of final score from completion. High values make finishing efficiency decisive; low values make turn-by-turn points dominate.
- **Tracklist difficulty model**: Automatic 0–100 listening-ambiguity score derived from year density/span, composer diversity, work-type diversity, average work score, and historical remoteness. High values indicate tracklists where pieces sound more similar or sit close together chronologically.
- **Timeout rate**: Frequency of forfeited turns. Mostly checks persona modeling and whether timeouts meaningfully suppress scoring.
- **Leaderboard risk**: Share of scores above the server plausibility ceiling (`target * 6000`). Any non-trivial value is a red flag.
- **Trace coverage**: Turn count, correct/timeout/edge placement rates, year distribution, and placement gap distribution. This tells you whether the simulation is exercising dense middle placements, edge placements, eras, and tracklists broadly enough.
- **Warnings**: Structured balance diagnostics for skill-order inversions, random/farmer strength, and implausible score behavior. Each warning prints its scope, exact failing comparison, expected threshold, explanation, suggested tuning direction, and supporting metrics. Treat them as investigation prompts rather than automatic failures.

JSON output contains the same aggregate data and structured warning objects for later diffing or plotting. Raw traces are not stored by default so large runs stay compact.

Runs of 10,000+ games print progress every 5% with throughput and heap usage. Quantile metrics use bounded deterministic sampling on very large runs; counts, means, min, and max remain exact.

## Parameter Sets

Scoring presets live in `parameterSets.ts`. Production imports `PRODUCTION_TIMELINE_SCORING` from `src/lib/logic/timelineScoring.ts`, and gameplay helpers default to that preset. Candidate presets should be added as typed `TimelineScoringParameters` objects so production and simulations share the same formula surface.

/**
 * Integration smoke tests — real `claude -p` calls against haiku.
 *
 * These hit the actual CLI and cost real money (~$0.01-0.05 per run).
 * Excluded from the default unit test suite. Run explicitly with:
 *
 *   pnpm test:integration
 *
 * Requirements:
 * - `claude` CLI installed and authenticated
 * - Network access
 */

import { describe, expect, it } from "vitest";
import { dispatch } from "../../src/core/dispatch.js";
import { loop } from "../../src/core/loop.js";
import { pipeline } from "../../src/core/pipeline.js";
import { buildArgs } from "../../src/engine/flags.js";
import { toDispatchResult } from "../../src/engine/parse.js";
import { spawnClaude } from "../../src/engine/spawn.js";
import { create } from "../../src/factory.js";

/** Shared options: haiku, cheap, fast, no tools, no persistence. */
const FAST_OPTS = {
	model: "haiku",
	maxTurns: 1,
	maxBudget: 0.5,
	noSessionPersistence: true,
	timeoutMs: 60_000,
} as const;

describe("integration: raw spawn", () => {
	it("spawns claude and gets a valid JSON envelope", async () => {
		const args = buildArgs({
			model: "haiku",
			maxTurns: 1,
			maxBudget: 0.5,
			noSessionPersistence: true,
		});

		const spawn = await spawnClaude({
			args,
			prompt: "Reply with exactly the word 'pong'. Nothing else.",
			timeoutMs: 60_000,
		});

		expect(spawn.exitCode).toBe(0);
		expect(spawn.timedOut).toBe(false);
		expect(spawn.stdout).toBeTruthy();

		// Parse it
		const result = toDispatchResult(spawn);
		expect(result.ok).toBe(true);
		expect(result.subtype).toBe("success");
		expect(result.sessionId).toBeTruthy();
		expect(result.costUsd).toBeGreaterThan(0);
		expect(result.rawEnvelope.type).toBe("result");

		console.log(`  raw spawn: "${result.result.slice(0, 80)}" ($${result.costUsd.toFixed(4)})`);
	}, 60_000);
});

describe("integration: dispatch", () => {
	it("dispatches a simple prompt and gets a result", async () => {
		const result = await dispatch({
			...FAST_OPTS,
			prompt: "What is 7 * 8? Reply with just the number.",
		});

		expect(result.ok).toBe(true);
		expect(result.subtype).toBe("success");
		expect(result.result).toContain("56");
		expect(result.costUsd).toBeGreaterThan(0);
		expect(result.numTurns).toBeGreaterThanOrEqual(1);
		expect(result.sessionId).toBeTruthy();

		console.log(
			`  dispatch: "${result.result.slice(0, 80)}" ($${result.costUsd.toFixed(4)}, ${result.numTurns} turns)`,
		);
	}, 60_000);
});

describe("integration: factory", () => {
	it("creates a factory and dispatches through it", async () => {
		const ic = create({
			model: "haiku",
			maxBudget: 1.0,
			throttle: { minDelay: 0, jitter: [0, 0], maxConcurrency: 1 },
		});

		const result = await ic.dispatch({
			prompt: "Name one primary color. Reply with just the word.",
			maxTurns: 1,
			noSessionPersistence: true,
		});

		expect(result.ok).toBe(true);
		expect(result.result.length).toBeGreaterThan(0);
		expect(ic.costs.spent).toBeGreaterThan(0);

		console.log(
			`  factory: "${result.result.slice(0, 80)}" (total spent: $${ic.costs.spent.toFixed(4)})`,
		);
	}, 60_000);
});

describe("integration: pipeline", () => {
	it("chains two steps with context passing", async () => {
		const result = await pipeline({
			steps: [
				{
					name: "generate",
					prompt: () => "Pick a random animal. Reply with just the animal name, one word.",
				},
				{
					name: "describe",
					prompt: (ctx) =>
						`Describe a ${ctx.steps.generate.result.trim()} in exactly one sentence.`,
				},
			],
			dispatchOptions: FAST_OPTS,
		});

		expect(result.finalResult.ok).toBe(true);
		expect(result.ctx.steps.generate).toBeDefined();
		expect(result.ctx.steps.describe).toBeDefined();
		expect(result.totalCostUsd).toBeGreaterThan(0);

		console.log(`  pipeline step 1: "${result.ctx.steps.generate.result.trim()}"`);
		console.log(`  pipeline step 2: "${result.ctx.steps.describe.result.slice(0, 100)}"`);
		console.log(`  pipeline total cost: $${result.totalCostUsd.toFixed(4)}`);
	}, 120_000);
});

describe("integration: loop", () => {
	it("iterates until isDone predicate is satisfied", async () => {
		let iteration = 0;

		const result = await loop({
			prompt: (n, prior) => {
				if (!prior) return "Say the number 1. Reply with just the number.";
				const prev = Number.parseInt(prior.result.trim(), 10) || n;
				return `Say the number ${prev + 1}. Reply with just the number.`;
			},
			isDone: (r) => {
				const num = Number.parseInt(r.result.trim(), 10);
				return num >= 3;
			},
			maxIterations: 5,
			dispatchOptions: FAST_OPTS,
			onIteration: (r, n) => {
				iteration = n;
				console.log(`  loop iteration ${n}: "${r.result.trim()}" ($${r.costUsd.toFixed(4)})`);
			},
		});

		expect(result.completedNaturally).toBe(true);
		expect(result.numIterations).toBeGreaterThanOrEqual(2);
		expect(result.numIterations).toBeLessThanOrEqual(5);
		expect(result.totalCostUsd).toBeGreaterThan(0);

		console.log(
			`  loop: ${result.numIterations} iterations, $${result.totalCostUsd.toFixed(4)} total`,
		);
	}, 180_000);
});

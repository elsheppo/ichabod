/**
 * Tests for core/loop.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loop } from "../../src/core/loop.js";

const FIXTURES = join(import.meta.dirname, "../fixtures");
const SUCCESS_ENVELOPE = readFileSync(join(FIXTURES, "success-envelope.json"), "utf-8");

vi.mock("../../src/engine/spawn.js", () => ({
	spawnClaude: vi.fn(),
}));

import { spawnClaude } from "../../src/engine/spawn.js";
const mockSpawn = vi.mocked(spawnClaude);

beforeEach(() => {
	vi.clearAllMocks();
});

function makeSuccessEnvelope(result: string): string {
	return SUCCESS_ENVELOPE.replace('"4"', JSON.stringify(result));
}

describe("loop", () => {
	it("iterates until isDone returns true", async () => {
		let callCount = 0;
		mockSpawn.mockImplementation(async () => {
			callCount++;
			return {
				stdout: makeSuccessEnvelope(`attempt-${callCount}`),
				stderr: "",
				exitCode: 0,
				timedOut: false,
			};
		});

		const result = await loop({
			prompt: (n, prior) => (prior ? `Refine: ${prior.result}` : "Start"),
			isDone: (result) => result.result === "attempt-3",
			maxIterations: 10,
		});

		expect(result.numIterations).toBe(3);
		expect(result.completedNaturally).toBe(true);
		expect(result.finalResult.result).toBe("attempt-3");
	});

	it("stops at maxIterations", async () => {
		mockSpawn.mockResolvedValue({
			stdout: makeSuccessEnvelope("not done"),
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const result = await loop({
			prompt: () => "Keep trying",
			isDone: () => false, // Never done
			maxIterations: 3,
		});

		expect(result.numIterations).toBe(3);
		expect(result.completedNaturally).toBe(false);
		expect(mockSpawn).toHaveBeenCalledTimes(3);
	});

	it("passes prior result to prompt function", async () => {
		let callCount = 0;
		mockSpawn.mockImplementation(async () => {
			callCount++;
			return {
				stdout: makeSuccessEnvelope(`v${callCount}`),
				stderr: "",
				exitCode: 0,
				timedOut: false,
			};
		});

		const prompts: string[] = [];
		await loop({
			prompt: (n, prior) => {
				const p = prior ? `Refine: ${prior.result}` : "Start";
				prompts.push(p);
				return p;
			},
			isDone: (_, n) => n >= 2,
			maxIterations: 5,
		});

		expect(prompts[0]).toBe("Start");
		expect(prompts[1]).toContain("v1");
		expect(prompts[2]).toContain("v2");
	});

	it("calls onIteration callback", async () => {
		mockSpawn.mockResolvedValue({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const onIteration = vi.fn();
		await loop({
			prompt: () => "Hello",
			isDone: (_, n) => n >= 1,
			maxIterations: 5,
			onIteration,
		});

		expect(onIteration).toHaveBeenCalledTimes(2);
		expect(onIteration.mock.calls[0][1]).toBe(0); // iteration 0
		expect(onIteration.mock.calls[1][1]).toBe(1); // iteration 1
	});

	it("stops on failed dispatch", async () => {
		const errorEnvelope = readFileSync(join(FIXTURES, "error-budget-envelope.json"), "utf-8");

		mockSpawn.mockResolvedValueOnce({
			stdout: errorEnvelope,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const result = await loop({
			prompt: () => "Hello",
			isDone: () => false,
			maxIterations: 5,
		});

		expect(result.numIterations).toBe(1);
		expect(result.completedNaturally).toBe(false);
		expect(result.finalResult.ok).toBe(false);
	});

	it("accumulates total cost", async () => {
		mockSpawn.mockResolvedValue({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const result = await loop({
			prompt: () => "Hello",
			isDone: (_, n) => n >= 2,
			maxIterations: 5,
		});

		expect(result.totalCostUsd).toBeGreaterThan(0);
		expect(result.iterations).toHaveLength(3);
	});

	it("defaults to maxIterations of 10", async () => {
		mockSpawn.mockResolvedValue({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const result = await loop({
			prompt: () => "Hello",
			isDone: () => false,
		});

		expect(result.numIterations).toBe(10);
		expect(result.completedNaturally).toBe(false);
	});
});

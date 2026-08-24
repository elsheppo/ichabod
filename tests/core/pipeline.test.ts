/**
 * Tests for core/pipeline.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pipeline } from "../../src/core/pipeline.js";

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

describe("pipeline", () => {
	it("executes steps sequentially", async () => {
		const callOrder: string[] = [];

		mockSpawn.mockImplementation(async (opts) => {
			const step = opts.prompt.startsWith("Step 1") ? "step1" : "step2";
			callOrder.push(step);
			return {
				stdout: makeSuccessEnvelope(`result-${step}`),
				stderr: "",
				exitCode: 0,
				timedOut: false,
			};
		});

		const result = await pipeline({
			steps: [
				{ name: "first", prompt: () => "Step 1: analyze" },
				{
					name: "second",
					prompt: (ctx) => `Step 2: based on ${ctx.steps.first?.result}`,
				},
			],
		});

		expect(callOrder).toEqual(["step1", "step2"]);
		expect(result.ctx.steps.first.result).toBe("result-step1");
		expect(result.ctx.steps.second.result).toBe("result-step2");
		expect(result.finalResult.result).toBe("result-step2");
	});

	it("accumulates cost across steps", async () => {
		mockSpawn.mockResolvedValue({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const result = await pipeline({
			steps: [
				{ name: "a", prompt: () => "step a" },
				{ name: "b", prompt: () => "step b" },
			],
		});

		expect(result.totalCostUsd).toBeGreaterThan(0);
		expect(result.ctx.totalCostUsd).toBe(result.totalCostUsd);
	});

	it("passes context to later steps", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: makeSuccessEnvelope("analysis-output"),
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});
		mockSpawn.mockResolvedValueOnce({
			stdout: makeSuccessEnvelope("plan-output"),
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		let capturedCtx: unknown = null;

		await pipeline({
			steps: [
				{ name: "analyze", prompt: () => "Analyze" },
				{
					name: "plan",
					prompt: (ctx) => {
						capturedCtx = ctx;
						return `Plan based on: ${ctx.steps.analyze.result}`;
					},
				},
			],
		});

		expect(mockSpawn.mock.calls[1][0].prompt).toContain("analysis-output");
	});

	it("calls onStepComplete callback", async () => {
		mockSpawn.mockResolvedValue({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const onStepComplete = vi.fn();

		await pipeline({
			steps: [
				{ name: "a", prompt: () => "step a" },
				{ name: "b", prompt: () => "step b" },
			],
			onStepComplete,
		});

		expect(onStepComplete).toHaveBeenCalledTimes(2);
		expect(onStepComplete.mock.calls[0][0].name).toBe("a");
		expect(onStepComplete.mock.calls[1][0].name).toBe("b");
	});

	it("stops on failed step (fail-fast)", async () => {
		const errorEnvelope = readFileSync(join(FIXTURES, "error-budget-envelope.json"), "utf-8");

		mockSpawn.mockResolvedValueOnce({
			stdout: errorEnvelope,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const result = await pipeline({
			steps: [
				{ name: "fail", prompt: () => "this will fail" },
				{ name: "never", prompt: () => "should not run" },
			],
		});

		expect(mockSpawn).toHaveBeenCalledTimes(1);
		expect(result.finalResult.ok).toBe(false);
		expect(result.ctx.steps.never).toBeUndefined();
	});

	it("throws on empty steps", async () => {
		await expect(pipeline({ steps: [] })).rejects.toThrow("at least one step");
	});
});

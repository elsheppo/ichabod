/**
 * Tests for core/dispatch.ts
 *
 * Uses vi.mock to mock spawnClaude — no real API calls.
 * Tests the composition: throttle → retry → parse → cost tracking.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatch, dispatchWithHooks } from "../../src/core/dispatch.js";
import { createCostTracker } from "../../src/infra/cost.js";
import { createThrottle } from "../../src/infra/throttle.js";
import { BudgetExceededError } from "../../src/types.js";

const FIXTURES = join(import.meta.dirname, "../fixtures");
const SUCCESS_ENVELOPE = readFileSync(join(FIXTURES, "success-envelope.json"), "utf-8");
const ERROR_ENVELOPE = readFileSync(join(FIXTURES, "error-budget-envelope.json"), "utf-8");

// Mock spawnClaude
vi.mock("../../src/engine/spawn.js", () => ({
	spawnClaude: vi.fn(),
}));

vi.mock("../../src/process/run.js", () => ({
	runProcess: vi.fn(),
}));

import { spawnClaude } from "../../src/engine/spawn.js";
import { runProcess } from "../../src/process/run.js";
const mockSpawn = vi.mocked(spawnClaude);
const mockRunProcess = vi.mocked(runProcess);

beforeEach(() => {
	vi.clearAllMocks();
});

describe("dispatch", () => {
	it("executes a successful dispatch", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const result = await dispatch({ prompt: "What is 2+2?" });

		expect(result.ok).toBe(true);
		expect(result.result).toBe("4");
		expect(result.subtype).toBe("success");
		expect(mockSpawn).toHaveBeenCalledOnce();
	});

	it("passes correct args to spawnClaude", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		await dispatch({
			prompt: "Hello",
			model: "haiku",
			maxBudget: 1.0,
			maxTurns: 5,
		});

		const callArgs = mockSpawn.mock.calls[0][0];
		expect(callArgs.prompt).toBe("Hello");
		expect(callArgs.args).toContain("--model");
		expect(callArgs.args).toContain("haiku");
		expect(callArgs.args).toContain("--max-budget-usd");
		expect(callArgs.args).toContain("1");
		expect(callArgs.args).toContain("--max-turns");
		expect(callArgs.args).toContain("5");
	});

	it("records cost with cost tracker", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const costTracker = createCostTracker(10);
		await dispatch({ prompt: "Hello" }, { costTracker });

		expect(costTracker.spent).toBeGreaterThan(0);
	});

	it("throws BudgetExceededError when budget already exceeded", async () => {
		const costTracker = createCostTracker(0.05);
		costTracker.record(0.05); // At exact budget — next dispatch should fail

		await expect(dispatch({ prompt: "Hello" }, { costTracker })).rejects.toThrow(
			BudgetExceededError,
		);
		expect(mockSpawn).not.toHaveBeenCalled();
	});

	it("acquires and releases throttle", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const throttle = createThrottle({ maxConcurrency: 5, minDelay: 0, jitter: [0, 0] });

		await dispatch({ prompt: "Hello" }, { throttle });

		expect(throttle.active).toBe(0);
	});

	it("releases throttle even on error", async () => {
		mockSpawn.mockResolvedValue({
			stdout: "garbage",
			stderr: "",
			exitCode: 1,
			timedOut: false,
		});

		const throttle = createThrottle({ maxConcurrency: 5, minDelay: 0, jitter: [0, 0] });

		await expect(dispatch({ prompt: "Hello" }, { throttle })).rejects.toThrow();
		expect(throttle.active).toBe(0);
	});

	it("retries on rate limit", async () => {
		// First call: rate limited
		mockSpawn.mockResolvedValueOnce({
			stdout: "",
			stderr: "Error: rate limit exceeded",
			exitCode: 1,
			timedOut: false,
		});
		// Second call: success
		mockSpawn.mockResolvedValueOnce({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const result = await dispatch(
			{ prompt: "Hello" },
			{ retryConfig: { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 20 } },
		);

		expect(result.ok).toBe(true);
		expect(mockSpawn).toHaveBeenCalledTimes(2);
	});

	it("retries on timeout", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: "",
			stderr: "",
			exitCode: null,
			timedOut: true,
		});
		mockSpawn.mockResolvedValueOnce({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const result = await dispatch(
			{ prompt: "Hello" },
			{ retryConfig: { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 20 } },
		);

		expect(result.ok).toBe(true);
		expect(mockSpawn).toHaveBeenCalledTimes(2);
	});

	it("handles error subtypes without throwing", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: ERROR_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const result = await dispatch({ prompt: "Hello" });

		expect(result.ok).toBe(false);
		expect(result.subtype).toBe("error_max_budget_usd");
	});

	it("dispatches through the Codex adapter", async () => {
		mockRunProcess.mockResolvedValueOnce({
			stdout: [
				'{"type":"thread.started","thread_id":"thread-123"}',
				'{"type":"item.completed","item":{"type":"agent_message","text":"pong"}}',
				'{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}',
			].join("\n"),
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const result = await dispatch({
			prompt: "Hello",
			provider: "codex",
		});

		expect(result.ok).toBe(true);
		expect(result.result).toBe("pong");
		expect(mockRunProcess).toHaveBeenCalledOnce();
		expect(mockSpawn).not.toHaveBeenCalled();
	});

	it("merges existing settings when dispatching with hooks", async () => {
		let capturedSettings: Record<string, unknown> | null = null;

		mockSpawn.mockImplementationOnce(async (opts) => {
			const settingsIdx = opts.args.indexOf("--settings");
			const settingsPath = opts.args[settingsIdx + 1];
			capturedSettings = JSON.parse(readFileSync(settingsPath, "utf-8"));

			return {
				stdout: SUCCESS_ENVELOPE,
				stderr: "",
				exitCode: 0,
				timedOut: false,
			};
		});

		await dispatchWithHooks(
			{
				prompt: "Hello",
				settingsFile: JSON.stringify({
					disableAllHooks: false,
					model: "sonnet",
				}),
			},
			{
				Stop: [{ matcher: "", hooks: [{ type: "command", command: "cleanup.sh" }] }],
			},
		);

		expect(capturedSettings).not.toBeNull();
		expect(capturedSettings?.disableAllHooks).toBe(false);
		expect(capturedSettings?.model).toBe("sonnet");
		expect((capturedSettings?.hooks as Record<string, unknown>).Stop).toBeDefined();
	});
});

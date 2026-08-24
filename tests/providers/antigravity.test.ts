import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/process/run.js", () => ({ runProcess: vi.fn() }));

import { runProcess } from "../../src/process/run.js";
import { antigravityAdapter } from "../../src/providers/antigravity/adapter.js";

const mockRunProcess = vi.mocked(runProcess);

beforeEach(() => {
	vi.clearAllMocks();
});

describe("antigravityAdapter", () => {
	it("builds the documented agy headless invocation", async () => {
		mockRunProcess.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0, timedOut: false });

		await antigravityAdapter.spawn({
			prompt: "Return JSON",
			model: "gemini-3.1-pro",
			effort: "high",
			agent: "reviewer",
			jsonSchema: '{"type":"object"}',
			addDirs: ["/workspace/data", "/workspace/schemas"],
			resumeSessionId: "conversation-123",
			permissionMode: "acceptEdits",
			cwd: "/workspace",
			timeoutMs: 45_000,
			env: { EXAMPLE: "value" },
		});

		expect(mockRunProcess).toHaveBeenCalledWith({
			command: "agy",
			args: [
				"-p",
				"Return JSON",
				"--output-format",
				"json",
				"--model",
				"gemini-3.1-pro",
				"--effort",
				"high",
				"--agent",
				"reviewer",
				"--json-schema",
				'{"type":"object"}',
				"--add-dir",
				"/workspace/data",
				"--add-dir",
				"/workspace/schemas",
				"--conversation",
				"conversation-123",
				"--mode",
				"accept-edits",
			],
			cwd: "/workspace",
			env: { EXAMPLE: "value" },
			timeoutMs: 45_000,
		});
	});

	it("uses the continue flag for the most recent conversation", async () => {
		mockRunProcess.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0, timedOut: false });
		await antigravityAdapter.spawn({ prompt: "Continue", continueSession: true });
		expect(mockRunProcess.mock.calls[0][0].args).toContain("--continue");
	});

	it("maps plan and bypass permission modes to native agy flags", async () => {
		mockRunProcess.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0, timedOut: false });

		await antigravityAdapter.spawn({ prompt: "Plan", permissionMode: "plan" });
		expect(mockRunProcess.mock.calls[0][0].args).toContain("plan");

		await antigravityAdapter.spawn({
			prompt: "Run",
			permissionMode: "bypassPermissions",
		});
		expect(mockRunProcess.mock.calls[1][0].args).toContain("--dangerously-skip-permissions");
	});

	it("parses the documented successful JSON envelope", () => {
		const envelope = {
			conversation_id: "conversation-123",
			status: "SUCCESS",
			response: '{"answer":"pong"}\n',
			duration_seconds: 4.45,
			num_turns: 1,
			structured_output: { answer: "pong" },
			json_schema: { type: "object" },
			usage: {
				input_tokens: 10_522,
				output_tokens: 354,
				thinking_tokens: 329,
				cache_read_tokens: 8_112,
				total_tokens: 10_876,
			},
		};
		const result = antigravityAdapter.parse({
			stdout: JSON.stringify(envelope),
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		expect(result).toMatchObject({
			ok: true,
			result: '{"answer":"pong"}\n',
			sessionId: "conversation-123",
			durationMs: 4450,
			numTurns: 1,
			structuredOutput: { answer: "pong" },
			usage: {
				inputTokens: 10_522,
				outputTokens: 354,
				thinkingTokens: 329,
				cacheReadTokens: 8_112,
				totalTokens: 10_876,
			},
			rawEnvelope: envelope,
		});
	});

	it("parses a structured Antigravity error from stderr", () => {
		const result = antigravityAdapter.parse({
			stdout: "",
			stderr: JSON.stringify({
				conversation_id: "conversation-456",
				status: "ERROR",
				error: { message: "Authentication required" },
			}),
			exitCode: 1,
			timedOut: false,
		});
		expect(result.ok).toBe(false);
		expect(result.sessionId).toBe("conversation-456");
		expect(result.errors).toEqual(["Authentication required"]);
	});

	it("returns useful failures for timeouts and malformed output", () => {
		const timedOut = antigravityAdapter.parse({
			stdout: "",
			stderr: "",
			exitCode: null,
			timedOut: true,
		});
		const malformed = antigravityAdapter.parse({
			stdout: "not-json",
			stderr: "agy failed before producing an envelope",
			exitCode: 1,
			timedOut: false,
		});
		expect(timedOut.errors).toEqual(["Antigravity dispatch timed out"]);
		expect(malformed.errors).toEqual(["agy failed before producing an envelope"]);
	});

	it("rejects options that cannot be represented safely", async () => {
		await expect(
			antigravityAdapter.spawn({ prompt: "x", permissionMode: "manual" }),
		).rejects.toThrow("does not support Ichabod permission mode");
		await expect(antigravityAdapter.spawn({ prompt: "x", effort: "max" })).rejects.toThrow(
			'not "max"',
		);
		for (const options of [
			{ allowedTools: ["Read"] },
			{ tools: [] },
			{ maxTurns: 2 },
			{ noSessionPersistence: true },
		]) {
			await expect(antigravityAdapter.spawn({ prompt: "x", ...options })).rejects.toThrow(
				"does not support Ichabod option",
			);
		}
	});
});

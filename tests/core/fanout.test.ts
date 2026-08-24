import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fanout } from "../../src/core/fanout.js";
import { ParseError } from "../../src/types.js";

const FIXTURES = join(import.meta.dirname, "../fixtures");
const SUCCESS_ENVELOPE = readFileSync(join(FIXTURES, "success-envelope.json"), "utf-8");

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

function makeSuccessEnvelope(result: string): string {
	return SUCCESS_ENVELOPE.replace('"4"', JSON.stringify(result));
}

describe("fanout", () => {
	it("executes one prompt across many targets and aggregates results", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: makeSuccessEnvelope('{"answer":"claude-pong"}'),
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});
		mockRunProcess.mockResolvedValueOnce({
			stdout: [
				'{"type":"thread.started","thread_id":"thread-123"}',
				'{"type":"item.completed","item":{"type":"agent_message","text":"{\\"answer\\":\\"codex-pong\\"}"}}',
				'{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}',
			].join("\n"),
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const result = await fanout({
			prompt: "Ping",
			skipAvailabilityCheck: true,
			concurrency: 1,
			dispatchOptions: {
				jsonSchema: JSON.stringify({
					type: "object",
					properties: {
						answer: { type: "string" },
					},
					required: ["answer"],
					additionalProperties: false,
				}),
			},
			targets: [
				{
					dispatchOptions: {
						provider: "claude",
						model: "sonnet",
					},
				},
				{
					id: "codex-ping",
					label: "Codex ping",
					dispatchOptions: {
						provider: "codex",
						model: "codex-test-model",
					},
				},
			],
		});

		expect(result.targets.map((target) => target.id)).toEqual(["claude-sonnet", "codex-ping"]);
		expect(result.results[0].result?.result).toBe('{"answer":"claude-pong"}');
		expect(result.results[1].result?.result).toBe('{"answer":"codex-pong"}');
		expect(result.samples).toHaveLength(2);
		expect(result.samples[0].provider).toBe("claude");
		expect(result.samples[0].structured).toEqual({ answer: "claude-pong" });
		expect(result.samples[0].validation.status).toBe("valid");
		expect(result.samples[0].usage?.inputTokens).toBeGreaterThan(0);
		expect(result.samples[0].rawStdout).toContain('"type": "result"');
		expect(result.samples[0].outputContract?.schemaHash).toBeDefined();
		expect(result.samples[0].artifacts?.rawEnvelope).toMatchObject({
			result: '{"answer":"claude-pong"}',
		});
		expect(result.samples[1].structured).toEqual({ answer: "codex-pong" });
		expect(result.samples[1].validation.status).toBe("valid");
		expect(result.samples[1].usage).toMatchObject({ inputTokens: 10, outputTokens: 2 });
		expect(result.samples[1].rawStdout).toContain('"type":"thread.started"');
		expect(result.samples[1].artifacts?.rawEnvelope).toMatchObject({
			result: '{"answer":"codex-pong"}',
		});
		expect(result.summary.total).toBe(2);
		expect(result.summary.succeeded).toBe(2);
		expect(result.summary.failed).toBe(0);
		expect(result.summary.byProvider.claude).toBe(1);
		expect(result.summary.byProvider.codex).toBe(1);
	});

	it("captures thrown dispatch errors and continues by default", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: "not-json",
			stderr: "",
			exitCode: 1,
			timedOut: false,
		});
		mockRunProcess.mockResolvedValueOnce({
			stdout: [
				'{"type":"thread.started","thread_id":"thread-123"}',
				'{"type":"item.completed","item":{"type":"agent_message","text":"{\\"answer\\":\\"codex-pong\\"}"}}',
				'{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}',
			].join("\n"),
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const result = await fanout({
			prompt: "Ping",
			skipAvailabilityCheck: true,
			concurrency: 1,
			dispatchOptions: {
				jsonSchema: JSON.stringify({
					type: "object",
					properties: {
						answer: { type: "string" },
					},
					required: ["answer"],
				}),
			},
			targets: [
				{
					dispatchOptions: {
						provider: "claude",
						model: "sonnet",
					},
				},
				{
					dispatchOptions: {
						provider: "codex",
						model: "codex-test-model",
					},
				},
			],
		});

		expect(result.summary.failed).toBe(1);
		expect(result.results[0].error?.name).toBe("ParseError");
		expect(result.results[0].error?.message).toContain("Could not extract result envelope");
		expect(result.results[1].result?.result).toBe('{"answer":"codex-pong"}');
		expect(result.samples[0].validation.status).toBe("unparseable");
		expect(result.samples[1].validation.status).toBe("valid");
	});

	it("rejects on the first thrown execution error when stopOnError is enabled", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: "not-json",
			stderr: "",
			exitCode: 1,
			timedOut: false,
		});

		await expect(
			fanout({
				prompt: "Ping",
				skipAvailabilityCheck: true,
				stopOnError: true,
				targets: [
					{
						dispatchOptions: {
							provider: "claude",
							model: "sonnet",
						},
					},
				],
			}),
		).rejects.toThrow(ParseError);
	});
});

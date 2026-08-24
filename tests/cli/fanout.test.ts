import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProgram } from "../../src/cli.js";
import type { ExecutionSample } from "../../src/experiment/types.js";
import type { FanoutOptions, FanoutResult, ProviderTarget } from "../../src/types.js";

const TARGETS: ProviderTarget[] = [
	{
		id: "claude-sonnet",
		label: "Claude Sonnet",
		dispatchOptions: {
			provider: "claude",
			model: "sonnet",
		},
	},
	{
		id: "antigravity-default",
		label: "Antigravity (default)",
		dispatchOptions: {
			provider: "antigravity",
		},
	},
];

function makeSample(
	targetId: string,
	provider: "claude" | "antigravity",
	status: ExecutionSample["validation"]["status"],
): ExecutionSample {
	return {
		requestId: "run-1",
		sampleId: `${targetId}-sample`,
		targetId,
		provider,
		ok: true,
		text: '{"answer":"pong"}',
		structured: { answer: "pong" },
		validation: {
			status,
			errors: [],
		},
		latencyMs: 10,
		rawStdout: "",
		rawStderr: "",
	};
}

function makeFanoutResult(overrides: Partial<FanoutResult> = {}): FanoutResult {
	const samples = [
		makeSample("claude-sonnet", "claude", "valid"),
		makeSample("antigravity-default", "antigravity", "valid"),
	];

	return {
		runId: "run-1",
		targets: TARGETS,
		results: TARGETS.map((target) => ({
			target,
			result: {
				result: '{"answer":"pong"}',
				ok: true,
				subtype: "success",
				sessionId: `${target.id}-session`,
				costUsd: 0,
				durationMs: 10,
				durationApiMs: 10,
				numTurns: 1,
				usage: {
					inputTokens: 1,
					outputTokens: 1,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
				},
				modelUsage: {},
				permissionDenials: [],
				errors: [],
				structuredOutput: { answer: "pong" },
				stdout: "",
				stderr: "",
				rawEnvelope: {} as never,
			},
		})),
		samples,
		summary: {
			total: 2,
			succeeded: 2,
			failed: 0,
			byProvider: {
				claude: 1,
				antigravity: 1,
			},
			byTarget: {
				"claude-sonnet": 1,
				"antigravity-default": 1,
			},
		},
		totalCostUsd: 0,
		totalDurationMs: 20,
		...overrides,
	};
}

describe("cli fanout", () => {
	beforeEach(() => {
		process.exitCode = undefined;
	});

	it("maps CLI options into fanout options and renders summary output", async () => {
		const workspace = mkdtempSync(join(tmpdir(), "ichabod-cli-fanout-"));
		writeFileSync(join(workspace, ".env"), "AGY_TEST_TOKEN=dotenv-key\n", "utf-8");
		writeFileSync(
			join(workspace, "schema.json"),
			JSON.stringify({
				type: "object",
				properties: {
					answer: { type: "string" },
				},
				required: ["answer"],
				additionalProperties: false,
			}),
			"utf-8",
		);

		let captured: FanoutOptions | undefined;
		let stdout = "";
		let stderr = "";

		const program = buildProgram({
			cwd: () => workspace,
			env: {
				PATH: "/usr/bin",
				SHELL_ONLY: "shell-value",
			},
			listTargetCatalogsFn: () => ["structured-output-panel"],
			fanoutFn: async (options) => {
				captured = options;
				return makeFanoutResult();
			},
			stdout: {
				write(chunk: string) {
					stdout += chunk;
				},
			},
			stderr: {
				write(chunk: string) {
					stderr += chunk;
				},
			},
			existsSync,
			readFileSync,
		});

		await program.parseAsync(
			[
				"fanout",
				"Return JSON with answer=pong.",
				"--catalog",
				"structured-output-panel",
				"--json-schema",
				"schema.json",
				"--concurrency",
				"3",
				"--timeout-ms",
				"120000",
				"--max-turns",
				"2",
				"--permission-mode",
				"plan",
				"--check-availability",
			],
			{ from: "user" },
		);

		expect(captured).toMatchObject({
			prompt: "Return JSON with answer=pong.",
			targets: ["structured-output-panel"],
			concurrency: 3,
			skipAvailabilityCheck: false,
			dispatchOptions: {
				maxTurns: 2,
				timeoutMs: 120000,
				permissionMode: "plan",
			},
		});
		expect(captured?.dispatchOptions?.jsonSchema).toContain('"answer"');
		expect(captured?.dispatchOptions?.env).toMatchObject({
			AGY_TEST_TOKEN: "dotenv-key",
			SHELL_ONLY: "shell-value",
		});
		expect(stdout).toContain("Targets: 2 | succeeded=2 | failed=0");
		expect(stdout).toContain("claude-sonnet | ok=yes | provider=claude | validation=valid");
		expect(stderr).toBe("");
		expect(process.exitCode).toBe(0);
	});

	it("emits JSON and exits non-zero when fanout reports failed targets", async () => {
		let stdout = "";
		let stderr = "";

		const program = buildProgram({
			fanoutFn: async () =>
				makeFanoutResult({
					results: [
						{
							target: TARGETS[0],
							error: {
								name: "ParseError",
								message: "Could not parse output",
							},
						},
						{
							target: TARGETS[1],
							result: makeFanoutResult().results[1].result,
						},
					],
					summary: {
						total: 2,
						succeeded: 1,
						failed: 1,
						byProvider: {
							claude: 1,
							antigravity: 1,
						},
						byTarget: {
							"claude-sonnet": 1,
							"antigravity-default": 1,
						},
					},
				}),
			stdout: {
				write(chunk: string) {
					stdout += chunk;
				},
			},
			stderr: {
				write(chunk: string) {
					stderr += chunk;
				},
			},
		});

		await program.parseAsync(["fanout", "Reply with pong.", "--format", "json"], {
			from: "user",
		});

		expect(JSON.parse(stdout)).toMatchObject({
			summary: {
				failed: 1,
			},
		});
		expect(stderr).toBe("");
		expect(process.exitCode).toBe(1);
	});
});

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProgram } from "../../src/cli.js";
import type { ExecutionSample } from "../../src/experiment/types.js";
import type {
	FanoutOptions,
	FanoutResult,
	ProviderTarget,
	SweepOptions,
	SweepResult,
} from "../../src/types.js";

const TARGETS: ProviderTarget[] = [
	{
		id: "claude-sonnet",
		label: "Claude Sonnet",
		dispatchOptions: {
			provider: "claude",
			model: "sonnet",
		},
	},
];

function makeSample(): ExecutionSample {
	return {
		requestId: "run-1",
		sampleId: "sample-1",
		targetId: "claude-sonnet",
		provider: "claude",
		ok: true,
		text: '{"answer":"pong"}',
		structured: { answer: "pong" },
		validation: {
			status: "valid",
			errors: [],
		},
		latencyMs: 10,
		rawStdout: "",
		rawStderr: "",
	};
}

function makeFanoutResult(): FanoutResult {
	return {
		runId: "run-1",
		targets: TARGETS,
		results: [
			{
				target: TARGETS[0],
				result: {
					result: '{"answer":"pong"}',
					ok: true,
					subtype: "success",
					sessionId: "session-1",
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
			},
		],
		samples: [makeSample()],
		summary: {
			total: 1,
			succeeded: 1,
			failed: 0,
			byProvider: {
				claude: 1,
			},
			byTarget: {
				"claude-sonnet": 1,
			},
		},
		totalCostUsd: 0,
		totalDurationMs: 10,
	};
}

function makeSweepResult(): SweepResult {
	return {
		runId: "sweep-run-1",
		outputDir: "/tmp/runs/sweep-run-1",
		variants: [
			{
				contract: {
					name: "structured-output",
					jsonSchema: {
						type: "object",
						properties: {
							answer: { type: "string" },
						},
						required: ["answer"],
						additionalProperties: false,
					},
					source: {
						kind: "json-schema",
						schemaHash: "schema-hash",
					},
				},
				descriptor: {
					variantId: "base:base:seed:schemahash",
					kind: "base",
					name: "base",
					seed: "seed",
					schemaHash: "schema-hash",
					diffSummary: ["base schema with no perturbation"],
				},
			},
		],
		cells: [],
		samples: [],
		summary: {
			totalCells: 1,
			totalSamples: 1,
			valid: 0,
			invalid: 1,
			unparseable: 0,
			byProvider: {
				claude: 1,
			},
			byVariant: {
				"base:base:seed:schemahash": 1,
			},
		},
	};
}

describe("cli run", () => {
	beforeEach(() => {
		process.exitCode = undefined;
	});

	it("executes function recipes against the recipe API and renders a summary", async () => {
		const workspace = mkdtempSync(join(tmpdir(), "ichabod-cli-run-"));
		const recipePath = join(workspace, "fanout-recipe.ts");
		writeFileSync(
			recipePath,
			[
				"export default async function run(api: any) {",
				'  return await api.fanout({ prompt: "Ping", targets: ["frontier-all"] });',
				"}",
			].join("\n"),
			"utf-8",
		);

		let captured: FanoutOptions | undefined;
		let stdout = "";
		let stderr = "";

		const program = buildProgram({
			cwd: () => workspace,
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
		});

		await program.parseAsync(["run", "fanout-recipe.ts"], { from: "user" });

		expect(captured).toMatchObject({
			prompt: "Ping",
			targets: ["frontier-all"],
		});
		expect(stdout).toContain("Targets: 1 | succeeded=1 | failed=0");
		expect(stderr).toBe("");
		expect(process.exitCode).toBe(0);
	});

	it("executes declarative sweep recipes and emits JSON output", async () => {
		const workspace = mkdtempSync(join(tmpdir(), "ichabod-cli-run-"));
		const recipePath = join(workspace, "sweep-recipe.ts");
		writeFileSync(
			recipePath,
			[
				"export default {",
				'  kind: "sweep",',
				"  options: {",
				'    prompts: ["Ping"],',
				'    schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false },',
				'    targets: ["frontier-all"],',
				"    store: false,",
				"  },",
				"};",
			].join("\n"),
			"utf-8",
		);

		let captured: SweepOptions | undefined;
		let stdout = "";
		let stderr = "";

		const program = buildProgram({
			cwd: () => workspace,
			sweepFn: async (options) => {
				captured = options;
				return makeSweepResult();
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
		});

		await program.parseAsync(["run", "sweep-recipe.ts", "--format", "json"], {
			from: "user",
		});

		expect(captured).toMatchObject({
			prompts: ["Ping"],
			targets: ["frontier-all"],
			store: false,
		});
		expect(JSON.parse(stdout)).toMatchObject({
			summary: {
				invalid: 1,
			},
		});
		expect(stderr).toBe("");
		expect(process.exitCode).toBe(1);
	});
});

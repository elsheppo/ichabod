import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProgram } from "../../src/cli.js";
import type { SweepOptions, SweepResult } from "../../src/types.js";

function makeSweepResult(overrides: Partial<SweepResult> = {}): SweepResult {
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
			totalSamples: 2,
			valid: 2,
			invalid: 0,
			unparseable: 0,
			byProvider: {
				claude: 1,
				antigravity: 1,
			},
			byVariant: {
				"base:base:seed:schemahash": 2,
			},
		},
		...overrides,
	};
}

describe("cli sweep", () => {
	beforeEach(() => {
		process.exitCode = undefined;
	});

	it("maps CLI options into sweep options and renders summary output", async () => {
		const workspace = mkdtempSync(join(tmpdir(), "ichabod-cli-sweep-"));
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

		let captured: SweepOptions | undefined;
		let stdout = "";
		let stderr = "";

		const program = buildProgram({
			cwd: () => workspace,
			listTargetCatalogsFn: () => ["structured-output-panel"],
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
			existsSync,
			readFileSync,
		});

		await program.parseAsync(
			[
				"sweep",
				"Return JSON with answer=pong.",
				"--schema",
				"schema.json",
				"--catalog",
				"structured-output-panel",
				"--variant-kind",
				"docs-only",
				"--variant-kind",
				"naming",
				"--seed",
				"cli-seed",
				"--replicates",
				"2",
				"--cell-concurrency",
				"2",
				"--target-concurrency",
				"3",
				"--no-store",
			],
			{ from: "user" },
		);

		expect(captured).toMatchObject({
			prompts: ["Return JSON with answer=pong."],
			targets: ["structured-output-panel"],
			replicates: 2,
			cellConcurrency: 2,
			targetConcurrency: 3,
			skipAvailabilityCheck: true,
			store: false,
			variants: {
				seed: "cli-seed",
				kinds: ["docs-only", "naming"],
			},
		});
		expect(captured?.schema).toContain('"answer"');
		expect(stdout).toContain("Cells: 1 | samples=2 | valid=2 | invalid=0 | unparseable=0");
		expect(stdout).toContain("Output: /tmp/runs/sweep-run-1");
		expect(stderr).toBe("");
		expect(process.exitCode).toBe(0);
	});

	it("emits JSON and exits non-zero when sweep finds invalid samples", async () => {
		let stdout = "";
		let stderr = "";

		const program = buildProgram({
			sweepFn: async () =>
				makeSweepResult({
					summary: {
						totalCells: 1,
						totalSamples: 2,
						valid: 1,
						invalid: 1,
						unparseable: 0,
						byProvider: {
							claude: 1,
							antigravity: 1,
						},
						byVariant: {
							"base:base:seed:schemahash": 2,
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

		await program.parseAsync(
			[
				"sweep",
				"Return JSON with answer=pong.",
				"--schema",
				JSON.stringify({
					type: "object",
					properties: {
						answer: { type: "string" },
					},
					required: ["answer"],
					additionalProperties: false,
				}),
				"--format",
				"json",
				"--no-store",
			],
			{ from: "user" },
		);

		expect(JSON.parse(stdout)).toMatchObject({
			summary: {
				invalid: 1,
			},
		});
		expect(stderr).toBe("");
		expect(process.exitCode).toBe(1);
	});
});

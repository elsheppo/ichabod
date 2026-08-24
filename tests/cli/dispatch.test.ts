import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProgram } from "../../src/cli.js";
import type { DispatchOptions, DispatchResult } from "../../src/types.js";

function makeResult(overrides: Partial<DispatchResult> = {}): DispatchResult {
	return {
		result: "pong",
		ok: true,
		subtype: "success",
		sessionId: "session-1",
		costUsd: 0,
		durationMs: 1,
		durationApiMs: 1,
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
		stdout: "pong",
		stderr: "",
		rawEnvelope: {} as DispatchResult["rawEnvelope"],
		...overrides,
	};
}

describe("cli dispatch", () => {
	beforeEach(() => {
		process.exitCode = undefined;
	});

	it("dispatches with parsed options and default dotenv loading", async () => {
		const workspace = mkdtempSync(join(tmpdir(), "ichabod-cli-"));
		writeFileSync(join(workspace, ".env"), 'AGY_TEST_TOKEN="dotenv-key"\n');
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

		let capturedOptions: DispatchOptions | undefined;
		let stdout = "";
		let stderr = "";

		const program = buildProgram({
			cwd: () => workspace,
			env: {
				PATH: "/usr/bin",
				SHELL_ONLY: "shell-value",
			},
			dispatchFn: async (options) => {
				capturedOptions = options;
				return makeResult({
					structuredOutput: { answer: "pong" },
				});
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
				"dispatch",
				"Return a JSON object with answer=pong.",
				"--provider",
				"antigravity",
				"--model",
				"antigravity-model",
				"--json-schema",
				"schema.json",
				"--max-turns",
				"3",
				"--timeout-ms",
				"120000",
				"--permission-mode",
				"plan",
				"--add-dir",
				"src",
				"--add-dir",
				"tests",
				"--cwd",
				"/tmp/project",
			],
			{ from: "user" },
		);

		expect(capturedOptions).toMatchObject({
			prompt: "Return a JSON object with answer=pong.",
			provider: "antigravity",
			model: "antigravity-model",
			maxTurns: 3,
			timeoutMs: 120000,
			permissionMode: "plan",
			cwd: "/tmp/project",
			addDirs: ["src", "tests"],
		});
		expect(capturedOptions?.jsonSchema).toContain('"answer"');
		expect(capturedOptions?.env).toMatchObject({
			AGY_TEST_TOKEN: "dotenv-key",
			SHELL_ONLY: "shell-value",
		});
		expect(JSON.parse(stdout)).toMatchObject({
			ok: true,
			structuredOutput: { answer: "pong" },
		});
		expect(stderr).toBe("");
		expect(process.exitCode).toBe(0);
	});

	it("prints structured output in text mode when present", async () => {
		let stdout = "";
		let stderr = "";

		const program = buildProgram({
			dispatchFn: async () =>
				makeResult({
					result: "",
					structuredOutput: { answer: "pong" },
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
				"dispatch",
				"Return a JSON object with answer=pong.",
				"--provider",
				"claude",
				"--format",
				"text",
			],
			{ from: "user" },
		);

		expect(stdout).toBe('{\n  "answer": "pong"\n}\n');
		expect(stderr).toBe("");
		expect(process.exitCode).toBe(0);
	});

	it("prints a useful error and exits non-zero when dispatch throws", async () => {
		let stdout = "";
		let stderr = "";

		const program = buildProgram({
			dispatchFn: async () => {
				throw new Error("boom");
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

		await program.parseAsync(["dispatch", "Reply with pong.", "--provider", "codex"], {
			from: "user",
		});

		expect(stdout).toBe("");
		expect(stderr).toContain("boom");
		expect(process.exitCode).toBe(1);
	});
});

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupHooksFile } from "../../infra/hooks.js";
import { runProcess } from "../../process/run.js";
import type {
	ClaudeJsonEnvelope,
	DispatchOptions,
	DispatchResult,
	SpawnResult,
} from "../../types.js";
import type { ProviderAdapter } from "../types.js";

export const codexAdapter: ProviderAdapter = {
	id: "codex",

	async spawn(options: DispatchOptions): Promise<SpawnResult> {
		const args = ["exec", "--json"];
		const tempFiles: string[] = [];

		try {
			if (options.model) {
				args.push("--model", options.model);
			}

			if (options.cwd) {
				args.push("--cd", options.cwd);
			}

			if (options.addDirs?.length) {
				for (const dir of options.addDirs) {
					args.push("--add-dir", dir);
				}
			}

			if (options.jsonSchema) {
				const schemaPath = writeTempFile("ichabod-codex-schema", ".json", options.jsonSchema);
				tempFiles.push(schemaPath);
				args.push("--output-schema", schemaPath);
			}

			args.push(options.prompt);

			return await runProcess({
				command: "codex",
				args,
				cwd: options.cwd,
				env: options.env,
				timeoutMs: options.timeoutMs,
			});
		} finally {
			for (const path of tempFiles) {
				cleanupHooksFile(path);
			}
		}
	},

	parse(spawn: SpawnResult): DispatchResult {
		if (spawn.timedOut) {
			return makeSyntheticResult({
				result: "",
				ok: false,
				subtype: "error_during_execution",
				sessionId: "",
				errors: ["Dispatch timed out"],
				stdout: spawn.stdout,
				stderr: spawn.stderr,
			});
		}

		const parsed = parseCodexJsonl(spawn.stdout);
		if (parsed.error) {
			return makeSyntheticResult({
				result: parsed.message ?? "",
				ok: false,
				subtype: "error_during_execution",
				sessionId: parsed.threadId ?? "",
				errors: [parsed.error],
				stdout: spawn.stdout,
				stderr: spawn.stderr,
				durationMs: parsed.durationMs ?? 0,
				usage: parsed.usage,
			});
		}

		return makeSyntheticResult({
			result: parsed.message ?? "",
			ok: true,
			subtype: "success",
			sessionId: parsed.threadId ?? "",
			errors: [],
			stdout: spawn.stdout,
			stderr: spawn.stderr,
			durationMs: parsed.durationMs ?? 0,
			usage: parsed.usage,
		});
	},
};

interface ParsedCodexStream {
	threadId?: string;
	message?: string;
	error?: string;
	durationMs?: number;
	usage?: {
		inputTokens: number;
		outputTokens: number;
		cacheCreationTokens: number;
		cacheReadTokens: number;
	};
}

function parseCodexJsonl(stdout: string): ParsedCodexStream {
	const lines = stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	const parsed: ParsedCodexStream = {};

	for (const line of lines) {
		const event = tryParseJson(line);
		if (!event || typeof event !== "object" || event === null) {
			continue;
		}

		const record = event as Record<string, unknown>;
		if (record.type === "thread.started" && typeof record.thread_id === "string") {
			parsed.threadId = record.thread_id;
			continue;
		}

		if (record.type === "item.completed") {
			const item = record.item as Record<string, unknown> | undefined;
			if (item?.type === "agent_message" && typeof item.text === "string") {
				parsed.message = item.text;
			}
			continue;
		}

		if (record.type === "turn.completed") {
			const usage = record.usage as Record<string, unknown> | undefined;
			parsed.usage = {
				inputTokens: readNumber(usage?.input_tokens),
				outputTokens: readNumber(usage?.output_tokens),
				cacheCreationTokens: 0,
				cacheReadTokens: readNumber(usage?.cached_input_tokens),
			};
			continue;
		}

		if (record.type === "error" && typeof record.message === "string") {
			parsed.error = record.message;
		}
	}

	if (!parsed.message && !parsed.error) {
		parsed.error = "Could not parse Codex JSONL output";
	}

	return parsed;
}

function makeSyntheticResult(input: {
	result: string;
	ok: boolean;
	subtype: DispatchResult["subtype"];
	sessionId: string;
	errors: string[];
	stdout: string;
	stderr: string;
	durationMs?: number;
	usage?: {
		inputTokens: number;
		outputTokens: number;
		cacheCreationTokens: number;
		cacheReadTokens: number;
	};
}): DispatchResult {
	const usage = input.usage ?? {
		inputTokens: 0,
		outputTokens: 0,
		cacheCreationTokens: 0,
		cacheReadTokens: 0,
	};

	const rawEnvelope: ClaudeJsonEnvelope = {
		type: "result",
		subtype: input.subtype,
		is_error: !input.ok,
		duration_ms: input.durationMs ?? 0,
		duration_api_ms: input.durationMs ?? 0,
		num_turns: 1,
		result: input.result,
		session_id: input.sessionId,
		total_cost_usd: 0,
		usage: {
			input_tokens: usage.inputTokens,
			cache_creation_input_tokens: usage.cacheCreationTokens,
			cache_read_input_tokens: usage.cacheReadTokens,
			output_tokens: usage.outputTokens,
			server_tool_use: {
				web_search_requests: 0,
				web_fetch_requests: 0,
			},
			service_tier: "unknown",
			cache_creation: {
				ephemeral_1h_input_tokens: 0,
				ephemeral_5m_input_tokens: 0,
			},
		},
		modelUsage: {},
		permission_denials: [],
		uuid: "",
		errors: input.errors,
	};

	return {
		result: input.result,
		ok: input.ok,
		subtype: input.subtype,
		sessionId: input.sessionId,
		costUsd: 0,
		durationMs: input.durationMs ?? 0,
		durationApiMs: input.durationMs ?? 0,
		numTurns: 1,
		usage,
		modelUsage: {},
		permissionDenials: [],
		errors: input.errors,
		stdout: input.stdout,
		stderr: input.stderr,
		rawEnvelope,
	};
}

function writeTempFile(prefix: string, extension: string, contents: string): string {
	const path = join(tmpdir(), `${prefix}-${randomUUID()}${extension}`);
	writeFileSync(path, contents, "utf-8");
	return path;
}

function tryParseJson(text: string): unknown | null {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function readNumber(value: unknown): number {
	return typeof value === "number" ? value : 0;
}

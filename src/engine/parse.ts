/**
 * engine/parse.ts — JSON envelope parsing and normalization.
 *
 * Handles the messiness between raw `claude -p --output-format json` output
 * and the clean {@link DispatchResult} that user code works with.
 *
 * Known output patterns from Claude CLI:
 * 1. Clean JSON: `{"type":"result","subtype":"success",...}`
 * 2. JSON inside markdown fences: ````json\n{...}\n````
 * 3. Multiple JSON objects (init system message + result) — we want the last one
 * 4. Garbage prefix/suffix around JSON (debug output, warnings)
 * 5. Complete garbage (crash, binary not found, etc.)
 */

import {
	type ClaudeJsonEnvelope,
	type DispatchResult,
	ParseError,
	type SpawnResult,
} from "../types.js";

/**
 * Parse raw spawn output into a normalized DispatchResult.
 * This is the main entry point for the parse layer.
 */
export function toDispatchResult(spawn: SpawnResult): DispatchResult {
	if (spawn.timedOut) {
		// Construct a synthetic result for timeouts
		return {
			result: "",
			ok: false,
			subtype: "error_during_execution",
			sessionId: "",
			costUsd: 0,
			durationMs: 0,
			durationApiMs: 0,
			numTurns: 0,
			usage: {
				inputTokens: 0,
				outputTokens: 0,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
			},
			modelUsage: {},
			permissionDenials: [],
			errors: ["Dispatch timed out"],
			stdout: spawn.stdout,
			stderr: spawn.stderr,
			rawEnvelope: {
				type: "result",
				subtype: "error_during_execution",
				is_error: true,
				duration_ms: 0,
				duration_api_ms: 0,
				num_turns: 0,
				session_id: "",
				total_cost_usd: 0,
				usage: {
					input_tokens: 0,
					cache_creation_input_tokens: 0,
					cache_read_input_tokens: 0,
					output_tokens: 0,
					server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
					service_tier: "unknown",
					cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
				},
				modelUsage: {},
				permission_denials: [],
				uuid: "",
				errors: ["Dispatch timed out"],
			},
		};
	}

	const envelope = parseEnvelope(spawn.stdout, spawn.stderr);

	return {
		result: envelope.result ?? "",
		ok: envelope.subtype === "success",
		subtype: envelope.subtype,
		sessionId: envelope.session_id,
		costUsd: envelope.total_cost_usd,
		durationMs: envelope.duration_ms,
		durationApiMs: envelope.duration_api_ms,
		numTurns: envelope.num_turns,
		usage: {
			inputTokens: envelope.usage.input_tokens,
			outputTokens: envelope.usage.output_tokens,
			cacheCreationTokens: envelope.usage.cache_creation_input_tokens,
			cacheReadTokens: envelope.usage.cache_read_input_tokens,
		},
		modelUsage: envelope.modelUsage,
		permissionDenials: envelope.permission_denials,
		errors: envelope.errors ?? [],
		structuredOutput: envelope.structured_output,
		stdout: spawn.stdout,
		stderr: spawn.stderr,
		rawEnvelope: envelope,
	};
}

/**
 * Extract and parse the JSON envelope from stdout.
 *
 * Strategy:
 * 1. Try the full stdout as JSON (most common case)
 * 2. Strip markdown fences and try again
 * 3. Find the last JSON object that looks like a result envelope
 * 4. Give up with ParseError
 */
export function parseEnvelope(stdout: string, stderr: string): ClaudeJsonEnvelope {
	const trimmed = stdout.trim();

	if (!trimmed) {
		throw new ParseError("Empty stdout from Claude process", stdout, stderr);
	}

	// Strategy 1: Direct parse
	const direct = tryParseJson(trimmed);
	if (direct && isResultEnvelope(direct)) {
		return direct as ClaudeJsonEnvelope;
	}

	// Strategy 2: Strip markdown fences
	const stripped = stripMarkdownFences(trimmed);
	if (stripped !== trimmed) {
		const fenced = tryParseJson(stripped);
		if (fenced && isResultEnvelope(fenced)) {
			return fenced as ClaudeJsonEnvelope;
		}
	}

	// Strategy 3: Find buried JSON — scan for last `{"type":"result"` object
	const buried = extractBuriedJson(trimmed);
	if (buried) {
		return buried;
	}

	throw new ParseError("Could not extract result envelope from Claude output", stdout, stderr);
}

/**
 * Strip markdown code fences from around JSON.
 *
 * Handles:
 * - ````json\n...\n````
 * - ````\n...\n````
 * - ```json\n...\n```
 */
export function stripMarkdownFences(text: string): string {
	// Match ``` or ```` with optional language tag
	const fencePattern = /^`{3,}(?:json)?\s*\n([\s\S]*?)\n`{3,}\s*$/;
	const match = text.match(fencePattern);
	return match ? match[1].trim() : text;
}

/**
 * Find the last JSON object in text that looks like a Claude result envelope.
 *
 * Claude's `--output-format json` can emit multiple JSON objects
 * (e.g., a system init message followed by the result). We want the
 * last one with `"type":"result"`.
 */
export function extractBuriedJson(text: string): ClaudeJsonEnvelope | null {
	// Find all potential JSON objects by matching balanced braces
	const candidates: string[] = [];
	let depth = 0;
	let start = -1;

	for (let i = 0; i < text.length; i++) {
		if (text[i] === "{") {
			if (depth === 0) start = i;
			depth++;
		} else if (text[i] === "}") {
			depth--;
			if (depth === 0 && start >= 0) {
				candidates.push(text.slice(start, i + 1));
				start = -1;
			}
		}
	}

	// Try from last to first — we want the result envelope, not init messages
	for (let i = candidates.length - 1; i >= 0; i--) {
		const parsed = tryParseJson(candidates[i]);
		if (parsed && isResultEnvelope(parsed)) {
			return parsed as ClaudeJsonEnvelope;
		}
	}

	return null;
}

/**
 * Type guard: does this look like a Claude result envelope?
 */
function isResultEnvelope(obj: unknown): boolean {
	if (typeof obj !== "object" || obj === null) return false;
	const record = obj as Record<string, unknown>;
	return record.type === "result" && typeof record.subtype === "string";
}

/**
 * Safe JSON parse — returns null instead of throwing.
 */
function tryParseJson(text: string): unknown | null {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

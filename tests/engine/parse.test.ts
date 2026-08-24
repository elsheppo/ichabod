/**
 * Tests for engine/parse.ts
 *
 * Fixture-based: uses real Claude response JSON captured from `claude -p --output-format json`.
 * Also tests edge cases: fenced JSON, buried JSON, malformed output, empty output.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	extractBuriedJson,
	parseEnvelope,
	stripMarkdownFences,
	toDispatchResult,
} from "../../src/engine/parse.js";
import { ParseError } from "../../src/types.js";

const FIXTURES = join(import.meta.dirname, "../fixtures");

function loadFixture(name: string): string {
	return readFileSync(join(FIXTURES, name), "utf-8");
}

describe("parseEnvelope", () => {
	it("parses a real success envelope", () => {
		const raw = loadFixture("success-envelope.json");
		const envelope = parseEnvelope(raw, "");

		expect(envelope.type).toBe("result");
		expect(envelope.subtype).toBe("success");
		expect(envelope.is_error).toBe(false);
		expect(envelope.result).toBe("4");
		expect(envelope.session_id).toBe("cadc95ad-cf30-4cc0-acfb-e5aae317acd1");
		expect(envelope.total_cost_usd).toBeCloseTo(0.0795, 3);
		expect(envelope.usage.output_tokens).toBe(5);
		expect(envelope.modelUsage["claude-haiku-4-5-20251001"]).toBeDefined();
	});

	it("parses a real budget error envelope", () => {
		const raw = loadFixture("error-budget-envelope.json");
		const envelope = parseEnvelope(raw, "");

		expect(envelope.type).toBe("result");
		expect(envelope.subtype).toBe("error_max_budget_usd");
		// Note: is_error is false even on budget errors — this is real Claude behavior
		expect(envelope.is_error).toBe(false);
		expect(envelope.errors).toEqual([]);
	});

	it("parses JSON wrapped in markdown fences", () => {
		const raw = loadFixture("success-envelope.json");
		const fenced = `\`\`\`json\n${raw}\n\`\`\``;
		const envelope = parseEnvelope(fenced, "");

		expect(envelope.subtype).toBe("success");
		expect(envelope.result).toBe("4");
	});

	it("extracts result envelope from multi-object output", () => {
		const initMsg = '{"type":"system","subtype":"init","session_id":"abc"}';
		const resultMsg = loadFixture("success-envelope.json");
		const combined = `${initMsg}\n${resultMsg}`;
		const envelope = parseEnvelope(combined, "");

		expect(envelope.type).toBe("result");
		expect(envelope.subtype).toBe("success");
	});

	it("throws ParseError on empty stdout", () => {
		expect(() => parseEnvelope("", "some stderr")).toThrow(ParseError);
	});

	it("throws ParseError on non-JSON garbage", () => {
		expect(() => parseEnvelope("Error: something went wrong", "")).toThrow(ParseError);
	});

	it("throws ParseError on valid JSON that is not a result envelope", () => {
		expect(() => parseEnvelope('{"type":"system","subtype":"init"}', "")).toThrow(ParseError);
	});
});

describe("toDispatchResult", () => {
	it("normalizes a success spawn result", () => {
		const raw = loadFixture("success-envelope.json");
		const result = toDispatchResult({
			stdout: raw,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		expect(result.ok).toBe(true);
		expect(result.result).toBe("4");
		expect(result.subtype).toBe("success");
		expect(result.sessionId).toBe("cadc95ad-cf30-4cc0-acfb-e5aae317acd1");
		expect(result.costUsd).toBeCloseTo(0.0795, 3);
		expect(result.usage.outputTokens).toBe(5);
		expect(result.errors).toEqual([]);
		expect(result.stdout).toBe(raw);
		expect(result.rawEnvelope).toBeDefined();
	});

	it("normalizes a budget error spawn result", () => {
		const raw = loadFixture("error-budget-envelope.json");
		const result = toDispatchResult({
			stdout: raw,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		expect(result.ok).toBe(false);
		expect(result.subtype).toBe("error_max_budget_usd");
		expect(result.result).toBe("");
	});

	it("produces synthetic result for timed-out dispatch", () => {
		const result = toDispatchResult({
			stdout: "",
			stderr: "Process killed by timeout",
			exitCode: null,
			timedOut: true,
		});

		expect(result.ok).toBe(false);
		expect(result.errors).toContain("Dispatch timed out");
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("Process killed by timeout");
		expect(result.costUsd).toBe(0);
	});

	it("preserves stderr in result", () => {
		const raw = loadFixture("success-envelope.json");
		const result = toDispatchResult({
			stdout: raw,
			stderr: "MCP server connected\nHook executed",
			exitCode: 0,
			timedOut: false,
		});

		expect(result.stderr).toBe("MCP server connected\nHook executed");
	});
});

describe("stripMarkdownFences", () => {
	it("strips triple backtick fences with json tag", () => {
		const input = '```json\n{"key": "value"}\n```';
		expect(stripMarkdownFences(input)).toBe('{"key": "value"}');
	});

	it("strips triple backtick fences without tag", () => {
		const input = '```\n{"key": "value"}\n```';
		expect(stripMarkdownFences(input)).toBe('{"key": "value"}');
	});

	it("strips quadruple backtick fences", () => {
		const input = '````json\n{"key": "value"}\n````';
		expect(stripMarkdownFences(input)).toBe('{"key": "value"}');
	});

	it("returns original text when no fences present", () => {
		const input = '{"key": "value"}';
		expect(stripMarkdownFences(input)).toBe(input);
	});

	it("returns original text for partial fences", () => {
		const input = '```json\n{"key": "value"}';
		expect(stripMarkdownFences(input)).toBe(input);
	});
});

describe("extractBuriedJson", () => {
	it("finds result envelope in mixed text", () => {
		const text = `Some debug output
{"type":"system","subtype":"init"}
More output
{"type":"result","subtype":"success","is_error":false,"duration_ms":100,"duration_api_ms":80,"num_turns":1,"result":"hello","session_id":"abc","total_cost_usd":0.01,"usage":{"input_tokens":10,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":5,"server_tool_use":{"web_search_requests":0,"web_fetch_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0}},"modelUsage":{},"permission_denials":[],"uuid":"xyz"}
Trailing output`;

		const result = extractBuriedJson(text);
		expect(result).not.toBeNull();
		expect(result?.subtype).toBe("success");
		expect(result?.result).toBe("hello");
	});

	it("returns null when no result envelope found", () => {
		const text = '{"type":"system","subtype":"init"}\nsome other text';
		expect(extractBuriedJson(text)).toBeNull();
	});

	it("returns null for empty text", () => {
		expect(extractBuriedJson("")).toBeNull();
	});

	it("prefers the last result envelope when multiple exist", () => {
		const first =
			'{"type":"result","subtype":"success","is_error":false,"duration_ms":100,"duration_api_ms":80,"num_turns":1,"result":"first","session_id":"a","total_cost_usd":0.01,"usage":{"input_tokens":10,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":5,"server_tool_use":{"web_search_requests":0,"web_fetch_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0}},"modelUsage":{},"permission_denials":[],"uuid":"x"}';
		const second = first.replace('"first"', '"second"').replace('"a"', '"b"');
		const text = `${first}\n${second}`;

		const result = extractBuriedJson(text);
		expect(result?.result).toBe("second");
	});
});

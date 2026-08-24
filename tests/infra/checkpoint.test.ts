/**
 * Tests for infra/checkpoint.ts
 */

import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	loadCheckpoint,
	loadCheckpointEntries,
	saveCheckpoint,
} from "../../src/infra/checkpoint.js";
import type { DispatchResult } from "../../src/types.js";

function tmpPath(): string {
	return join(tmpdir(), `ichabod-test-${randomUUID()}.ndjson`);
}

function makeFakeResult(result = "ok"): DispatchResult {
	return {
		result,
		ok: true,
		subtype: "success",
		sessionId: "test-session",
		costUsd: 0.01,
		durationMs: 100,
		durationApiMs: 80,
		numTurns: 1,
		usage: { inputTokens: 10, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 0 },
		modelUsage: {},
		permissionDenials: [],
		errors: [],
		stdout: result,
		stderr: "",
		rawEnvelope: {} as DispatchResult["rawEnvelope"],
	};
}

const tempFiles: string[] = [];

afterEach(() => {
	for (const f of tempFiles) {
		try {
			if (existsSync(f)) unlinkSync(f);
		} catch {
			/* ignore */
		}
	}
	tempFiles.length = 0;
});

describe("loadCheckpoint", () => {
	it("returns empty set for non-existent file", () => {
		expect(loadCheckpoint(`/tmp/does-not-exist-${randomUUID()}`)).toEqual(new Set());
	});

	it("loads completed indices", () => {
		const path = tmpPath();
		tempFiles.push(path);
		writeFileSync(
			path,
			`${[
				JSON.stringify({ index: 0, completedAt: "2026-01-01T00:00:00Z", result: makeFakeResult() }),
				JSON.stringify({ index: 2, completedAt: "2026-01-01T00:00:01Z", result: makeFakeResult() }),
			].join("\n")}\n`,
		);

		const completed = loadCheckpoint(path);
		expect(completed).toEqual(new Set([0, 2]));
	});

	it("skips malformed lines", () => {
		const path = tmpPath();
		tempFiles.push(path);
		writeFileSync(
			path,
			`${[
				JSON.stringify({ index: 0, completedAt: "2026-01-01T00:00:00Z", result: makeFakeResult() }),
				"this is not json",
				JSON.stringify({ index: 3, completedAt: "2026-01-01T00:00:02Z", result: makeFakeResult() }),
			].join("\n")}\n`,
		);

		const completed = loadCheckpoint(path);
		expect(completed).toEqual(new Set([0, 3]));
	});
});

describe("saveCheckpoint", () => {
	it("appends to checkpoint file", () => {
		const path = tmpPath();
		tempFiles.push(path);

		saveCheckpoint(path, 0, makeFakeResult("first"));
		saveCheckpoint(path, 1, makeFakeResult("second"));

		const entries = loadCheckpointEntries(path);
		expect(entries).toHaveLength(2);
		expect(entries[0].index).toBe(0);
		expect(entries[0].result.result).toBe("first");
		expect(entries[1].index).toBe(1);
		expect(entries[1].result.result).toBe("second");
	});

	it("creates file if it does not exist", () => {
		const path = tmpPath();
		tempFiles.push(path);
		expect(existsSync(path)).toBe(false);

		saveCheckpoint(path, 0, makeFakeResult());
		expect(existsSync(path)).toBe(true);
	});
});

describe("loadCheckpointEntries", () => {
	it("returns empty array for non-existent file", () => {
		expect(loadCheckpointEntries(`/tmp/nope-${randomUUID()}`)).toEqual([]);
	});

	it("returns full entries with results", () => {
		const path = tmpPath();
		tempFiles.push(path);
		saveCheckpoint(path, 5, makeFakeResult("fifth"));

		const entries = loadCheckpointEntries(path);
		expect(entries).toHaveLength(1);
		expect(entries[0].index).toBe(5);
		expect(entries[0].result.result).toBe("fifth");
		expect(entries[0].completedAt).toBeDefined();
	});
});

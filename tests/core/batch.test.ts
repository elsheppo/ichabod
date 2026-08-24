/**
 * Tests for core/batch.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { batch } from "../../src/core/batch.js";
import { ParseError } from "../../src/types.js";

const FIXTURES = join(import.meta.dirname, "../fixtures");
const SUCCESS_ENVELOPE = readFileSync(join(FIXTURES, "success-envelope.json"), "utf-8");

vi.mock("../../src/engine/spawn.js", () => ({
	spawnClaude: vi.fn(),
}));

import { spawnClaude } from "../../src/engine/spawn.js";
const mockSpawn = vi.mocked(spawnClaude);

beforeEach(() => {
	vi.clearAllMocks();
});

function makeSuccessEnvelope(result: string): string {
	return SUCCESS_ENVELOPE.replace('"4"', JSON.stringify(result));
}

describe("batch", () => {
	it("processes items and preserves original order", async () => {
		mockSpawn
			.mockResolvedValueOnce({
				stdout: makeSuccessEnvelope("alpha-result"),
				stderr: "",
				exitCode: 0,
				timedOut: false,
			})
			.mockResolvedValueOnce({
				stdout: makeSuccessEnvelope("beta-result"),
				stderr: "",
				exitCode: 0,
				timedOut: false,
			});

		const result = await batch({
			items: ["alpha", "beta"],
			template: (item) => `Process ${item}`,
			concurrency: 1,
		});

		expect(result.results.map((entry) => entry.item)).toEqual(["alpha", "beta"]);
		expect(result.results[0].result.result).toBe("alpha-result");
		expect(result.results[1].result.result).toBe("beta-result");
		expect(result.succeeded).toBe(2);
	});

	it("rejects when a dispatch throws instead of hanging", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: "not-json",
			stderr: "",
			exitCode: 1,
			timedOut: false,
		});

		await expect(
			batch({
				items: ["alpha"],
				template: () => "Break the parser",
				concurrency: 1,
			}),
		).rejects.toThrow(ParseError);
	});
});

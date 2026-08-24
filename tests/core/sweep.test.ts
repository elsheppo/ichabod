import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { readFileSync as readFixture } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sweep } from "../../src/core/sweep.js";

const FIXTURES = join(import.meta.dirname, "../fixtures");
const SUCCESS_ENVELOPE = readFixture(join(FIXTURES, "success-envelope.json"), "utf-8");

vi.mock("../../src/engine/spawn.js", () => ({
	spawnClaude: vi.fn(),
}));

import { spawnClaude } from "../../src/engine/spawn.js";
const mockSpawn = vi.mocked(spawnClaude);

const tempDirs: string[] = [];

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	for (const dir of tempDirs) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
	tempDirs.length = 0;
});

function makeSuccessEnvelope(result: string): string {
	return SUCCESS_ENVELOPE.replace('"4"', JSON.stringify(result));
}

describe("sweep", () => {
	it("runs prompt x variant x target matrices and persists artifacts", async () => {
		mockSpawn
			.mockResolvedValueOnce({
				stdout: makeSuccessEnvelope('{"answer":"one"}'),
				stderr: "",
				exitCode: 0,
				timedOut: false,
			})
			.mockResolvedValueOnce({
				stdout: makeSuccessEnvelope('{"answer":"two"}'),
				stderr: "",
				exitCode: 0,
				timedOut: false,
			})
			.mockResolvedValueOnce({
				stdout: makeSuccessEnvelope('{"answer":"three"}'),
				stderr: "",
				exitCode: 0,
				timedOut: false,
			});

		const rootDir = mkdtempSync(join(tmpdir(), "ichabod-sweep-"));
		tempDirs.push(rootDir);

		const result = await sweep({
			prompts: [
				{
					id: "prompt-qa",
					text: "Return a structured answer",
					metadata: { task: "qa" },
				},
			],
			schema: {
				type: "object",
				properties: {
					answer: { type: "string", description: "Answer text." },
				},
				required: ["answer"],
				additionalProperties: false,
			},
			targets: [
				{
					dispatchOptions: {
						provider: "claude",
						model: "sonnet",
					},
				},
			],
			variants: {
				includeBase: true,
				kinds: ["constraint"],
				seed: "sweep-seed",
			},
			targetConcurrency: 1,
			cellConcurrency: 1,
			skipAvailabilityCheck: true,
			store: { rootDir },
		});

		expect(result.variants).toHaveLength(3);
		expect(result.cells).toHaveLength(3);
		expect(result.samples).toHaveLength(3);
		expect(result.summary.totalCells).toBe(3);
		expect(result.summary.totalSamples).toBe(3);
		expect(result.summary.valid).toBe(3);
		expect(result.samples[0].metadata).toMatchObject({
			sweepRunId: result.runId,
			promptId: "prompt-qa",
			replicate: 1,
		});
		expect(result.samples[0].outputContract?.variant?.variantId).toBeDefined();
		expect(readFileSync(join(result.outputDir as string, "manifest.json"), "utf-8")).toContain(
			'"kind": "sweep"',
		);
		expect(readFileSync(join(result.outputDir as string, "summary.json"), "utf-8")).toContain(
			'"totalSamples": 3',
		);
		expect(readFileSync(join(result.outputDir as string, "samples.ndjson"), "utf-8")).toContain(
			'"promptId":"prompt-qa"',
		);
	});
});

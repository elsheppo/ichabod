import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFilesystemRunStore } from "../../src/store/filesystem.js";

const tempDirs: string[] = [];

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

describe("createFilesystemRunStore", () => {
	it("writes manifests, sample records, artifacts, and summaries", () => {
		const rootDir = mkdtempSync(join(tmpdir(), "ichabod-store-"));
		tempDirs.push(rootDir);

		const store = createFilesystemRunStore("run-123", { rootDir });
		store.writeManifest({
			runId: "run-123",
			kind: "sweep",
			createdAt: "2026-03-13T00:00:00.000Z",
			promptCount: 1,
			targets: [{ id: "claude-sonnet", label: "Claude Sonnet" }],
			variants: [
				{
					variantId: "base",
					kind: "base",
					name: "base",
					schemaHash: "hash",
				},
			],
			replicateCount: 1,
			rootDir: store.runDir,
		});

		store.appendSample({
			runId: "run-123",
			promptId: "prompt-1",
			prompt: "Ping",
			target: {
				id: "claude-sonnet",
				label: "Claude Sonnet",
				dispatchOptions: { provider: "claude", model: "sonnet" },
			},
			variant: {
				variantId: "base",
				kind: "base",
				name: "base",
				seed: "seed",
				schemaHash: "hash",
				diffSummary: ["base schema with no perturbation"],
			},
			outputContract: {
				name: "answer",
				jsonSchema: {
					type: "object",
				},
				source: {
					kind: "json-schema",
					schemaHash: "hash",
				},
			},
			replicate: 1,
			sample: {
				requestId: "request-1",
				sampleId: "sample-1",
				targetId: "claude-sonnet",
				provider: "claude",
				model: "sonnet",
				ok: true,
				text: '{"answer":"pong"}',
				structured: { answer: "pong" },
				validation: {
					status: "valid",
					errors: [],
				},
				latencyMs: 10,
				costUsd: 0.01,
				rawStdout: '{"type":"result"}',
				rawStderr: "",
				outputContract: {
					name: "answer",
					schemaHash: "hash",
				},
			},
		});

		store.writeSummary({
			totalCells: 1,
			totalSamples: 1,
		});

		expect(existsSync(join(store.runDir, "manifest.json"))).toBe(true);
		expect(existsSync(join(store.runDir, "samples.ndjson"))).toBe(true);
		expect(existsSync(join(store.runDir, "summary.json"))).toBe(true);
		expect(existsSync(join(store.runDir, "artifacts", "sample-1", "request.json"))).toBe(true);
		expect(existsSync(join(store.runDir, "artifacts", "sample-1", "stdout.txt"))).toBe(true);

		const ndjson = readFileSync(join(store.runDir, "samples.ndjson"), "utf-8");
		expect(ndjson).toContain('"prompt":"Ping"');
		expect(ndjson).toContain('"sampleId":"sample-1"');
	});

	it("redacts provider environment values from persisted request artifacts", () => {
		const rootDir = mkdtempSync(join(tmpdir(), "ichabod-store-redaction-"));
		tempDirs.push(rootDir);
		const store = createFilesystemRunStore("run-secret", { rootDir });

		store.appendSample({
			runId: "run-secret",
			promptId: "prompt-1",
			prompt: "Ping",
			target: {
				id: "antigravity-default",
				label: "Antigravity (default)",
				dispatchOptions: {
					provider: "antigravity",
					env: { AGY_TEST_TOKEN: "live-secret-value" },
				},
			},
			variant: {
				variantId: "base",
				kind: "base",
				name: "base",
				schemaHash: "hash",
			},
			replicate: 1,
			sample: {
				requestId: "request-1",
				sampleId: "sample-secret",
				targetId: "antigravity-default",
				provider: "antigravity",
				ok: false,
				text: "",
				validation: { status: "unparseable", errors: ["failed"] },
				latencyMs: 0,
				rawStdout: "",
				rawStderr: "",
			},
		});

		const request = readFileSync(
			join(store.runDir, "artifacts", "sample-secret", "request.json"),
			"utf-8",
		);
		const samples = readFileSync(join(store.runDir, "samples.ndjson"), "utf-8");
		expect(request).not.toContain("live-secret-value");
		expect(samples).not.toContain("live-secret-value");
		expect(request).toContain("[REDACTED]");
		expect(samples).toContain("[REDACTED]");
	});
});

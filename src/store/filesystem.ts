import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunManifest } from "./run.js";
import type { StoredSampleRecord } from "./sample.js";

export interface FilesystemStoreOptions {
	rootDir?: string;
}

export interface FilesystemRunStore {
	rootDir: string;
	runDir: string;
	writeManifest(manifest: RunManifest): void;
	appendSample(record: StoredSampleRecord): void;
	writeSummary(summary: Record<string, unknown>): void;
}

function writeJson(path: string, value: unknown) {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, "utf-8");
}

function redactSecrets(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(redactSecrets);
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				key === "env" && entry && typeof entry === "object"
					? Object.fromEntries(Object.keys(entry).map((envKey) => [envKey, "[REDACTED]"]))
					: redactSecrets(entry),
			]),
		);
	}

	return value;
}

function redactDispatchTarget(target: StoredSampleRecord["target"]): StoredSampleRecord["target"] {
	return redactSecrets(target) as StoredSampleRecord["target"];
}

export function createFilesystemRunStore(
	runId: string,
	options: FilesystemStoreOptions = {},
): FilesystemRunStore {
	const rootDir = options.rootDir ?? join(process.cwd(), "runs");
	const runDir = join(rootDir, runId);
	const artifactsDir = join(runDir, "artifacts");
	const samplesPath = join(runDir, "samples.ndjson");
	const summaryPath = join(runDir, "summary.json");
	const manifestPath = join(runDir, "manifest.json");

	mkdirSync(artifactsDir, { recursive: true });

	return {
		rootDir,
		runDir,
		writeManifest(manifest) {
			writeJson(manifestPath, manifest);
		},
		appendSample(record) {
			const safeRecord = { ...record, target: redactDispatchTarget(record.target) };
			appendFileSync(samplesPath, `${JSON.stringify(safeRecord)}\n`, "utf-8");

			const sampleDir = join(artifactsDir, record.sample.sampleId);
			mkdirSync(sampleDir, { recursive: true });

			writeJson(join(sampleDir, "request.json"), {
				runId: record.runId,
				promptId: record.promptId,
				prompt: record.prompt,
				target: redactDispatchTarget(record.target),
				variant: record.variant,
				outputContract: record.outputContract,
				replicate: record.replicate,
			});
			writeFileSync(join(sampleDir, "stdout.txt"), record.sample.rawStdout, "utf-8");
			writeFileSync(join(sampleDir, "stderr.txt"), record.sample.rawStderr, "utf-8");
			writeJson(join(sampleDir, "normalized.json"), record.sample);
			writeJson(join(sampleDir, "validation.json"), record.sample.validation);
		},
		writeSummary(summary) {
			writeJson(summaryPath, summary);
		},
	};
}

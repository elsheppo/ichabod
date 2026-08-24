/**
 * infra/checkpoint.ts — Batch progress save/resume.
 *
 * Enables resume-from-failure for long-running batch operations.
 * After each item completes, its result is checkpointed to a JSON file.
 * On restart, completed items are skipped.
 *
 * File format is NDJSON (one JSON line per completed item) for append-safety.
 * No partial writes — each line is a complete result.
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { DispatchResult } from "../types.js";

export interface CheckpointEntry {
	/** Index of the completed item in the original batch. */
	index: number;
	/** Timestamp when this item completed. */
	completedAt: string;
	/** The dispatch result (full). */
	result: DispatchResult;
}

/**
 * Load completed indices from a checkpoint file.
 * Returns a Set of item indices that have already been processed.
 */
export function loadCheckpoint(path: string): Set<number> {
	if (!existsSync(path)) {
		return new Set();
	}

	const completed = new Set<number>();
	const lines = readFileSync(path, "utf-8").trim().split("\n");

	for (const line of lines) {
		if (!line) continue;
		try {
			const entry = JSON.parse(line) as CheckpointEntry;
			completed.add(entry.index);
		} catch {
			// Skip malformed lines — partial write from a crash
		}
	}

	return completed;
}

/**
 * Append a completed item to the checkpoint file.
 * Uses appendFileSync for atomic-ish writes (one line per call).
 */
export function saveCheckpoint(path: string, index: number, result: DispatchResult): void {
	const entry: CheckpointEntry = {
		index,
		completedAt: new Date().toISOString(),
		result,
	};
	appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf-8");
}

/**
 * Load all checkpoint entries with their full results.
 * Used to reconstruct batch results on resume.
 */
export function loadCheckpointEntries(path: string): CheckpointEntry[] {
	if (!existsSync(path)) {
		return [];
	}

	const entries: CheckpointEntry[] = [];
	const lines = readFileSync(path, "utf-8").trim().split("\n");

	for (const line of lines) {
		if (!line) continue;
		try {
			entries.push(JSON.parse(line) as CheckpointEntry);
		} catch {
			// Skip malformed lines
		}
	}

	return entries;
}

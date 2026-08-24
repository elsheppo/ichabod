/**
 * core/batch.ts — Map a prompt template over N items with concurrency control.
 *
 * Features:
 * - Async pool with configurable concurrency (default 2)
 * - Checkpoint save/resume for failure recovery
 * - Progress callbacks
 * - Cost aggregation across all items
 * - Per-batch hooks injection (auto-managed temp file lifecycle)
 */

import { loadCheckpoint, loadCheckpointEntries, saveCheckpoint } from "../infra/checkpoint.js";
import { cleanupHooksFile, composeSettingsFile } from "../infra/hooks.js";
import type { BatchItemResult, BatchOptions, BatchResult, DispatchResult } from "../types.js";
import { type DispatchDeps, dispatch } from "./dispatch.js";

/**
 * Process N items through a prompt template with concurrency control.
 *
 * @example
 * ```ts
 * const result = await batch({
 *   items: ["file1.ts", "file2.ts", "file3.ts"],
 *   template: (file) => `Review this file: ${file}`,
 *   concurrency: 2,
 *   dispatchOptions: { model: "haiku", maxBudget: 0.50 },
 *   onProgress: (r, i, total) => console.log(`${i+1}/${total} done`),
 *   hooks: {
 *     PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "validate.sh" }] }],
 *   },
 * });
 * ```
 */
export async function batch<T>(
	options: BatchOptions<T>,
	deps: DispatchDeps = {},
): Promise<BatchResult<T>> {
	const {
		items,
		template,
		concurrency = 2,
		dispatchOptions = {},
		onProgress,
		checkpointPath,
		hooks,
	} = options;

	// Write hooks file if hooks provided
	const hooksFile = hooks ? composeSettingsFile(dispatchOptions.settingsFile, { hooks }) : null;

	try {
		// Merge hooks settingsFile into dispatch options
		const effectiveOptions = hooksFile
			? { ...dispatchOptions, settingsFile: hooksFile }
			: dispatchOptions;

		// Load checkpoint if resuming
		const completedIndices = checkpointPath ? loadCheckpoint(checkpointPath) : new Set<number>();
		const priorEntries = checkpointPath ? loadCheckpointEntries(checkpointPath) : [];

		// Reconstruct prior results
		const results: BatchItemResult<T>[] = priorEntries.map((entry) => ({
			item: items[entry.index],
			index: entry.index,
			result: entry.result,
		}));

		// Determine remaining items
		const remaining = items
			.map((item, index) => ({ item, index }))
			.filter(({ index }) => !completedIndices.has(index));

		if (remaining.length === 0) {
			return aggregateResults(results, items);
		}

		// Process remaining items with async pool
		let activeCount = 0;
		let nextIndex = 0;

		await new Promise<void>((resolveAll, rejectAll) => {
			let failed = false;

			function processNext() {
				if (failed) {
					return;
				}

				if (nextIndex >= remaining.length && activeCount === 0) {
					resolveAll();
					return;
				}

				while (activeCount < concurrency && nextIndex < remaining.length) {
					const { item, index } = remaining[nextIndex];
					nextIndex++;
					activeCount++;

					processItem(item, index)
						.catch((error) => {
							if (!failed) {
								failed = true;
								rejectAll(error);
							}
						})
						.finally(() => {
							activeCount--;
							if (!failed) {
								processNext();
							}
						});
				}
			}

			async function processItem(item: T, index: number) {
				const prompt = template(item, index);
				const result = await dispatch({ ...effectiveOptions, prompt }, deps);

				const itemResult: BatchItemResult<T> = { item, index, result };
				results.push(itemResult);

				// Checkpoint
				if (checkpointPath) {
					saveCheckpoint(checkpointPath, index, result);
				}

				// Progress callback
				onProgress?.(itemResult, results.length, items.length);
			}

			processNext();
		});

		return aggregateResults(results, items);
	} finally {
		// Clean up hooks temp file
		if (hooksFile) {
			cleanupHooksFile(hooksFile);
		}
	}
}

function aggregateResults<T>(results: BatchItemResult<T>[], items: T[]): BatchResult<T> {
	// Sort by original index
	results.sort((a, b) => a.index - b.index);

	const totalCostUsd = results.reduce((sum, r) => sum + r.result.costUsd, 0);
	const totalDurationMs = results.reduce((sum, r) => sum + r.result.durationMs, 0);
	const succeeded = results.filter((r) => r.result.ok).length;
	const failed = results.filter((r) => !r.result.ok).length;

	return {
		results,
		totalCostUsd,
		totalDurationMs,
		succeeded,
		failed,
	};
}

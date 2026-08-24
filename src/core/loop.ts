/**
 * core/loop.ts — Ralph Wiggum pattern: repeat until done.
 *
 * Iterates dispatch calls until a completion predicate is satisfied.
 * Each iteration gets the prior result injected into the prompt via
 * the user's prompt function.
 *
 * Use cases:
 * - Iterative refinement: "Keep improving until quality score > 8"
 * - Convergence: "Keep analyzing until no new findings"
 * - Polling: "Check status until deployment is complete"
 *
 * Hooks can be injected for all iterations via the `hooks` option.
 * The temp file lifecycle is managed automatically.
 */

import { cleanupHooksFile, composeSettingsFile } from "../infra/hooks.js";
import type { DispatchResult, LoopOptions, LoopResult } from "../types.js";
import { type DispatchDeps, dispatch } from "./dispatch.js";

const DEFAULT_MAX_ITERATIONS = 10;

/**
 * Execute a dispatch loop until isDone returns true or maxIterations is hit.
 *
 * @example
 * ```ts
 * const result = await loop({
 *   prompt: (n, prior) => {
 *     if (!prior) return "Generate a list of 10 ideas for improving DX";
 *     return `Previous attempt:\n${prior.result}\n\nRefine these ideas. Focus on actionability.`;
 *   },
 *   isDone: (result) => result.result.includes("FINAL"),
 *   maxIterations: 5,
 *   dispatchOptions: { model: "sonnet" },
 *   hooks: {
 *     Stop: [{ matcher: "", hooks: [{ type: "command", command: "log-iteration.sh" }] }],
 *   },
 * });
 * ```
 */
export async function loop(options: LoopOptions, deps: DispatchDeps = {}): Promise<LoopResult> {
	const {
		prompt: promptFn,
		isDone,
		maxIterations = DEFAULT_MAX_ITERATIONS,
		dispatchOptions = {},
		onIteration,
		hooks,
	} = options;

	// Write hooks file if hooks provided
	const hooksFile = hooks ? composeSettingsFile(dispatchOptions.settingsFile, { hooks }) : null;

	try {
		// Merge hooks settingsFile into dispatch options
		const effectiveOptions = hooksFile
			? { ...dispatchOptions, settingsFile: hooksFile }
			: dispatchOptions;

		const iterations: DispatchResult[] = [];
		let completedNaturally = false;
		const startTime = Date.now();

		for (let i = 0; i < maxIterations; i++) {
			const priorResult = iterations.length > 0 ? iterations[iterations.length - 1] : null;

			// Generate prompt for this iteration
			const prompt = promptFn(i, priorResult);

			// Execute dispatch
			const result = await dispatch({ ...effectiveOptions, prompt }, deps);
			iterations.push(result);

			// Callback
			onIteration?.(result, i);

			// Check completion
			if (isDone(result, i)) {
				completedNaturally = true;
				break;
			}

			// If dispatch itself failed, stop the loop
			if (!result.ok) {
				break;
			}
		}

		const finalResult = iterations[iterations.length - 1];
		const totalCostUsd = iterations.reduce((sum, r) => sum + r.costUsd, 0);

		return {
			iterations,
			finalResult,
			numIterations: iterations.length,
			totalCostUsd,
			totalDurationMs: Date.now() - startTime,
			completedNaturally,
		};
	} finally {
		// Clean up hooks temp file
		if (hooksFile) {
			cleanupHooksFile(hooksFile);
		}
	}
}

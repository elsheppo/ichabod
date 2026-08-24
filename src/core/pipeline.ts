/**
 * core/pipeline.ts — Chain steps with context accumulation.
 *
 * Multi-step sequential pipeline where each step sees all prior outputs
 * via `ctx.steps[stepName]`. This is the key unlock for ontology building
 * and progressive enrichment — each step can reference and build upon
 * the results of all prior steps.
 *
 * Steps execute sequentially. Each step gets the full context of all
 * prior steps plus accumulated cost. Steps can override dispatch options
 * (model, tools, etc.) individually.
 *
 * Hooks can be injected for all steps via the `hooks` option.
 * The temp file lifecycle is managed automatically.
 */

import { cleanupHooksFile, composeSettingsFile } from "../infra/hooks.js";
import type { DispatchResult, PipelineContext, PipelineOptions, PipelineResult } from "../types.js";
import { type DispatchDeps, dispatch } from "./dispatch.js";

/**
 * Execute a multi-step pipeline with context accumulation.
 *
 * @example
 * ```ts
 * const result = await pipeline({
 *   steps: [
 *     {
 *       name: "analyze",
 *       prompt: () => "Analyze the codebase structure",
 *       dispatchOptions: { model: "sonnet" },
 *     },
 *     {
 *       name: "plan",
 *       prompt: (ctx) => `Based on this analysis:\n${ctx.steps.analyze.result}\n\nCreate an implementation plan.`,
 *       dispatchOptions: { model: "opus" },
 *     },
 *   ],
 *   hooks: {
 *     PostToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "lint.sh" }] }],
 *   },
 * });
 * ```
 */
export async function pipeline(
	options: PipelineOptions,
	deps: DispatchDeps = {},
): Promise<PipelineResult> {
	const { steps, dispatchOptions = {}, onStepComplete, hooks } = options;

	if (steps.length === 0) {
		throw new Error("Pipeline must have at least one step");
	}

	// Write hooks file if hooks provided
	const hooksFile = hooks ? composeSettingsFile(dispatchOptions.settingsFile, { hooks }) : null;

	try {
		// Merge hooks settingsFile into dispatch options
		const effectiveOptions = hooksFile
			? { ...dispatchOptions, settingsFile: hooksFile }
			: dispatchOptions;

		const ctx: PipelineContext = {
			steps: {},
			totalCostUsd: 0,
		};

		const startTime = Date.now();
		let finalResult: DispatchResult | null = null;

		for (const step of steps) {
			// Generate prompt with accumulated context
			const prompt = step.prompt(ctx);

			// Merge base options with step-specific overrides
			const mergedOptions = {
				...effectiveOptions,
				...step.dispatchOptions,
				prompt,
			};

			// Execute
			const result = await dispatch(mergedOptions, deps);

			// Store in context
			ctx.steps[step.name] = result;
			ctx.totalCostUsd += result.costUsd;
			finalResult = result;

			// Callback
			onStepComplete?.(step, result, ctx);

			// Stop pipeline if step failed (fail-fast)
			if (!result.ok) {
				break;
			}
		}

		if (!finalResult) {
			throw new Error("Pipeline completed without a result");
		}

		return {
			ctx,
			finalResult,
			totalCostUsd: ctx.totalCostUsd,
			totalDurationMs: Date.now() - startTime,
		};
	} finally {
		// Clean up hooks temp file
		if (hooksFile) {
			cleanupHooksFile(hooksFile);
		}
	}
}

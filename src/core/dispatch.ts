/**
 * core/dispatch.ts — The composed dispatch primitive.
 *
 * This is the atom that everything else builds on.
 * Composes the full dispatch flow:
 *
 *   throttle.acquire()
 *     → resolve provider adapter
 *       → translate and spawn native CLI
 *         → retry retryable process failures
 *           → normalize provider result
 *             → costTracker.record()
 *               → throttle.release()
 *
 * Can be used standalone or through the factory.
 */

import { isRetryable, withRetry } from "../infra/backoff.js";
import type { CostTracker } from "../infra/cost.js";
import { type HooksConfig, cleanupHooksFile, composeSettingsFile } from "../infra/hooks.js";
import type { Throttle } from "../infra/throttle.js";
import { resolveProviderAdapter } from "../providers/registry.js";
import type { DispatchOptions, DispatchResult } from "../types.js";
import { BudgetExceededError } from "../types.js";

export interface DispatchDeps {
	/** Throttle controller. If omitted, no throttling. */
	throttle?: Throttle;
	/** Cost tracker. If omitted, no budget enforcement. */
	costTracker?: CostTracker;
	/** Retry config. */
	retryConfig?: {
		maxRetries?: number;
		initialDelayMs?: number;
		maxDelayMs?: number;
		onRetry?: (attempt: number, delayMs: number, reason: string) => void;
	};
}

/**
 * Generate one sample through a provider CLI with full lifecycle management.
 *
 * This composes all infrastructure layers:
 * - Throttling (acquire/release around the spawn)
 * - Hook injection (temp settings file via --settings)
 * - Flag building (DispatchOptions → CLI args)
 * - Retry with backoff (rate limits, timeouts)
 * - Result parsing (JSON envelope → DispatchResult)
 * - Cost tracking (accumulate + budget check)
 */
export async function dispatch(
	options: DispatchOptions,
	deps: DispatchDeps = {},
): Promise<DispatchResult> {
	const { throttle, costTracker, retryConfig } = deps;

	// Pre-flight: check if we're already at or over budget
	if (costTracker && costTracker.remaining <= 0) {
		throw new BudgetExceededError(costTracker.spent, costTracker.budget);
	}

	// Acquire throttle slot
	if (throttle) {
		await throttle.acquire();
	}

	// Set up hooks file if hooks are provided via settingsFile
	// (hooks injection is handled by caller providing settingsFile in options)

	try {
		const adapter = resolveProviderAdapter(options.provider);

		// The dispatch operation (may be retried)
		const operation = () => adapter.spawn(options);

		// Execute with retry
		const spawnResult = await withRetry(operation, isRetryable, {
			maxRetries: retryConfig?.maxRetries ?? 2,
			initialDelayMs: retryConfig?.initialDelayMs ?? 2000,
			maxDelayMs: retryConfig?.maxDelayMs ?? 30000,
			onRetry: retryConfig?.onRetry,
		});

		// Parse the result
		const result = adapter.parse(spawnResult);

		// Record cost
		if (costTracker) {
			costTracker.record(result.costUsd);
		}

		return result;
	} finally {
		// Always release throttle slot
		if (throttle) {
			throttle.release();
		}
	}
}

/**
 * Convenience: dispatch with per-call hooks injection.
 *
 * Writes hooks to a temp settings file, adds --settings flag,
 * dispatches, then cleans up the temp file.
 */
export async function dispatchWithHooks(
	options: DispatchOptions,
	hooks: HooksConfig,
	deps: DispatchDeps = {},
): Promise<DispatchResult> {
	const hooksFile = composeSettingsFile(options.settingsFile, { hooks });

	try {
		return await dispatch(
			{
				...options,
				settingsFile: hooksFile,
			},
			deps,
		);
	} finally {
		cleanupHooksFile(hooksFile);
	}
}

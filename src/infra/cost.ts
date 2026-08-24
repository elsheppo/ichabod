/**
 * infra/cost.ts — Cost accumulation and budget enforcement.
 *
 * Tracks cumulative spend across all dispatches from a factory instance.
 * Throws BudgetExceededError when the ceiling is hit.
 *
 * Note: This is a factory-level budget, separate from `--max-budget-usd`
 * which is per-dispatch. Both can be active simultaneously.
 */

import { BudgetExceededError } from "../types.js";

export interface CostTracker {
	/** Record cost from a completed dispatch. Throws if budget exceeded. */
	record(costUsd: number): void;

	/** Check if recording this cost would exceed the budget. Does not record. */
	wouldExceed(costUsd: number): boolean;

	/** Total spent so far. */
	readonly spent: number;

	/** Budget ceiling (Infinity if no limit). */
	readonly budget: number;

	/** Remaining budget. */
	readonly remaining: number;
}

/**
 * Create a cost tracker with an optional budget ceiling.
 *
 * @param maxBudget Maximum total spend in USD. Omit or pass Infinity for no limit.
 */
export function createCostTracker(maxBudget?: number): CostTracker {
	const budget = maxBudget ?? Number.POSITIVE_INFINITY;
	let spent = 0;

	return {
		record(costUsd: number) {
			spent += costUsd;
			if (spent > budget) {
				throw new BudgetExceededError(spent, budget);
			}
		},

		wouldExceed(costUsd: number) {
			return spent + costUsd > budget;
		},

		get spent() {
			return spent;
		},

		get budget() {
			return budget;
		},

		get remaining() {
			return Math.max(0, budget - spent);
		},
	};
}

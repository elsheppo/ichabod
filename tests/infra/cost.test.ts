/**
 * Tests for infra/cost.ts
 */

import { describe, expect, it } from "vitest";
import { createCostTracker } from "../../src/infra/cost.js";
import { BudgetExceededError } from "../../src/types.js";

describe("createCostTracker", () => {
	it("starts at zero spent", () => {
		const tracker = createCostTracker(10);
		expect(tracker.spent).toBe(0);
		expect(tracker.remaining).toBe(10);
	});

	it("accumulates cost", () => {
		const tracker = createCostTracker(10);
		tracker.record(2.5);
		expect(tracker.spent).toBeCloseTo(2.5);
		expect(tracker.remaining).toBeCloseTo(7.5);

		tracker.record(1.5);
		expect(tracker.spent).toBeCloseTo(4.0);
		expect(tracker.remaining).toBeCloseTo(6.0);
	});

	it("throws BudgetExceededError when budget is exceeded", () => {
		const tracker = createCostTracker(5);
		tracker.record(3);

		expect(() => tracker.record(3)).toThrow(BudgetExceededError);
		expect(() => tracker.record(3)).toThrow(/Budget exceeded/);
	});

	it("allows exact budget amount", () => {
		const tracker = createCostTracker(5);
		tracker.record(5); // Exactly at budget — should not throw
		expect(tracker.spent).toBe(5);
		expect(tracker.remaining).toBe(0);
	});

	it("wouldExceed checks without recording", () => {
		const tracker = createCostTracker(5);
		tracker.record(3);

		expect(tracker.wouldExceed(3)).toBe(true);
		expect(tracker.wouldExceed(2)).toBe(false);
		expect(tracker.wouldExceed(2.01)).toBe(true);
		// Spent should not have changed
		expect(tracker.spent).toBeCloseTo(3);
	});

	it("allows unlimited spend when no budget set", () => {
		const tracker = createCostTracker(); // No budget
		tracker.record(1000);
		tracker.record(5000);
		expect(tracker.spent).toBe(6000);
		expect(tracker.budget).toBe(Number.POSITIVE_INFINITY);
	});

	it("reports budget as Infinity when not set", () => {
		const tracker = createCostTracker();
		expect(tracker.budget).toBe(Number.POSITIVE_INFINITY);
		expect(tracker.remaining).toBe(Number.POSITIVE_INFINITY);
	});
});

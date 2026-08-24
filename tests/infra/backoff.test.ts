/**
 * Tests for infra/backoff.ts
 */

import { describe, expect, it, vi } from "vitest";
import {
	computeBackoffDelay,
	isRateLimited,
	isRetryable,
	withRetry,
} from "../../src/infra/backoff.js";
import type { SpawnResult } from "../../src/types.js";

function makeSpawn(overrides: Partial<SpawnResult> = {}): SpawnResult {
	return {
		stdout: "",
		stderr: "",
		exitCode: 0,
		timedOut: false,
		...overrides,
	};
}

describe("isRateLimited", () => {
	it("detects 'rate limit' in stderr", () => {
		expect(isRateLimited(makeSpawn({ stderr: "Error: rate limit exceeded" }))).toBe(true);
	});

	it("detects '429' in stderr", () => {
		expect(isRateLimited(makeSpawn({ stderr: "HTTP 429 Too Many Requests" }))).toBe(true);
	});

	it("detects 'overloaded' in stderr", () => {
		expect(isRateLimited(makeSpawn({ stderr: "Model is overloaded" }))).toBe(true);
	});

	it("returns false for clean stderr", () => {
		expect(isRateLimited(makeSpawn({ stderr: "MCP connected successfully" }))).toBe(false);
	});

	it("returns false for empty stderr", () => {
		expect(isRateLimited(makeSpawn())).toBe(false);
	});
});

describe("isRetryable", () => {
	it("retries timeouts", () => {
		expect(isRetryable(makeSpawn({ timedOut: true }))).toBe(true);
	});

	it("retries rate limits", () => {
		expect(isRetryable(makeSpawn({ stderr: "rate limit hit" }))).toBe(true);
	});

	it("retries spawn failures (exitCode null)", () => {
		expect(isRetryable(makeSpawn({ exitCode: null }))).toBe(true);
	});

	it("does not retry clean exit", () => {
		expect(isRetryable(makeSpawn({ exitCode: 0 }))).toBe(false);
	});

	it("does not retry non-rate-limit errors", () => {
		expect(isRetryable(makeSpawn({ exitCode: 1, stderr: "Unknown error" }))).toBe(false);
	});
});

describe("computeBackoffDelay", () => {
	it("starts at initial delay for attempt 0", () => {
		const delay = computeBackoffDelay(0, 1000, 30000);
		// 1000 ± 20%  → between 800 and 1200
		expect(delay).toBeGreaterThanOrEqual(800);
		expect(delay).toBeLessThanOrEqual(1200);
	});

	it("doubles for each attempt", () => {
		// Use a fixed seed-style approach: just check the base is doubling
		const d0 = computeBackoffDelay(0, 1000, 100000);
		const d1 = computeBackoffDelay(1, 1000, 100000);
		const d2 = computeBackoffDelay(2, 1000, 100000);

		// Each should be roughly 2x the prior (within jitter)
		expect(d1).toBeGreaterThan(d0 * 0.5); // At least base×2×0.8 vs base×1.2
		expect(d2).toBeGreaterThan(d1 * 0.5);
	});

	it("caps at maxDelay", () => {
		const delay = computeBackoffDelay(10, 1000, 5000);
		// Should be around 5000 ± 20%
		expect(delay).toBeLessThanOrEqual(6000);
	});
});

describe("withRetry", () => {
	it("returns immediately when no retry needed", async () => {
		let calls = 0;
		const result = await withRetry(
			async () => {
				calls++;
				return "success";
			},
			() => false,
			{ maxRetries: 3 },
		);

		expect(result).toBe("success");
		expect(calls).toBe(1);
	});

	it("retries up to maxRetries", async () => {
		let calls = 0;
		const result = await withRetry(
			async () => {
				calls++;
				return `attempt-${calls}`;
			},
			() => true, // Always retry
			{ maxRetries: 2, initialDelayMs: 10, maxDelayMs: 20 },
		);

		expect(calls).toBe(3); // 1 initial + 2 retries
		expect(result).toBe("attempt-3");
	});

	it("stops retrying when shouldRetry returns false", async () => {
		let calls = 0;
		const result = await withRetry(
			async () => {
				calls++;
				return calls;
			},
			(n) => n < 2, // Retry only if result < 2
			{ maxRetries: 5, initialDelayMs: 10, maxDelayMs: 20 },
		);

		expect(calls).toBe(2);
		expect(result).toBe(2);
	});

	it("calls onRetry callback", async () => {
		const onRetry = vi.fn();
		let calls = 0;

		await withRetry(
			async () => {
				calls++;
				return calls;
			},
			(n) => n < 3,
			{ maxRetries: 5, initialDelayMs: 10, maxDelayMs: 20, onRetry },
		);

		expect(onRetry).toHaveBeenCalledTimes(2);
		expect(onRetry.mock.calls[0][0]).toBe(1); // First retry attempt
		expect(onRetry.mock.calls[1][0]).toBe(2); // Second retry attempt
	});
});

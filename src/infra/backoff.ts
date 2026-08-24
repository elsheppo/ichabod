/**
 * infra/backoff.ts — Rate limit detection + exponential retry.
 *
 * Wraps a dispatch operation with:
 * - Rate limit detection from stderr patterns
 * - Exponential backoff: min(initial × 2^attempt, maxDelay)
 * - Configurable max retries
 *
 * Claude Code CLI does its own internal retries for API rate limits,
 * but we add another layer for:
 * - Process-level failures (spawn errors, timeouts)
 * - Rate limit patterns that leak through to stderr
 * - Budget-exceeded errors (no retry, just report)
 */

import type { SpawnResult } from "../types.js";

/** Patterns that indicate rate limiting in stderr. */
const RATE_LIMIT_PATTERNS = [
	/rate.?limit/i,
	/429/,
	/too many requests/i,
	/overloaded/i,
	/capacity/i,
];

export interface RetryConfig {
	/** Maximum number of retry attempts. Defaults to 3. */
	maxRetries?: number;
	/** Initial backoff delay in ms. Defaults to 2000. */
	initialDelayMs?: number;
	/** Maximum backoff delay in ms. Defaults to 30000. */
	maxDelayMs?: number;
	/** Called before each retry with attempt number and delay. */
	onRetry?: (attempt: number, delayMs: number, reason: string) => void;
}

/**
 * Check if a spawn result indicates rate limiting.
 */
export function isRateLimited(result: SpawnResult): boolean {
	return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(result.stderr));
}

/**
 * Check if a spawn result should be retried.
 * Rate limits and timeouts are retryable. Budget errors are not.
 */
export function isRetryable(result: SpawnResult): boolean {
	// Timeouts are retryable
	if (result.timedOut) return true;

	// Rate limits are retryable
	if (isRateLimited(result)) return true;

	// Spawn failures (binary not found, etc.) are retryable once
	if (result.exitCode === null) return true;

	return false;
}

/**
 * Compute backoff delay for a given attempt.
 * Uses exponential backoff with jitter: initial × 2^attempt ± 20%
 */
export function computeBackoffDelay(
	attempt: number,
	initialDelayMs = 2000,
	maxDelayMs = 30000,
): number {
	const base = initialDelayMs * 2 ** attempt;
	const capped = Math.min(base, maxDelayMs);
	// Add ±20% jitter to prevent synchronized retries
	const jitter = capped * 0.2 * (Math.random() * 2 - 1);
	return Math.round(capped + jitter);
}

/**
 * Wrap an async operation with retry logic.
 *
 * The `shouldRetry` predicate determines if a result warrants retry.
 * If all retries are exhausted, the last result is returned (not thrown).
 */
export async function withRetry<T>(
	operation: () => Promise<T>,
	shouldRetry: (result: T) => boolean,
	config: RetryConfig = {},
): Promise<T> {
	const { maxRetries = 3, initialDelayMs = 2000, maxDelayMs = 30000, onRetry } = config;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		const result = await operation();

		if (!shouldRetry(result) || attempt === maxRetries) {
			return result;
		}

		const delay = computeBackoffDelay(attempt, initialDelayMs, maxDelayMs);
		onRetry?.(attempt + 1, delay, "retryable failure detected");

		await new Promise((resolve) => setTimeout(resolve, delay));
	}

	throw new Error("Retry loop exited without a result");
}

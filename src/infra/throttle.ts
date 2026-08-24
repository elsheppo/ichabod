/**
 * infra/throttle.ts — Concurrency semaphore + delay + jitter.
 *
 * Controls the rate at which dispatches fire to prevent:
 * - Thundering herd on the API
 * - Rate limit errors from concurrent dispatches
 * - Wallet drain from runaway parallelism
 *
 * Every dispatch must acquire() before spawning and release() after.
 * The throttle is shared across all dispatches from a factory instance.
 */

import type { ThrottleConfig } from "../types.js";

const DEFAULT_MIN_DELAY = 1000;
const DEFAULT_JITTER: [number, number] = [200, 800];
const DEFAULT_MAX_CONCURRENCY = 2;

/**
 * Throttle controller. Manages concurrency and inter-dispatch delay.
 *
 * Usage:
 * ```ts
 * const throttle = createThrottle({ minDelay: 1000, maxConcurrency: 2 });
 * await throttle.acquire();
 * try {
 *   // ... spawn claude ...
 * } finally {
 *   throttle.release();
 * }
 * ```
 */
export interface Throttle {
	/** Wait for a slot and delay. Resolves when it's safe to dispatch. */
	acquire(): Promise<void>;
	/** Release a slot. Must be called after dispatch completes. */
	release(): void;
	/** Current number of active dispatches. */
	readonly active: number;
	/** Current number of waiters in queue. */
	readonly waiting: number;
}

export function createThrottle(config: ThrottleConfig = {}): Throttle {
	const minDelay = config.minDelay ?? DEFAULT_MIN_DELAY;
	const jitter = config.jitter ?? DEFAULT_JITTER;
	const maxConcurrency = config.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;

	let active = 0;
	let nextDispatchTime = 0;
	const waitQueue: Array<() => void> = [];

	function computeDelay(): number {
		const [jitterMin, jitterMax] = jitter;
		const jitterMs = jitterMin + Math.random() * (jitterMax - jitterMin);
		return minDelay + jitterMs;
	}

	async function acquire(): Promise<void> {
		// Wait for a concurrency slot
		if (active >= maxConcurrency) {
			await new Promise<void>((resolve) => {
				waitQueue.push(resolve);
			});
		}

		// Reserve the concurrency slot before awaiting the rate-limit delay. Without
		// this reservation, simultaneous callers can all observe the same free slot
		// and exceed maxConcurrency while they sleep.
		active++;

		// Reserve a dispatch time synchronously so simultaneous callers are spaced
		// apart instead of sleeping concurrently and firing as a burst.
		const now = Date.now();
		const dispatchTime = Math.max(now, nextDispatchTime);
		nextDispatchTime = dispatchTime + computeDelay();
		const waitTime = dispatchTime - now;

		if (waitTime > 0) {
			await sleep(waitTime);
		}
	}

	function release(): void {
		if (active === 0) {
			throw new Error("Cannot release a throttle with no active dispatches");
		}
		active--;
		// Wake up the next waiter if any
		const next = waitQueue.shift();
		if (next) next();
	}

	return {
		acquire,
		release,
		get active() {
			return active;
		},
		get waiting() {
			return waitQueue.length;
		},
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

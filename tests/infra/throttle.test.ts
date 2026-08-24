/**
 * Tests for infra/throttle.ts
 *
 * Tests concurrency gating and delay enforcement.
 * Uses real timers (not fakes) since delays are small enough for fast tests.
 */

import { describe, expect, it } from "vitest";
import { createThrottle } from "../../src/infra/throttle.js";

describe("createThrottle", () => {
	it("allows acquire/release within concurrency limit", async () => {
		const throttle = createThrottle({ maxConcurrency: 2, minDelay: 0, jitter: [0, 0] });

		await throttle.acquire();
		expect(throttle.active).toBe(1);

		await throttle.acquire();
		expect(throttle.active).toBe(2);

		throttle.release();
		expect(throttle.active).toBe(1);

		throttle.release();
		expect(throttle.active).toBe(0);
	});

	it("queues when concurrency limit reached", async () => {
		const throttle = createThrottle({ maxConcurrency: 1, minDelay: 0, jitter: [0, 0] });

		await throttle.acquire();
		expect(throttle.active).toBe(1);

		// Second acquire should queue
		let secondAcquired = false;
		const secondPromise = throttle.acquire().then(() => {
			secondAcquired = true;
		});

		// Give the event loop a tick
		await new Promise((r) => setTimeout(r, 10));
		expect(secondAcquired).toBe(false);
		expect(throttle.waiting).toBe(1);

		// Release first — second should proceed
		throttle.release();
		await secondPromise;
		expect(secondAcquired).toBe(true);
		expect(throttle.active).toBe(1);
		expect(throttle.waiting).toBe(0);

		throttle.release();
	});

	it("reserves slots before simultaneous delayed acquires", async () => {
		const throttle = createThrottle({ maxConcurrency: 1, minDelay: 30, jitter: [0, 0] });

		const first = throttle.acquire();
		const second = throttle.acquire();

		expect(throttle.active).toBe(1);
		expect(throttle.waiting).toBe(1);

		await first;
		throttle.release();
		await second;
		expect(throttle.active).toBe(1);
		throttle.release();
	});

	it("rejects unmatched releases", () => {
		const throttle = createThrottle({ minDelay: 0, jitter: [0, 0] });
		expect(() => throttle.release()).toThrow("no active dispatches");
	});

	it("enforces minimum delay between dispatches", async () => {
		const throttle = createThrottle({ maxConcurrency: 5, minDelay: 50, jitter: [0, 0] });

		const start = Date.now();
		await throttle.acquire();
		throttle.release();

		await throttle.acquire();
		const elapsed = Date.now() - start;
		throttle.release();

		// Second acquire should have waited ~50ms
		expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some timer imprecision
	});

	it("adds jitter to delay", async () => {
		const throttle = createThrottle({ maxConcurrency: 5, minDelay: 0, jitter: [50, 100] });

		await throttle.acquire();
		throttle.release();

		const start = Date.now();
		await throttle.acquire();
		const elapsed = Date.now() - start;
		throttle.release();

		// Should have waited at least ~50ms (min jitter) but allow timer imprecision
		expect(elapsed).toBeGreaterThanOrEqual(30);
	});

	it("uses defaults when no config provided", () => {
		const throttle = createThrottle();
		expect(throttle.active).toBe(0);
		expect(throttle.waiting).toBe(0);
	});
});

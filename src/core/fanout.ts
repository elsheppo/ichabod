import { randomUUID } from "node:crypto";
import { toExecutionSample } from "../experiment/normalize.js";
import { createOutputContract } from "../output/contracts.js";
import type { ProviderId } from "../providers/types.js";
import { discoverTargets } from "../targets/discovery.js";
import { expandTargets } from "../targets/expand.js";
import type {
	DispatchOptions,
	FanoutItemResult,
	FanoutOptions,
	FanoutResult,
	ProviderTarget,
	SerializedExecutionError,
} from "../types.js";
import { type DispatchDeps, dispatch } from "./dispatch.js";

function serializeError(error: unknown): SerializedExecutionError {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}

	return {
		name: "Error",
		message: String(error),
	};
}

function providerForTarget(target: ProviderTarget): ProviderId {
	return target.dispatchOptions.provider ?? "claude";
}

function summarize(results: FanoutItemResult[]): FanoutResult["summary"] {
	const byProvider: Partial<Record<ProviderId, number>> = {};
	const byTarget: Record<string, number> = {};
	let succeeded = 0;
	let failed = 0;

	for (const entry of results) {
		const provider = providerForTarget(entry.target);
		byProvider[provider] = (byProvider[provider] ?? 0) + 1;
		byTarget[entry.target.id] = (byTarget[entry.target.id] ?? 0) + 1;

		if (entry.result?.ok) {
			succeeded++;
		} else {
			failed++;
		}
	}

	return {
		total: results.length,
		succeeded,
		failed,
		byProvider,
		byTarget,
	};
}

/**
 * Execute one prompt across many provider targets.
 * This is the first experiment-oriented primitive: one request, many model variants.
 */
export async function fanout(
	options: FanoutOptions,
	deps: DispatchDeps = {},
): Promise<FanoutResult> {
	const {
		prompt,
		targets: targetSpecifiers,
		dispatchOptions = {},
		outputContract,
		sampleVariant,
		sampleMetadata,
		concurrency = 2,
		skipAvailabilityCheck = false,
		stopOnError = false,
		onProgress,
	} = options;
	const targets = expandTargets(targetSpecifiers);
	const runId = randomUUID();
	const results = new Array<FanoutItemResult>(targets.length);
	const samples = new Array<FanoutResult["samples"][number]>(targets.length);
	const runnable: Array<{
		target: ProviderTarget;
		index: number;
		dispatchOptions: Omit<DispatchOptions, "prompt">;
	}> = [];
	let completed = 0;

	const recordResult = (
		index: number,
		entry: FanoutItemResult,
		dispatchConfig: Omit<DispatchOptions, "prompt">,
	) => {
		results[index] = entry;
		samples[index] = toExecutionSample({
			requestId: runId,
			targetId: entry.target.id,
			dispatchOptions: dispatchConfig ?? {},
			result: entry.result,
			error: entry.error,
			outputContract:
				outputContract ??
				(dispatchConfig?.jsonSchema ? createOutputContract(dispatchConfig.jsonSchema) : undefined),
			variant: sampleVariant,
			metadata: sampleMetadata,
		});
		completed++;
		onProgress?.(entry, completed, targets.length);
	};

	if (!skipAvailabilityCheck) {
		for (const [index, entry] of discoverTargets(targets).entries()) {
			const mergedOptions = {
				...dispatchOptions,
				...entry.target.dispatchOptions,
			};
			if (!entry.availability.available) {
				const unavailableError = {
					name: "ProviderUnavailableError",
					message: `Provider "${entry.availability.provider}" is unavailable: ${entry.availability.error ?? "unknown error"}`,
				} satisfies SerializedExecutionError;

				recordResult(
					index,
					{
						target: entry.target,
						error: unavailableError,
					},
					mergedOptions,
				);

				if (stopOnError) {
					throw new Error(results[index].error?.message ?? "Provider unavailable");
				}

				continue;
			}

			runnable.push({ target: entry.target, index, dispatchOptions: mergedOptions });
		}
	} else {
		targets.forEach((target, index) => {
			runnable.push({
				target,
				index,
				dispatchOptions: {
					...dispatchOptions,
					...target.dispatchOptions,
				},
			});
		});
	}

	if (runnable.length > 0) {
		const limit = Math.max(1, concurrency);
		let activeCount = 0;
		let nextIndex = 0;

		await new Promise<void>((resolveAll, rejectAll) => {
			let failed = false;

			function processNext() {
				if (failed) {
					return;
				}

				if (nextIndex >= runnable.length && activeCount === 0) {
					resolveAll();
					return;
				}

				while (activeCount < limit && nextIndex < runnable.length) {
					const current = runnable[nextIndex];
					nextIndex++;
					activeCount++;

					processTarget(current.target, current.index, current.dispatchOptions)
						.catch((error) => {
							if (!stopOnError || failed) {
								return;
							}

							failed = true;
							rejectAll(error);
						})
						.finally(() => {
							activeCount--;
							if (!failed) {
								processNext();
							}
						});
				}
			}

			async function processTarget(
				target: ProviderTarget,
				index: number,
				targetDispatchOptions: Omit<DispatchOptions, "prompt">,
			) {
				try {
					const result = await dispatch(
						{
							...targetDispatchOptions,
							prompt,
						},
						deps,
					);

					recordResult(index, { target, result }, targetDispatchOptions);
				} catch (error) {
					const serialized = serializeError(error);
					recordResult(index, { target, error: serialized }, targetDispatchOptions);

					if (stopOnError) {
						throw error;
					}
				}
			}

			processNext();
		});
	}

	const finalizedResults = results.filter((result): result is FanoutItemResult => Boolean(result));
	const totalCostUsd = finalizedResults.reduce(
		(sum, entry) => sum + (entry.result?.costUsd ?? 0),
		0,
	);
	const totalDurationMs = finalizedResults.reduce(
		(sum, entry) => sum + (entry.result?.durationMs ?? 0),
		0,
	);

	return {
		runId,
		targets,
		results: finalizedResults,
		samples: samples.filter((sample): sample is FanoutResult["samples"][number] => Boolean(sample)),
		summary: summarize(finalizedResults),
		totalCostUsd,
		totalDurationMs,
	};
}

import { randomUUID } from "node:crypto";
import type {
	CompiledSchemaVariant,
	SchemaVariantDescriptor,
	SchemaVariantOptions,
} from "../schema/variants.js";
import { createSchemaVariants } from "../schema/variants.js";
import { createFilesystemRunStore } from "../store/filesystem.js";
import type { RunManifest } from "../store/run.js";
import { expandTargets } from "../targets/expand.js";
import type {
	ProviderTarget,
	SweepCellResult,
	SweepOptions,
	SweepPrompt,
	SweepResult,
} from "../types.js";
import type { DispatchDeps } from "./dispatch.js";
import { fanout } from "./fanout.js";

function normalizePrompts(prompts: SweepOptions["prompts"]): Required<SweepPrompt>[] {
	return prompts.map((prompt, index) =>
		typeof prompt === "string"
			? {
					id: `prompt-${index + 1}`,
					text: prompt,
					metadata: {},
				}
			: {
					id: prompt.id ?? `prompt-${index + 1}`,
					text: prompt.text,
					metadata: prompt.metadata ?? {},
				},
	);
}

function normalizeVariants(
	schema: SweepOptions["schema"],
	variants: SweepOptions["variants"],
	outputName?: string,
): CompiledSchemaVariant[] {
	if (Array.isArray(variants)) {
		return variants;
	}

	return createSchemaVariants(schema, {
		...(variants as SchemaVariantOptions | undefined),
		includeBase: variants?.includeBase ?? true,
	}).map((variant) =>
		outputName
			? {
					...variant,
					contract: {
						...variant.contract,
						name:
							variant.descriptor.kind === "base"
								? outputName
								: `${outputName}:${variant.descriptor.name}`,
						source: {
							...variant.contract.source,
							schemaName: outputName,
						},
					},
				}
			: variant,
	);
}

function summarizeSweep(
	cells: SweepCellResult[],
	variants: CompiledSchemaVariant[],
): SweepResult["summary"] {
	const samples = cells.flatMap((cell) => cell.fanout.samples);
	const byProvider: SweepResult["summary"]["byProvider"] = {};
	const byVariant: Record<string, number> = {};
	let valid = 0;
	let invalid = 0;
	let unparseable = 0;

	for (const sample of samples) {
		byProvider[sample.provider] = (byProvider[sample.provider] ?? 0) + 1;
		const variantId = sample.outputContract?.variant?.variantId ?? "unknown";
		byVariant[variantId] = (byVariant[variantId] ?? 0) + 1;

		switch (sample.validation.status) {
			case "valid":
			case "repaired":
				valid++;
				break;
			case "invalid":
				invalid++;
				break;
			case "unparseable":
				unparseable++;
				break;
		}
	}

	for (const variant of variants) {
		byVariant[variant.descriptor.variantId] = byVariant[variant.descriptor.variantId] ?? 0;
	}

	return {
		totalCells: cells.length,
		totalSamples: samples.length,
		valid,
		invalid,
		unparseable,
		byProvider,
		byVariant,
	};
}

/**
 * Run a full prompt x schema-variant x target x replicate matrix.
 */
export async function sweep(options: SweepOptions, deps: DispatchDeps = {}): Promise<SweepResult> {
	const {
		prompts,
		schema,
		targets: targetSpecifiers,
		dispatchOptions = {},
		variants: variantOptions,
		outputName,
		replicates = 1,
		cellConcurrency = 1,
		targetConcurrency = 2,
		skipAvailabilityCheck = false,
		stopOnError = false,
		store = {},
		onCellComplete,
	} = options;
	const runId = randomUUID();
	const normalizedPrompts = normalizePrompts(prompts);
	const normalizedVariants = normalizeVariants(schema, variantOptions, outputName);
	const expandedTargets = expandTargets(targetSpecifiers);
	const storeHandle = store === false ? null : createFilesystemRunStore(runId, store);

	const manifest: RunManifest | undefined = storeHandle
		? {
				runId,
				kind: "sweep",
				createdAt: new Date().toISOString(),
				promptCount: normalizedPrompts.length,
				targets: expandedTargets.map((target) => ({
					id: target.id,
					label: target.label,
				})),
				variants: normalizedVariants.map((variant) => ({
					variantId: variant.descriptor.variantId,
					kind: variant.descriptor.kind,
					name: variant.descriptor.name,
					schemaHash: variant.descriptor.schemaHash,
				})),
				replicateCount: replicates,
				rootDir: storeHandle.runDir,
			}
		: undefined;

	storeHandle?.writeManifest(manifest as RunManifest);

	const targetById = new Map(expandedTargets.map((target) => [target.id, target]));
	const cells: Array<{
		prompt: Required<SweepPrompt>;
		variant: CompiledSchemaVariant;
		replicate: number;
	}> = [];

	for (const prompt of normalizedPrompts) {
		for (const variant of normalizedVariants) {
			for (let replicate = 1; replicate <= replicates; replicate++) {
				cells.push({ prompt, variant, replicate });
			}
		}
	}

	const results = new Array<SweepCellResult>(cells.length);
	let completed = 0;

	if (cells.length > 0) {
		const limit = Math.max(1, cellConcurrency);
		let activeCount = 0;
		let nextIndex = 0;

		await new Promise<void>((resolveAll, rejectAll) => {
			let failed = false;

			function processNext() {
				if (failed) {
					return;
				}

				if (nextIndex >= cells.length && activeCount === 0) {
					resolveAll();
					return;
				}

				while (activeCount < limit && nextIndex < cells.length) {
					const currentIndex = nextIndex++;
					const cell = cells[currentIndex];
					activeCount++;

					processCell(cell, currentIndex)
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

			async function processCell(cell: (typeof cells)[number], index: number) {
				const fanoutResult = await fanout(
					{
						prompt: cell.prompt.text,
						targets: expandedTargets,
						outputContract: cell.variant.contract,
						sampleVariant: cell.variant.descriptor,
						sampleMetadata: {
							sweepRunId: runId,
							promptId: cell.prompt.id,
							promptMetadata: cell.prompt.metadata,
							replicate: cell.replicate,
							variantId: cell.variant.descriptor.variantId,
							variantKind: cell.variant.descriptor.kind,
						},
						dispatchOptions: {
							...dispatchOptions,
							jsonSchema: JSON.stringify(cell.variant.contract.jsonSchema),
						},
						concurrency: targetConcurrency,
						skipAvailabilityCheck,
						stopOnError,
					},
					deps,
				);

				const cellResult: SweepCellResult = {
					promptId: cell.prompt.id,
					prompt: cell.prompt.text,
					variant: cell.variant.descriptor,
					replicate: cell.replicate,
					fanout: fanoutResult,
				};

				results[index] = cellResult;

				for (const sample of fanoutResult.samples) {
					storeHandle?.appendSample({
						runId,
						promptId: cell.prompt.id,
						prompt: cell.prompt.text,
						target: targetById.get(sample.targetId) as ProviderTarget,
						sample,
						variant: cell.variant.descriptor,
						outputContract: cell.variant.contract,
						replicate: cell.replicate,
					});
				}

				completed++;
				onCellComplete?.(cellResult, completed, cells.length);
			}

			processNext();
		});
	}

	const finalizedCells = results.filter((cell): cell is SweepCellResult => Boolean(cell));
	const summary = summarizeSweep(finalizedCells, normalizedVariants);

	storeHandle?.writeSummary(summary as unknown as Record<string, unknown>);

	return {
		runId,
		outputDir: storeHandle?.runDir,
		manifest,
		variants: normalizedVariants,
		cells: finalizedCells,
		samples: finalizedCells.flatMap((cell) => cell.fanout.samples),
		summary,
	};
}

import { randomUUID } from "node:crypto";
import { validateStructuredOutput } from "../output/validate.js";
import type { SchemaVariantDescriptor } from "../schema/variants.js";
import type { DispatchOptions, DispatchResult, SerializedExecutionError } from "../types.js";
import type { ExecutionSample, OutputContract } from "./types.js";

function buildArtifacts(result?: DispatchResult): Record<string, unknown> | undefined {
	if (!result) {
		return undefined;
	}

	return {
		rawEnvelope: result.rawEnvelope,
	};
}

/**
 * Convert legacy dispatch results into a provider-neutral execution sample.
 * This is an additive bridge while the orchestration layer still exposes DispatchResult publicly.
 */
export function toExecutionSample(input: {
	requestId: string;
	targetId: string;
	dispatchOptions: Omit<DispatchOptions, "prompt">;
	result?: DispatchResult;
	error?: SerializedExecutionError;
	outputContract?: OutputContract;
	variant?: SchemaVariantDescriptor;
	metadata?: Record<string, unknown>;
}): ExecutionSample {
	const { requestId, targetId, dispatchOptions, result, error, outputContract, variant, metadata } =
		input;

	if (!result) {
		return {
			requestId,
			sampleId: randomUUID(),
			targetId,
			provider: dispatchOptions.provider ?? "claude",
			model: dispatchOptions.model,
			reasoning: dispatchOptions.effort,
			ok: false,
			text: "",
			validation: {
				status: "unparseable",
				errors: error ? [error.message] : ["Execution failed before a result was produced"],
			},
			latencyMs: 0,
			costUsd: 0,
			rawStdout: "",
			rawStderr: error?.message ?? "",
			outputContract: outputContract
				? {
						name: outputContract.name,
						schemaHash: outputContract.source.schemaHash,
						schemaName: outputContract.source.schemaName,
						variant,
					}
				: undefined,
			metadata,
			artifacts: error
				? {
						executionError: error,
					}
				: undefined,
		};
	}

	const { structured, validation } = validateStructuredOutput(
		outputContract,
		result.result,
		result.structuredOutput,
		result.errors,
	);

	return {
		requestId,
		sampleId: randomUUID(),
		targetId,
		provider: dispatchOptions.provider ?? "claude",
		model: dispatchOptions.model,
		reasoning: dispatchOptions.effort,
		ok: result.ok,
		text: result.result,
		structured,
		validation,
		latencyMs: result.durationMs,
		costUsd: result.costUsd,
		usage: { ...result.usage },
		rawStdout: result.stdout,
		rawStderr: result.stderr,
		outputContract: outputContract
			? {
					name: outputContract.name,
					schemaHash: outputContract.source.schemaHash,
					schemaName: outputContract.source.schemaName,
					variant,
				}
			: undefined,
		metadata,
		providerMetadata: {
			sessionId: result.sessionId,
			subtype: result.subtype,
		},
		artifacts: buildArtifacts(result),
	};
}

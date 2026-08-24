import type { ProviderId } from "../providers/types.js";
import type { SchemaVariantDescriptor } from "../schema/variants.js";

export interface OutputContract {
	name: string;
	jsonSchema: Record<string, unknown>;
	source: {
		kind: "json-schema";
		schemaHash: string;
		schemaName?: string;
	};
}

export interface ValidationResult {
	status: "valid" | "invalid" | "unparseable" | "repaired";
	errors: string[];
	repairedStructured?: unknown;
}

export interface ExecutionSample {
	requestId: string;
	sampleId: string;
	targetId: string;
	provider: ProviderId;
	model?: string;
	reasoning?: string;
	ok: boolean;
	text: string;
	structured?: unknown;
	validation: ValidationResult;
	latencyMs: number;
	costUsd?: number;
	usage?: {
		inputTokens: number;
		outputTokens: number;
		cacheCreationTokens: number;
		cacheReadTokens: number;
		thinkingTokens?: number;
		totalTokens?: number;
	};
	rawStdout: string;
	rawStderr: string;
	outputContract?: {
		name: string;
		schemaHash: string;
		schemaName?: string;
		variant?: SchemaVariantDescriptor;
	};
	metadata?: Record<string, unknown>;
	providerMetadata?: Record<string, unknown>;
	artifacts?: Record<string, unknown>;
}

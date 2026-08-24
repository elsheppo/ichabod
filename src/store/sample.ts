import type { ExecutionSample, OutputContract } from "../experiment/types.js";
import type { SchemaVariantDescriptor } from "../schema/variants.js";
import type { ProviderTarget } from "../types.js";

export interface StoredSampleRecord {
	runId: string;
	promptId: string;
	prompt: string;
	target: ProviderTarget;
	sample: ExecutionSample;
	variant: SchemaVariantDescriptor;
	outputContract?: OutputContract;
	replicate: number;
}

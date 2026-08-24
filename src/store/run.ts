import type { SchemaVariantDescriptor } from "../schema/variants.js";
import type { ProviderTarget } from "../types.js";

export interface RunManifest {
	runId: string;
	kind: "fanout" | "sweep";
	createdAt: string;
	promptCount: number;
	targets: Array<Pick<ProviderTarget, "id" | "label">>;
	variants: Array<Pick<SchemaVariantDescriptor, "variantId" | "kind" | "name" | "schemaHash">>;
	replicateCount: number;
	rootDir: string;
}

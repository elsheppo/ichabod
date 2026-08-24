import type { OutputContract } from "../experiment/types.js";
import { compileSchemaSource } from "./compile.js";
import { hashJsonValue } from "./hash.js";
import {
	applyConstraintVariant,
	applyDocsVariant,
	applyNamingVariant,
	applyStructureVariant,
} from "./perturb.js";
import type { SchemaSourceInput } from "./source.js";

export type SchemaVariantKind = "base" | "docs-only" | "naming" | "constraint" | "structure";

export interface SchemaVariantDescriptor {
	variantId: string;
	kind: SchemaVariantKind;
	name: string;
	seed: string;
	schemaHash: string;
	diffSummary: string[];
}

export interface CompiledSchemaVariant {
	contract: OutputContract;
	descriptor: SchemaVariantDescriptor;
}

export interface SchemaVariantOptions {
	includeBase?: boolean;
	seed?: string;
	kinds?: Array<Exclude<SchemaVariantKind, "base">>;
}

function variantId(
	kind: SchemaVariantKind,
	name: string,
	seed: string,
	schemaHash: string,
): string {
	return `${kind}:${name}:${seed}:${schemaHash.slice(0, 12)}`;
}

function withVariant(
	baseName: string,
	jsonSchema: Record<string, unknown>,
	seed: string,
	kind: SchemaVariantKind,
	name: string,
	diffSummary: string[],
): CompiledSchemaVariant {
	const schemaHash = hashJsonValue(jsonSchema);
	return {
		contract: {
			name: `${baseName}:${name}`,
			jsonSchema,
			source: {
				kind: "json-schema",
				schemaHash,
				schemaName: baseName,
			},
		},
		descriptor: {
			variantId: variantId(kind, name, seed, schemaHash),
			kind,
			name,
			seed,
			schemaHash,
			diffSummary,
		},
	};
}

/**
 * Generate deterministic schema variants for dataset experiments.
 * The initial implementation focuses on docs, naming, constraints, and one structure transformation.
 */
export function createSchemaVariants(
	source: SchemaSourceInput,
	options: SchemaVariantOptions = {},
): CompiledSchemaVariant[] {
	const {
		includeBase = true,
		seed = "ichabod-default-seed",
		kinds = ["docs-only", "naming", "constraint", "structure"],
	} = options;
	const base = compileSchemaSource(source);
	const variants: CompiledSchemaVariant[] = [];
	const seen = new Set<string>();

	const pushUnique = (variant: CompiledSchemaVariant) => {
		if (seen.has(variant.descriptor.variantId)) {
			return;
		}
		seen.add(variant.descriptor.variantId);
		variants.push(variant);
	};

	if (includeBase) {
		pushUnique({
			contract: base,
			descriptor: {
				variantId: variantId("base", "base", seed, base.source.schemaHash),
				kind: "base",
				name: "base",
				seed,
				schemaHash: base.source.schemaHash,
				diffSummary: ["base schema with no perturbation"],
			},
		});
	}

	if (kinds.includes("docs-only")) {
		for (const mode of ["terse", "verbose", "vague"] as const) {
			const variant = applyDocsVariant(base.jsonSchema, mode);
			pushUnique(
				withVariant(
					base.name,
					variant.schema,
					seed,
					"docs-only",
					`docs-${mode}`,
					variant.diffSummary,
				),
			);
		}
	}

	if (kinds.includes("naming")) {
		for (const mode of ["generic", "snake-case"] as const) {
			const variant = applyNamingVariant(base.jsonSchema, mode);
			pushUnique(
				withVariant(
					base.name,
					variant.schema,
					seed,
					"naming",
					`naming-${mode}`,
					variant.diffSummary,
				),
			);
		}
	}

	if (kinds.includes("constraint")) {
		for (const mode of ["all-required", "optionalized"] as const) {
			const variant = applyConstraintVariant(base.jsonSchema, mode);
			pushUnique(
				withVariant(
					base.name,
					variant.schema,
					seed,
					"constraint",
					`constraint-${mode}`,
					variant.diffSummary,
				),
			);
		}
	}

	if (kinds.includes("structure")) {
		const variant = applyStructureVariant(base.jsonSchema, "wrap-payload");
		pushUnique(
			withVariant(
				base.name,
				variant.schema,
				seed,
				"structure",
				"structure-wrap-payload",
				variant.diffSummary,
			),
		);
	}

	return variants;
}

import { describe, expect, it } from "vitest";
import { createSchemaVariants } from "../../src/schema/variants.js";

const BASE_SCHEMA = {
	type: "object",
	description: "Structured answer payload.",
	properties: {
		answerText: {
			type: "string",
			description: "The final answer to return to the caller.",
		},
		rationale: {
			type: "object",
			description: "Reasoning metadata.",
			properties: {
				confidenceScore: {
					type: "integer",
					description: "Confidence from 0 to 10.",
				},
			},
			required: ["confidenceScore"],
			additionalProperties: false,
		},
	},
	required: ["answerText"],
	additionalProperties: false,
};

describe("createSchemaVariants", () => {
	it("generates deterministic variant ids for the same seed", () => {
		const first = createSchemaVariants(BASE_SCHEMA, {
			seed: "fixed-seed",
			kinds: ["docs-only", "naming"],
		});
		const second = createSchemaVariants(BASE_SCHEMA, {
			seed: "fixed-seed",
			kinds: ["docs-only", "naming"],
		});

		expect(first.map((entry) => entry.descriptor.variantId)).toEqual(
			second.map((entry) => entry.descriptor.variantId),
		);
	});

	it("produces docs, naming, constraint, and structure variants with labeled descriptors", () => {
		const variants = createSchemaVariants(BASE_SCHEMA, {
			seed: "variant-seed",
		});

		expect(variants.map((entry) => entry.descriptor.name)).toEqual([
			"base",
			"docs-terse",
			"docs-verbose",
			"docs-vague",
			"naming-generic",
			"naming-snake-case",
			"constraint-all-required",
			"constraint-optionalized",
			"structure-wrap-payload",
		]);
		expect(variants.every((entry) => entry.descriptor.schemaHash)).toBe(true);
	});

	it("renames properties and required fields in naming variants", () => {
		const variants = createSchemaVariants(BASE_SCHEMA, {
			seed: "naming-seed",
			kinds: ["naming"],
		});
		const generic = variants.find((entry) => entry.descriptor.name === "naming-generic");

		expect(generic?.contract.jsonSchema.properties).toHaveProperty("field_1");
		expect(generic?.contract.jsonSchema.required).toEqual(["field_1"]);
	});
});

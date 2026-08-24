import type { OutputContract } from "../experiment/types.js";
import { hashJsonValue } from "../schema/hash.js";

function parseJsonSchema(schema: string | Record<string, unknown>): Record<string, unknown> {
	if (typeof schema === "string") {
		const parsed = JSON.parse(schema) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new Error("JSON Schema must parse to an object");
		}
		return parsed as Record<string, unknown>;
	}

	return schema;
}

/**
 * Build a normalized output contract from a JSON Schema string or object.
 */
export function createOutputContract(
	schema: string | Record<string, unknown>,
	name = "structured-output",
): OutputContract {
	const jsonSchema = parseJsonSchema(schema);

	return {
		name,
		jsonSchema,
		source: {
			kind: "json-schema",
			schemaHash: hashJsonValue(jsonSchema),
		},
	};
}

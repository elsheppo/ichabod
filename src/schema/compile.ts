import type { OutputContract } from "../experiment/types.js";
import { createOutputContract } from "../output/contracts.js";
import type { SchemaSourceInput } from "./source.js";

/**
 * Normalize any supported schema source into an OutputContract.
 */
export function compileSchemaSource(
	source: SchemaSourceInput,
	name = "structured-output",
): OutputContract {
	if (
		typeof source === "object" &&
		source !== null &&
		"jsonSchema" in source &&
		"source" in source
	) {
		return source as OutputContract;
	}

	return createOutputContract(source, name);
}

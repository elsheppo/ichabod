import { stripMarkdownFences } from "../engine/parse.js";
import type { OutputContract, ValidationResult } from "../experiment/types.js";

type JsonSchema = Record<string, unknown>;

function typeMatches(value: unknown, type: string): boolean {
	switch (type) {
		case "string":
			return typeof value === "string";
		case "number":
			return typeof value === "number" && Number.isFinite(value);
		case "integer":
			return typeof value === "number" && Number.isInteger(value);
		case "boolean":
			return typeof value === "boolean";
		case "array":
			return Array.isArray(value);
		case "object":
			return typeof value === "object" && value !== null && !Array.isArray(value);
		case "null":
			return value === null;
		default:
			return true;
	}
}

function describeValue(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}

function validateAgainstSchema(value: unknown, schema: JsonSchema, path: string, errors: string[]) {
	const schemaType = schema.type;
	const allowedTypes = Array.isArray(schemaType)
		? schemaType.filter((entry): entry is string => typeof entry === "string")
		: typeof schemaType === "string"
			? [schemaType]
			: [];

	if (allowedTypes.length > 0 && !allowedTypes.some((type) => typeMatches(value, type))) {
		errors.push(`${path} expected ${allowedTypes.join(" | ")}, received ${describeValue(value)}`);
		return;
	}

	if (Array.isArray(schema.enum) && !schema.enum.some((entry) => Object.is(entry, value))) {
		errors.push(
			`${path} must be one of ${schema.enum.map((entry) => JSON.stringify(entry)).join(", ")}`,
		);
	}

	if (typeof schema.const !== "undefined" && !Object.is(schema.const, value)) {
		errors.push(`${path} must equal ${JSON.stringify(schema.const)}`);
	}

	if (typeof value === "string") {
		if (typeof schema.minLength === "number" && value.length < schema.minLength) {
			errors.push(`${path} must have length >= ${schema.minLength}`);
		}
		if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
			errors.push(`${path} must have length <= ${schema.maxLength}`);
		}
	}

	if (typeof value === "number") {
		if (typeof schema.minimum === "number" && value < schema.minimum) {
			errors.push(`${path} must be >= ${schema.minimum}`);
		}
		if (typeof schema.maximum === "number" && value > schema.maximum) {
			errors.push(`${path} must be <= ${schema.maximum}`);
		}
	}

	if (Array.isArray(value)) {
		if (typeof schema.minItems === "number" && value.length < schema.minItems) {
			errors.push(`${path} must contain at least ${schema.minItems} items`);
		}
		if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
			errors.push(`${path} must contain at most ${schema.maxItems} items`);
		}
		if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
			value.forEach((item, index) => {
				validateAgainstSchema(item, schema.items as JsonSchema, `${path}[${index}]`, errors);
			});
		}
	}

	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		const record = value as Record<string, unknown>;
		const properties =
			schema.properties &&
			typeof schema.properties === "object" &&
			!Array.isArray(schema.properties)
				? (schema.properties as Record<string, JsonSchema>)
				: {};
		const required = Array.isArray(schema.required)
			? schema.required.filter((entry): entry is string => typeof entry === "string")
			: [];

		for (const key of required) {
			if (!(key in record)) {
				errors.push(`${path}.${key} is required`);
			}
		}

		for (const [key, propertySchema] of Object.entries(properties)) {
			if (key in record) {
				validateAgainstSchema(record[key], propertySchema, `${path}.${key}`, errors);
			}
		}

		if (schema.additionalProperties === false) {
			for (const key of Object.keys(record)) {
				if (!(key in properties)) {
					errors.push(`${path}.${key} is not allowed`);
				}
			}
		}
	}
}

function tryParseStructured(text: string): unknown | undefined {
	const trimmed = text.trim();
	if (!trimmed) {
		return undefined;
	}

	const unfenced = stripMarkdownFences(trimmed);

	try {
		return JSON.parse(unfenced);
	} catch {
		return undefined;
	}
}

/**
 * Validate structured output against a local JSON Schema subset.
 * This intentionally covers the contract shapes Ichabod uses today rather than the full spec.
 */
export function validateStructuredOutput(
	contract: OutputContract | undefined,
	text: string,
	explicitStructured?: unknown,
	executionErrors: string[] = [],
): {
	structured?: unknown;
	validation: ValidationResult;
} {
	const structured =
		typeof explicitStructured !== "undefined" ? explicitStructured : tryParseStructured(text);

	if (!contract) {
		return {
			structured,
			validation: {
				status: executionErrors.length > 0 ? "invalid" : "valid",
				errors: [...executionErrors],
			},
		};
	}

	if (typeof structured === "undefined") {
		return {
			structured: undefined,
			validation: {
				status: "unparseable",
				errors:
					executionErrors.length > 0
						? [...executionErrors, "Could not parse structured output as JSON"]
						: ["Could not parse structured output as JSON"],
			},
		};
	}

	const errors: string[] = [...executionErrors];
	validateAgainstSchema(structured, contract.jsonSchema, "$", errors);

	return {
		structured,
		validation: {
			status: errors.length === 0 ? "valid" : "invalid",
			errors,
		},
	};
}

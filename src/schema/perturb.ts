type JsonSchema = Record<string, unknown>;

export function cloneSchema<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function walkSchema(
	schema: JsonSchema,
	visitor: (node: JsonSchema, path: string[]) => void,
	path: string[] = [],
) {
	visitor(schema, path);

	if (
		schema.properties &&
		typeof schema.properties === "object" &&
		!Array.isArray(schema.properties)
	) {
		for (const [key, child] of Object.entries(schema.properties as Record<string, unknown>)) {
			if (child && typeof child === "object" && !Array.isArray(child)) {
				walkSchema(child as JsonSchema, visitor, [...path, key]);
			}
		}
	}

	if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
		walkSchema(schema.items as JsonSchema, visitor, [...path, "[]"]);
	}
}

function summarizeDescription(description: string, maxWords: number): string {
	return description.split(/\s+/).filter(Boolean).slice(0, maxWords).join(" ");
}

export function applyDocsVariant(
	input: JsonSchema,
	mode: "terse" | "verbose" | "vague",
): { schema: JsonSchema; diffSummary: string[] } {
	const schema = cloneSchema(input);
	const updated: string[] = [];

	walkSchema(schema, (node, path) => {
		if (typeof node.description !== "string") {
			return;
		}

		const current = node.description;
		switch (mode) {
			case "terse":
				node.description = summarizeDescription(current, 6) || current;
				break;
			case "verbose":
				node.description = `${current} Return this field exactly as valid JSON and preserve the intended semantics.`;
				break;
			case "vague":
				node.description = "Provide an appropriate value for this field.";
				break;
		}

		updated.push(path.length === 0 ? "$" : `$.${path.join(".")}`);
	});

	return {
		schema,
		diffSummary:
			updated.length > 0
				? [`rewrote descriptions for ${updated.length} schema nodes (${updated.join(", ")})`]
				: ["no description fields were available to perturb"],
	};
}

function toSnakeCase(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/[^a-zA-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.toLowerCase();
}

function renameObjectProperties(
	schema: JsonSchema,
	rename: (key: string, index: number) => string,
	diffs: string[],
	path = "$",
) {
	if (
		!schema.properties ||
		typeof schema.properties !== "object" ||
		Array.isArray(schema.properties)
	) {
		return;
	}

	const currentEntries = Object.entries(schema.properties as Record<string, unknown>);
	const renamedEntries: Array<[string, unknown]> = [];
	const renameMap = new Map<string, string>();

	currentEntries.forEach(([key, value], index) => {
		const nextKey = rename(key, index);
		renameMap.set(key, nextKey);
		renamedEntries.push([nextKey, value]);
		if (nextKey !== key) {
			diffs.push(`${path}.${key} -> ${nextKey}`);
		}
	});

	schema.properties = Object.fromEntries(renamedEntries);

	if (Array.isArray(schema.required)) {
		schema.required = schema.required.map((entry) =>
			typeof entry === "string" ? (renameMap.get(entry) ?? entry) : entry,
		);
	}

	for (const [key, child] of renamedEntries) {
		if (child && typeof child === "object" && !Array.isArray(child)) {
			renameObjectProperties(child as JsonSchema, rename, diffs, `${path}.${key}`);
		}
	}

	if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
		renameObjectProperties(schema.items as JsonSchema, rename, diffs, `${path}[]`);
	}
}

export function applyNamingVariant(
	input: JsonSchema,
	mode: "generic" | "snake-case",
): { schema: JsonSchema; diffSummary: string[] } {
	const schema = cloneSchema(input);
	const diffs: string[] = [];

	renameObjectProperties(
		schema,
		(key, index) => (mode === "generic" ? `field_${index + 1}` : toSnakeCase(key)),
		diffs,
	);

	return {
		schema,
		diffSummary: diffs.length > 0 ? diffs : ["no object properties were renamed"],
	};
}

export function applyConstraintVariant(
	input: JsonSchema,
	mode: "all-required" | "optionalized",
): { schema: JsonSchema; diffSummary: string[] } {
	const schema = cloneSchema(input);
	const diffs: string[] = [];

	walkSchema(schema, (node, path) => {
		if (!node.properties || typeof node.properties !== "object" || Array.isArray(node.properties)) {
			return;
		}

		const propertyKeys = Object.keys(node.properties as Record<string, unknown>);
		const location = path.length === 0 ? "$" : `$.${path.join(".")}`;

		if (mode === "all-required") {
			node.required = propertyKeys;
			diffs.push(`${location} now requires ${propertyKeys.join(", ") || "no fields"}`);
			return;
		}

		if (Array.isArray(node.required) && node.required.length > 0) {
			node.required = [];
			diffs.push(`${location} required constraints cleared`);
		}

		if (node.additionalProperties === false) {
			node.additionalProperties = undefined;
			diffs.push(`${location} now allows additional properties`);
		}
	});

	return {
		schema,
		diffSummary: diffs.length > 0 ? diffs : ["no object constraints were changed"],
	};
}

export function applyStructureVariant(
	input: JsonSchema,
	mode: "wrap-payload",
): { schema: JsonSchema; diffSummary: string[] } {
	const schema = cloneSchema(input);

	if (mode !== "wrap-payload" || schema.type !== "object") {
		return {
			schema,
			diffSummary: ["structure variant was a no-op for this schema"],
		};
	}

	return {
		schema: {
			type: "object",
			description:
				typeof schema.description === "string"
					? `Wrapped payload. ${schema.description}`
					: "Wrapped payload object.",
			properties: {
				payload: schema,
			},
			required: ["payload"],
			additionalProperties: false,
		},
		diffSummary: ["wrapped the original top-level object under $.payload"],
	};
}

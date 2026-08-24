import { describe, expect, it } from "vitest";
import { createOutputContract } from "../../src/output/contracts.js";

describe("createOutputContract", () => {
	it("normalizes schema strings and hashes them deterministically", () => {
		const schema = {
			type: "object",
			properties: {
				answer: { type: "string" },
			},
			required: ["answer"],
		};

		const fromObject = createOutputContract(schema, "answer-contract");
		const fromString = createOutputContract(JSON.stringify(schema), "answer-contract");

		expect(fromObject.name).toBe("answer-contract");
		expect(fromObject.jsonSchema).toEqual(schema);
		expect(fromObject.source.schemaHash).toBe(fromString.source.schemaHash);
	});

	it("throws when the schema string does not parse to an object", () => {
		expect(() => createOutputContract('"string"')).toThrow("JSON Schema must parse to an object");
	});
});

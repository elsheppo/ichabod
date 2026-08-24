import { describe, expect, it } from "vitest";
import { createOutputContract } from "../../src/output/contracts.js";
import { validateStructuredOutput } from "../../src/output/validate.js";

describe("validateStructuredOutput", () => {
	const contract = createOutputContract({
		type: "object",
		properties: {
			answer: { type: "string" },
			score: { type: "integer", minimum: 0 },
		},
		required: ["answer"],
		additionalProperties: false,
	});

	it("marks schema-compliant JSON as valid", () => {
		const result = validateStructuredOutput(contract, '{"answer":"pong","score":2}');

		expect(result.structured).toEqual({ answer: "pong", score: 2 });
		expect(result.validation.status).toBe("valid");
		expect(result.validation.errors).toEqual([]);
	});

	it("marks invalid objects with local schema errors", () => {
		const result = validateStructuredOutput(contract, '{"score":-1,"extra":true}');

		expect(result.validation.status).toBe("invalid");
		expect(result.validation.errors).toContain("$.answer is required");
		expect(result.validation.errors).toContain("$.score must be >= 0");
		expect(result.validation.errors).toContain("$.extra is not allowed");
	});

	it("marks non-JSON output as unparseable when a contract is present", () => {
		const result = validateStructuredOutput(contract, "not-json");

		expect(result.validation.status).toBe("unparseable");
		expect(result.validation.errors).toContain("Could not parse structured output as JSON");
	});

	it("strips markdown fences before parsing structured JSON", () => {
		const result = validateStructuredOutput(contract, '```json\n{"answer":"pong","score":2}\n```');

		expect(result.structured).toEqual({ answer: "pong", score: 2 });
		expect(result.validation.status).toBe("valid");
	});

	it("falls back to execution health when no contract is provided", () => {
		const result = validateStructuredOutput(undefined, "plain text", undefined, [
			"Execution failed",
		]);

		expect(result.structured).toBeUndefined();
		expect(result.validation.status).toBe("invalid");
		expect(result.validation.errors).toEqual(["Execution failed"]);
	});
});

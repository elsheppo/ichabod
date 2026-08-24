/**
 * Tests for infra/template.ts
 */

import { describe, expect, it } from "vitest";
import { renderTemplate } from "../../src/infra/template.js";

describe("renderTemplate", () => {
	it("replaces simple placeholders", () => {
		expect(renderTemplate("Hello {{name}}", { name: "Alice" })).toBe("Hello Alice");
	});

	it("replaces multiple placeholders", () => {
		expect(
			renderTemplate("{{greeting}}, {{name}}! You have {{count}} items.", {
				greeting: "Hi",
				name: "Bob",
				count: 3,
			}),
		).toBe("Hi, Bob! You have 3 items.");
	});

	it("handles whitespace around key names", () => {
		expect(renderTemplate("Hello {{ name }}", { name: "Alice" })).toBe("Hello Alice");
		expect(renderTemplate("Hello {{  name  }}", { name: "Alice" })).toBe("Hello Alice");
	});

	it("leaves unmatched placeholders as-is", () => {
		expect(renderTemplate("Hello {{name}}, {{unknown}}", { name: "Alice" })).toBe(
			"Hello Alice, {{unknown}}",
		);
	});

	it("converts non-string values via String()", () => {
		expect(renderTemplate("Count: {{n}}, Active: {{b}}", { n: 42, b: true })).toBe(
			"Count: 42, Active: true",
		);
	});

	it("handles null and undefined values", () => {
		expect(renderTemplate("Value: {{x}}", { x: null })).toBe("Value: null");
		expect(renderTemplate("Value: {{x}}", { x: undefined })).toBe("Value: undefined");
	});

	it("returns template as-is when no placeholders", () => {
		expect(renderTemplate("No placeholders here", { name: "Alice" })).toBe("No placeholders here");
	});

	it("returns template as-is when empty data", () => {
		expect(renderTemplate("Hello {{name}}", {})).toBe("Hello {{name}}");
	});

	it("handles empty template", () => {
		expect(renderTemplate("", { name: "Alice" })).toBe("");
	});
});

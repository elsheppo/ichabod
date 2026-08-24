import { describe, expect, it } from "vitest";
import { getTargetCatalog, listTargetCatalogs } from "../../src/targets/catalog.js";
import { expandTargets } from "../../src/targets/expand.js";

describe("target catalog", () => {
	it("lists the built-in catalogs", () => {
		expect(listTargetCatalogs()).toEqual([
			"claude-panel",
			"codex-panel",
			"antigravity-panel",
			"frontier-all",
			"structured-output-panel",
		]);
	});

	it("returns cloned catalog targets", () => {
		const first = getTargetCatalog("claude-panel");
		const second = getTargetCatalog("claude-panel");

		first[0].dispatchOptions.model = "changed";
		expect(second[0].dispatchOptions.model).toBe("sonnet");
	});

	it("lets the installed Codex CLI choose its current default model", () => {
		const targets = getTargetCatalog("codex-panel");

		expect(targets.map((target) => target.id)).toEqual(["codex-default", "codex-high"]);
		expect(targets.every((target) => target.dispatchOptions.model === undefined)).toBe(true);
	});
});

describe("expandTargets", () => {
	it("expands catalogs and derives target ids when omitted", () => {
		const targets = expandTargets([
			"claude-panel",
			{
				dispatchOptions: {
					provider: "codex",
					model: "custom-codex-model",
					effort: "high",
				},
			},
		]);

		expect(targets.map((target) => target.id)).toEqual([
			"claude-sonnet",
			"claude-opus",
			"codex-custom-codex-model-high",
		]);
		expect(targets[2].label).toBe("codex:custom-codex-model (high)");
	});

	it("rejects duplicate target ids", () => {
		expect(() =>
			expandTargets([
				{
					id: "duplicate",
					dispatchOptions: { provider: "claude", model: "sonnet" },
				},
				{
					id: "duplicate",
					dispatchOptions: { provider: "codex", model: "custom-codex-model" },
				},
			]),
		).toThrow('Duplicate target id "duplicate"');
	});
});

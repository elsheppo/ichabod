import { describe, expect, it } from "vitest";
import { resolveProviderAdapter } from "../../src/providers/registry.js";

describe("resolveProviderAdapter", () => {
	it("returns the Claude adapter by default", () => {
		const adapter = resolveProviderAdapter();
		expect(adapter.id).toBe("claude");
	});

	it("returns adapters for all registered providers", () => {
		expect(resolveProviderAdapter("codex").id).toBe("codex");
		expect(resolveProviderAdapter("antigravity").id).toBe("antigravity");
	});
});

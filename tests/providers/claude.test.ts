import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/engine/spawn.js", () => ({
	spawnClaude: vi.fn(),
}));

import { spawnClaude } from "../../src/engine/spawn.js";
import { claudeAdapter } from "../../src/providers/claude/adapter.js";

const mockSpawn = vi.mocked(spawnClaude);

beforeEach(() => {
	vi.clearAllMocks();
	mockSpawn.mockResolvedValue({
		stdout: "",
		stderr: "",
		exitCode: 0,
		timedOut: false,
	});
});

describe("claudeAdapter", () => {
	it("bumps maxTurns to 2 when structured output is requested without enough turns", async () => {
		await claudeAdapter.spawn({
			prompt: "Return JSON",
			model: "haiku",
			jsonSchema: JSON.stringify({
				type: "object",
				properties: {
					answer: { type: "string" },
				},
			}),
			maxTurns: 1,
		});

		const call = mockSpawn.mock.calls[0][0];
		const maxTurnsIndex = call.args.indexOf("--max-turns");
		expect(call.args[maxTurnsIndex + 1]).toBe("2");
	});

	it("preserves higher caller-provided maxTurns values", async () => {
		await claudeAdapter.spawn({
			prompt: "Return JSON",
			model: "haiku",
			jsonSchema: JSON.stringify({
				type: "object",
				properties: {
					answer: { type: "string" },
				},
			}),
			maxTurns: 4,
		});

		const call = mockSpawn.mock.calls[0][0];
		const maxTurnsIndex = call.args.indexOf("--max-turns");
		expect(call.args[maxTurnsIndex + 1]).toBe("4");
	});
});

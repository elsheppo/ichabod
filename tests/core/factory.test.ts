/**
 * Tests for factory.ts
 *
 * Tests cross-cutting composition: scope narrowing, shared throttle/cost.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "../../src/factory.js";
import { BudgetExceededError } from "../../src/types.js";

const FIXTURES = join(import.meta.dirname, "../fixtures");
const SUCCESS_ENVELOPE = readFileSync(join(FIXTURES, "success-envelope.json"), "utf-8");

vi.mock("../../src/engine/spawn.js", () => ({
	spawnClaude: vi.fn(),
}));

import { spawnClaude } from "../../src/engine/spawn.js";
const mockSpawn = vi.mocked(spawnClaude);

beforeEach(() => {
	vi.clearAllMocks();
});

function readFlagValues(args: string[], flag: string): string[] {
	const start = args.indexOf(flag);
	if (start === -1) {
		return [];
	}

	const values: string[] = [];
	for (let i = start + 1; i < args.length; i++) {
		if (args[i].startsWith("--")) {
			break;
		}
		values.push(args[i]);
	}

	return values;
}

describe("create (factory)", () => {
	it("creates an instance with all primitives", () => {
		const ic = create();
		expect(ic.dispatch).toBeDefined();
		expect(ic.batch).toBeDefined();
		expect(ic.fanout).toBeDefined();
		expect(ic.sweep).toBeDefined();
		expect(ic.pipeline).toBeDefined();
		expect(ic.loop).toBeDefined();
		expect(ic.costs).toBeDefined();
	});

	it("applies default model to dispatches", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const ic = create({ model: "haiku" });
		await ic.dispatch({ prompt: "Hello" });

		const callArgs = mockSpawn.mock.calls[0][0];
		expect(callArgs.args).toContain("--model");
		expect(callArgs.args).toContain("haiku");
	});

	it("allows dispatch to override model", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const ic = create({ model: "haiku" });
		await ic.dispatch({ prompt: "Hello", model: "opus" });

		const callArgs = mockSpawn.mock.calls[0][0];
		expect(callArgs.args).toContain("opus");
	});

	it("tracks cumulative cost across dispatches", async () => {
		mockSpawn.mockResolvedValue({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const ic = create({ maxBudget: 10 });
		await ic.dispatch({ prompt: "Hello" });
		await ic.dispatch({ prompt: "World" });

		expect(ic.costs.spent).toBeGreaterThan(0);
	});

	it("enforces budget across dispatches", async () => {
		mockSpawn.mockResolvedValue({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		// The success fixture costs ~$0.08 per dispatch
		const ic = create({ maxBudget: 0.1 });
		await ic.dispatch({ prompt: "First" });

		// Second dispatch should exceed budget
		await expect(ic.dispatch({ prompt: "Second" })).rejects.toThrow(BudgetExceededError);
	});

	it("narrows allowedTools to intersection", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const ic = create({ allowedTools: ["Read", "Grep", "Bash"] });
		await ic.dispatch({
			prompt: "Hello",
			allowedTools: ["Read", "Write", "Bash"], // Write not in factory ceiling
		});

		const callArgs = mockSpawn.mock.calls[0][0];
		// Should only have Read and Bash (intersection)
		const tools = readFlagValues(callArgs.args, "--allowedTools");
		expect(tools).toContain("Read");
		expect(tools).toContain("Bash");
		expect(tools).not.toContain("Write");
		expect(tools).not.toContain("Grep"); // Not requested by dispatch
	});

	it("unions disallowedTools", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const ic = create({ disallowedTools: ["Bash(rm *)"] });
		await ic.dispatch({
			prompt: "Hello",
			disallowedTools: ["Bash(sudo *)"],
		});

		const callArgs = mockSpawn.mock.calls[0][0];
		const tools = readFlagValues(callArgs.args, "--disallowedTools");
		expect(tools).toContain("Bash(rm *)");
		expect(tools).toContain("Bash(sudo *)");
	});

	it("narrows step-level pipeline overrides against the factory ceiling", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const ic = create({
			allowedTools: ["Read"],
			disallowedTools: ["Bash(rm *)"],
			permissionMode: "manual",
		});

		await ic.pipeline({
			steps: [
				{
					name: "one",
					prompt: () => "Analyze",
					dispatchOptions: {
						allowedTools: ["Read", "Write"],
						disallowedTools: ["Bash(sudo *)"],
						permissionMode: "bypassPermissions",
					},
				},
			],
		});

		const callArgs = mockSpawn.mock.calls[0][0];
		const allowedTools = readFlagValues(callArgs.args, "--allowedTools");
		expect(allowedTools).toEqual(["Read"]);

		const disallowedTools = readFlagValues(callArgs.args, "--disallowedTools");
		expect(disallowedTools).toContain("Bash(rm *)");
		expect(disallowedTools).toContain("Bash(sudo *)");

		const permissionModeIdx = callArgs.args.indexOf("--permission-mode");
		expect(callArgs.args[permissionModeIdx + 1]).toBe("manual");
	});

	it("narrows fanout target overrides against the factory ceiling", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const ic = create({
			allowedTools: ["Read"],
			permissionMode: "manual",
		});

		await ic.fanout({
			prompt: "Hello",
			skipAvailabilityCheck: true,
			targets: [
				{
					dispatchOptions: {
						provider: "claude",
						allowedTools: ["Read", "Write"],
						permissionMode: "bypassPermissions",
					},
				},
			],
		});

		const callArgs = mockSpawn.mock.calls[0][0];
		const allowedTools = readFlagValues(callArgs.args, "--allowedTools");
		expect(allowedTools).toEqual(["Read"]);

		const permissionModeIdx = callArgs.args.indexOf("--permission-mode");
		expect(callArgs.args[permissionModeIdx + 1]).toBe("manual");
	});

	it("applies factory defaults and ceilings to sweep dispatch options", async () => {
		mockSpawn.mockResolvedValueOnce({
			stdout: SUCCESS_ENVELOPE,
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		const ic = create({
			model: "sonnet",
			allowedTools: ["Read"],
			permissionMode: "plan",
		});

		await ic.sweep({
			prompts: ["Hello"],
			schema: { type: "object", properties: { answer: { type: "string" } } },
			variants: { includeBase: true, kinds: [] },
			targets: {
				dispatchOptions: {
					provider: "claude",
				},
			},
			dispatchOptions: {
				allowedTools: ["Read", "Write"],
				permissionMode: "bypassPermissions",
			},
			skipAvailabilityCheck: true,
			store: false,
		});

		const callArgs = mockSpawn.mock.calls[0][0];
		expect(callArgs.args).toContain("sonnet");
		expect(readFlagValues(callArgs.args, "--allowedTools")).toEqual(["Read"]);
		const permissionModeIdx = callArgs.args.indexOf("--permission-mode");
		expect(callArgs.args[permissionModeIdx + 1]).toBe("plan");
	});
});

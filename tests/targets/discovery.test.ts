import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async () => {
	const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
	return {
		...actual,
		spawnSync: vi.fn(),
	};
});

import { spawnSync } from "node:child_process";
import { discoverProviders, discoverTargets } from "../../src/targets/discovery.js";

const mockSpawnSync = vi.mocked(spawnSync);

beforeEach(() => {
	vi.clearAllMocks();
});

describe("discoverProviders", () => {
	it("reports versions for available provider CLIs", () => {
		mockSpawnSync
			.mockReturnValueOnce({
				status: 0,
				stdout: "claude 1.0.0\n",
				stderr: "",
				error: undefined,
			} as ReturnType<typeof spawnSync>)
			.mockReturnValueOnce({
				status: 0,
				stdout: "codex 0.98.0\n",
				stderr: "",
				error: undefined,
			} as ReturnType<typeof spawnSync>);

		const result = discoverProviders(["claude", "codex"]);

		expect(result).toEqual([
			{
				provider: "claude",
				command: "claude",
				available: true,
				version: "claude 1.0.0",
			},
			{
				provider: "codex",
				command: "codex",
				available: true,
				version: "codex 0.98.0",
			},
		]);
	});

	it("reports spawn errors when a provider CLI is missing", () => {
		mockSpawnSync.mockReturnValueOnce({
			status: null,
			stdout: "",
			stderr: "",
			error: new Error("spawn agy ENOENT"),
		} as ReturnType<typeof spawnSync>);

		const [result] = discoverProviders(["antigravity"]);

		expect(result.available).toBe(false);
		expect(result.error).toContain("ENOENT");
	});
});

describe("discoverTargets", () => {
	it("reuses provider discovery for targets that share a provider", () => {
		mockSpawnSync.mockReturnValueOnce({
			status: 0,
			stdout: "claude 1.0.0\n",
			stderr: "",
			error: undefined,
		} as ReturnType<typeof spawnSync>);

		const result = discoverTargets([
			{
				id: "claude-sonnet",
				label: "Claude Sonnet",
				dispatchOptions: { provider: "claude", model: "sonnet" },
			},
			{
				id: "claude-opus",
				label: "Claude Opus",
				dispatchOptions: { provider: "claude", model: "opus" },
			},
		]);

		expect(mockSpawnSync).toHaveBeenCalledOnce();
		expect(result.every((entry) => entry.availability.available)).toBe(true);
	});
});

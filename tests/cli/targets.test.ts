import { beforeEach, describe, expect, it } from "vitest";
import { buildProgram } from "../../src/cli.js";
import type { ProviderTarget, TargetAvailability } from "../../src/types.js";

const TARGETS: ProviderTarget[] = [
	{
		id: "claude-sonnet",
		label: "Claude Sonnet",
		dispatchOptions: {
			provider: "claude",
			model: "sonnet",
		},
	},
	{
		id: "antigravity-default",
		label: "Antigravity (default)",
		dispatchOptions: {
			provider: "antigravity",
		},
	},
];

describe("cli targets", () => {
	beforeEach(() => {
		process.exitCode = undefined;
	});

	it("renders built-in targets in text mode", async () => {
		let stdout = "";
		let stderr = "";

		const program = buildProgram({
			listTargetCatalogsFn: () => ["frontier-all"],
			getTargetCatalogFn: () => TARGETS,
			stdout: {
				write(chunk: string) {
					stdout += chunk;
				},
			},
			stderr: {
				write(chunk: string) {
					stderr += chunk;
				},
			},
		});

		await program.parseAsync(["targets"], { from: "user" });

		expect(stdout).toContain("Catalog: frontier-all");
		expect(stdout).toContain("claude-sonnet | Claude Sonnet | provider=claude | model=sonnet");
		expect(stdout).toContain(
			"antigravity-default | Antigravity (default) | provider=antigravity | model=default",
		);
		expect(stderr).toBe("");
		expect(process.exitCode).toBe(0);
	});

	it("includes availability details in json mode when discovery is requested", async () => {
		let stdout = "";
		let stderr = "";

		const availability: TargetAvailability[] = TARGETS.map((target) => ({
			target,
			availability: {
				provider: target.dispatchOptions.provider ?? "claude",
				command: target.dispatchOptions.provider ?? "claude",
				available: true,
				version: "1.0.0",
			},
		}));

		const program = buildProgram({
			listTargetCatalogsFn: () => ["structured-output-panel"],
			getTargetCatalogFn: () => TARGETS,
			discoverTargetsFn: () => availability,
			stdout: {
				write(chunk: string) {
					stdout += chunk;
				},
			},
			stderr: {
				write(chunk: string) {
					stderr += chunk;
				},
			},
		});

		await program.parseAsync(
			["targets", "--catalog", "structured-output-panel", "--discover", "--format", "json"],
			{ from: "user" },
		);

		expect(JSON.parse(stdout)).toEqual([
			{
				catalog: "structured-output-panel",
				targets: [
					{
						id: "claude-sonnet",
						label: "Claude Sonnet",
						provider: "claude",
						model: "sonnet",
						availability: availability[0].availability,
					},
					{
						id: "antigravity-default",
						label: "Antigravity (default)",
						provider: "antigravity",
						model: "default",
						availability: availability[1].availability,
					},
				],
			},
		]);
		expect(stderr).toBe("");
		expect(process.exitCode).toBe(0);
	});
});

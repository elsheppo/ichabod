/**
 * Tests for infra/hooks.ts
 *
 * Covers all 4 handler types, multiple hook events, temp file lifecycle,
 * and the writeSettingsFile convenience function.
 */

import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
	type HookMatcher,
	type HooksConfig,
	cleanupHooksFile,
	composeSettingsFile,
	writeHooksFile,
	writeSettingsFile,
} from "../../src/infra/hooks.js";

const tempFiles: string[] = [];

afterEach(() => {
	for (const f of tempFiles) {
		cleanupHooksFile(f);
	}
	tempFiles.length = 0;
});

describe("writeHooksFile", () => {
	it("creates a temp file with command hook", () => {
		const path = writeHooksFile({
			Stop: [
				{
					matcher: "",
					hooks: [{ type: "command", command: "echo continue" }],
				},
			],
		});
		tempFiles.push(path);

		expect(existsSync(path)).toBe(true);
		const content = JSON.parse(readFileSync(path, "utf-8"));
		expect(content.hooks.Stop).toHaveLength(1);
		expect(content.hooks.Stop[0].hooks[0].type).toBe("command");
		expect(content.hooks.Stop[0].hooks[0].command).toBe("echo continue");
	});

	it("creates a temp file with http hook", () => {
		const path = writeHooksFile({
			PreToolUse: [
				{
					matcher: "Bash",
					hooks: [
						{
							type: "http",
							url: "http://localhost:8080/validate",
							timeout: 10,
							headers: { Authorization: "Bearer $MY_TOKEN" },
							allowedEnvVars: ["MY_TOKEN"],
						},
					],
				},
			],
		});
		tempFiles.push(path);

		const content = JSON.parse(readFileSync(path, "utf-8"));
		const hook = content.hooks.PreToolUse[0].hooks[0];
		expect(hook.type).toBe("http");
		expect(hook.url).toBe("http://localhost:8080/validate");
		expect(hook.headers.Authorization).toBe("Bearer $MY_TOKEN");
		expect(hook.allowedEnvVars).toEqual(["MY_TOKEN"]);
	});

	it("creates a temp file with prompt hook", () => {
		const path = writeHooksFile({
			PostToolUse: [
				{
					matcher: "Edit|Write",
					hooks: [
						{
							type: "prompt",
							prompt: "Did the code quality improve? $ARGUMENTS",
							model: "haiku",
							timeout: 30,
						},
					],
				},
			],
		});
		tempFiles.push(path);

		const content = JSON.parse(readFileSync(path, "utf-8"));
		const hook = content.hooks.PostToolUse[0].hooks[0];
		expect(hook.type).toBe("prompt");
		expect(hook.prompt).toContain("$ARGUMENTS");
		expect(hook.model).toBe("haiku");
	});

	it("creates a temp file with agent hook", () => {
		const path = writeHooksFile({
			Stop: [
				{
					matcher: "",
					hooks: [
						{
							type: "agent",
							prompt: "Verify all tests pass. $ARGUMENTS",
							timeout: 120,
						},
					],
				},
			],
		});
		tempFiles.push(path);

		const content = JSON.parse(readFileSync(path, "utf-8"));
		const hook = content.hooks.Stop[0].hooks[0];
		expect(hook.type).toBe("agent");
		expect(hook.prompt).toContain("Verify all tests pass");
		expect(hook.timeout).toBe(120);
	});

	it("supports multiple hook events in one config", () => {
		const config: HooksConfig = {
			PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "validate.sh" }] }],
			PostToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "lint.sh" }] }],
			PermissionRequest: [{ matcher: "Bash", hooks: [{ type: "command", command: "approve.sh" }] }],
			UserPromptSubmit: [{ matcher: "", hooks: [{ type: "command", command: "log-prompt.sh" }] }],
			SessionStart: [{ matcher: "startup", hooks: [{ type: "command", command: "init.sh" }] }],
			SessionEnd: [{ matcher: "", hooks: [{ type: "command", command: "cleanup.sh" }] }],
		};

		const path = writeHooksFile(config);
		tempFiles.push(path);

		const content = JSON.parse(readFileSync(path, "utf-8"));
		expect(Object.keys(content.hooks)).toHaveLength(6);
		expect(content.hooks.PreToolUse).toBeDefined();
		expect(content.hooks.PostToolUse).toBeDefined();
		expect(content.hooks.PermissionRequest).toBeDefined();
		expect(content.hooks.UserPromptSubmit).toBeDefined();
		expect(content.hooks.SessionStart).toBeDefined();
		expect(content.hooks.SessionEnd).toBeDefined();
	});

	it("supports async command hooks", () => {
		const path = writeHooksFile({
			PostToolUse: [
				{
					matcher: "Bash",
					hooks: [
						{
							type: "command",
							command: "long-running-task.sh",
							async: true,
							timeout: 300,
							statusMessage: "Running background validation...",
						},
					],
				},
			],
		});
		tempFiles.push(path);

		const content = JSON.parse(readFileSync(path, "utf-8"));
		const hook = content.hooks.PostToolUse[0].hooks[0];
		expect(hook.async).toBe(true);
		expect(hook.statusMessage).toBe("Running background validation...");
	});

	it("creates unique filenames", () => {
		const path1 = writeHooksFile({ PreToolUse: [] });
		const path2 = writeHooksFile({ PreToolUse: [] });
		tempFiles.push(path1, path2);

		expect(path1).not.toBe(path2);
	});

	it("writes to temp directory", () => {
		const path = writeHooksFile({});
		tempFiles.push(path);

		expect(path).toContain("ichabod-hooks-");
	});

	it("supports multiple handlers per matcher", () => {
		const matchers: HookMatcher[] = [
			{
				matcher: "Bash",
				hooks: [
					{ type: "command", command: "validate.sh" },
					{ type: "http", url: "http://localhost:9090/log" },
				],
			},
		];

		const path = writeHooksFile({ PreToolUse: matchers });
		tempFiles.push(path);

		const content = JSON.parse(readFileSync(path, "utf-8"));
		expect(content.hooks.PreToolUse[0].hooks).toHaveLength(2);
		expect(content.hooks.PreToolUse[0].hooks[0].type).toBe("command");
		expect(content.hooks.PreToolUse[0].hooks[1].type).toBe("http");
	});
});

describe("writeSettingsFile", () => {
	it("creates a settings file with hooks", () => {
		const path = writeSettingsFile({
			hooks: {
				PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "validate.sh" }] }],
			},
		});
		tempFiles.push(path);

		expect(existsSync(path)).toBe(true);
		expect(path).toContain("ichabod-settings-");
		const content = JSON.parse(readFileSync(path, "utf-8"));
		expect(content.hooks.PreToolUse).toBeDefined();
	});

	it("creates a settings file with disableAllHooks", () => {
		const path = writeSettingsFile({ disableAllHooks: true });
		tempFiles.push(path);

		const content = JSON.parse(readFileSync(path, "utf-8"));
		expect(content.disableAllHooks).toBe(true);
	});

	it("creates a settings file with hooks and disableAllHooks", () => {
		const path = writeSettingsFile({
			hooks: { Stop: [] },
			disableAllHooks: false,
		});
		tempFiles.push(path);

		const content = JSON.parse(readFileSync(path, "utf-8"));
		expect(content.hooks).toBeDefined();
		expect(content.disableAllHooks).toBe(false);
	});
});

describe("composeSettingsFile", () => {
	it("merges hooks into an existing settings file", () => {
		const basePath = writeSettingsFile({
			disableAllHooks: false,
			model: "sonnet",
		});
		tempFiles.push(basePath);

		const path = composeSettingsFile(basePath, {
			hooks: {
				Stop: [{ matcher: "", hooks: [{ type: "command", command: "cleanup.sh" }] }],
			},
		});
		tempFiles.push(path);

		const content = JSON.parse(readFileSync(path, "utf-8"));
		expect(content.disableAllHooks).toBe(false);
		expect(content.model).toBe("sonnet");
		expect(content.hooks.Stop).toHaveLength(1);
	});

	it("merges hook arrays from inline JSON settings", () => {
		const inlineSettings = JSON.stringify({
			hooks: {
				Stop: [{ matcher: "", hooks: [{ type: "command", command: "base-stop.sh" }] }],
			},
		});

		const path = composeSettingsFile(inlineSettings, {
			hooks: {
				Stop: [{ matcher: "", hooks: [{ type: "command", command: "new-stop.sh" }] }],
			},
		});
		tempFiles.push(path);

		const content = JSON.parse(readFileSync(path, "utf-8"));
		expect(content.hooks.Stop).toHaveLength(2);
		expect(content.hooks.Stop[0].hooks[0].command).toBe("base-stop.sh");
		expect(content.hooks.Stop[1].hooks[0].command).toBe("new-stop.sh");
	});
});

describe("cleanupHooksFile", () => {
	it("deletes the file", () => {
		const path = writeHooksFile({});
		expect(existsSync(path)).toBe(true);

		cleanupHooksFile(path);
		expect(existsSync(path)).toBe(false);
	});

	it("does not throw for non-existent file", () => {
		expect(() => cleanupHooksFile("/tmp/does-not-exist-ever")).not.toThrow();
	});
});

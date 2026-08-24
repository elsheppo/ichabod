/**
 * Tests for engine/flags.ts
 *
 * Snapshot-style: given typed options, assert the exact args array produced.
 * Pure function, no mocking needed.
 */

import { describe, expect, it } from "vitest";
import { buildArgs } from "../../src/engine/flags.js";

describe("buildArgs", () => {
	it("returns empty array for no options", () => {
		expect(buildArgs({})).toEqual([]);
	});

	// ─── Model & LLM ──────────────────────────────────────────────────────

	it("maps model option", () => {
		expect(buildArgs({ model: "haiku" })).toEqual(["--model", "haiku"]);
	});

	it("maps fallback model", () => {
		expect(buildArgs({ fallbackModel: "sonnet" })).toEqual(["--fallback-model", "sonnet"]);
	});

	it("maps effort level", () => {
		expect(buildArgs({ effort: "high" })).toEqual(["--effort", "high"]);
	});

	// ─── Budget & Limits ───────────────────────────────────────────────────

	it("maps budget and turns", () => {
		const args = buildArgs({ maxBudget: 5.0, maxTurns: 10 });
		expect(args).toEqual(["--max-budget-usd", "5", "--max-turns", "10"]);
	});

	// ─── Tool Control ──────────────────────────────────────────────────────

	it("maps tools as comma-separated list", () => {
		expect(buildArgs({ tools: ["Read", "Grep", "Glob"] })).toEqual(["--tools", "Read,Grep,Glob"]);
	});

	it("maps empty tools array to disable all tools", () => {
		expect(buildArgs({ tools: [] })).toEqual(["--tools", ""]);
	});

	it("maps allowedTools as individual args", () => {
		const args = buildArgs({ allowedTools: ["Bash(git *)", "Read"] });
		expect(args).toEqual(["--allowedTools", "Bash(git *)", "Read"]);
	});

	it("maps disallowedTools as individual args", () => {
		const args = buildArgs({ disallowedTools: ["Bash(rm *)", "Bash(sudo *)"] });
		expect(args).toEqual(["--disallowedTools", "Bash(rm *)", "Bash(sudo *)"]);
	});

	// ─── Permissions ───────────────────────────────────────────────────────

	it("maps permission mode", () => {
		expect(buildArgs({ permissionMode: "bypassPermissions" })).toEqual([
			"--permission-mode",
			"bypassPermissions",
		]);
	});

	it("maps permission prompt tool", () => {
		expect(buildArgs({ permissionPromptTool: "mcp__approval__handle" })).toEqual([
			"--permission-prompt-tool",
			"mcp__approval__handle",
		]);
	});

	// ─── System Prompt ─────────────────────────────────────────────────────

	it("maps system prompt", () => {
		expect(buildArgs({ systemPrompt: "You are a helpful assistant" })).toEqual([
			"--system-prompt",
			"You are a helpful assistant",
		]);
	});

	it("maps system prompt file", () => {
		expect(buildArgs({ systemPromptFile: "/tmp/system.md" })).toEqual([
			"--system-prompt-file",
			"/tmp/system.md",
		]);
	});

	it("maps append system prompt", () => {
		expect(buildArgs({ appendSystemPrompt: "Always respond in JSON" })).toEqual([
			"--append-system-prompt",
			"Always respond in JSON",
		]);
	});

	it("maps append system prompt file", () => {
		expect(buildArgs({ appendSystemPromptFile: "/tmp/extra.md" })).toEqual([
			"--append-system-prompt-file",
			"/tmp/extra.md",
		]);
	});

	// ─── Session Management ────────────────────────────────────────────────

	it("maps resume session", () => {
		expect(buildArgs({ resumeSessionId: "abc-123" })).toEqual(["--resume", "abc-123"]);
	});

	it("maps continue session", () => {
		expect(buildArgs({ continueSession: true })).toEqual(["--continue"]);
	});

	it("does not include continue when false", () => {
		expect(buildArgs({ continueSession: false })).toEqual([]);
	});

	it("maps fork session", () => {
		expect(buildArgs({ forkSession: true })).toEqual(["--fork-session"]);
	});

	it("does not include fork session when false", () => {
		expect(buildArgs({ forkSession: false })).toEqual([]);
	});

	it("maps session id", () => {
		expect(buildArgs({ sessionId: "550e8400-e29b-41d4-a716-446655440000" })).toEqual([
			"--session-id",
			"550e8400-e29b-41d4-a716-446655440000",
		]);
	});

	it("maps no session persistence", () => {
		expect(buildArgs({ noSessionPersistence: true })).toEqual(["--no-session-persistence"]);
	});

	it("does not include noSessionPersistence when false", () => {
		expect(buildArgs({ noSessionPersistence: false })).toEqual([]);
	});

	// ─── Context & Configuration ───────────────────────────────────────────

	it("maps settings file", () => {
		expect(buildArgs({ settingsFile: "/tmp/settings.json" })).toEqual([
			"--settings",
			"/tmp/settings.json",
		]);
	});

	it("maps setting sources", () => {
		expect(buildArgs({ settingSources: "user,project" })).toEqual([
			"--setting-sources",
			"user,project",
		]);
	});

	it("maps MCP config", () => {
		const args = buildArgs({ mcpConfig: ["./mcp1.json", "./mcp2.json"] });
		expect(args).toEqual(["--mcp-config", "./mcp1.json", "./mcp2.json"]);
	});

	it("maps strict MCP config", () => {
		expect(buildArgs({ strictMcpConfig: true })).toEqual(["--strict-mcp-config"]);
	});

	it("does not include strict MCP config when false", () => {
		expect(buildArgs({ strictMcpConfig: false })).toEqual([]);
	});

	// ─── Structured Output ─────────────────────────────────────────────────

	it("maps JSON schema", () => {
		const schema = '{"type":"object","properties":{"name":{"type":"string"}}}';
		expect(buildArgs({ jsonSchema: schema })).toEqual(["--json-schema", schema]);
	});

	// ─── Agent & Subagent ──────────────────────────────────────────────────

	it("maps named agent", () => {
		expect(buildArgs({ agent: "code-reviewer" })).toEqual(["--agent", "code-reviewer"]);
	});

	it("maps agents as serialized JSON", () => {
		const agents = {
			reviewer: {
				description: "Reviews code",
				prompt: "Review carefully",
				tools: ["Read", "Grep"],
				model: "sonnet",
				maxTurns: 5,
			},
		};
		const args = buildArgs({ agents });
		expect(args).toEqual(["--agents", JSON.stringify(agents)]);
	});

	// ─── Debugging ─────────────────────────────────────────────────────────

	it("maps verbose flag", () => {
		expect(buildArgs({ verbose: true })).toEqual(["--verbose"]);
	});

	it("does not include verbose when false", () => {
		expect(buildArgs({ verbose: false })).toEqual([]);
	});

	it("maps debug categories", () => {
		expect(buildArgs({ debug: "api,hooks" })).toEqual(["--debug", "api,hooks"]);
	});

	// ─── Directories ───────────────────────────────────────────────────────

	it("maps additional directories", () => {
		expect(buildArgs({ addDirs: ["/tmp/data", "/home/user/docs"] })).toEqual([
			"--add-dir",
			"/tmp/data",
			"/home/user/docs",
		]);
	});

	// ─── Combined ──────────────────────────────────────────────────────────

	it("maps a fully-loaded options object", () => {
		const args = buildArgs({
			model: "opus",
			fallbackModel: "sonnet",
			effort: "high",
			maxBudget: 10.0,
			maxTurns: 5,
			tools: ["Read", "Grep"],
			allowedTools: ["Bash(git *)"],
			disallowedTools: ["Bash(rm *)"],
			permissionMode: "acceptEdits",
			appendSystemPrompt: "Be concise",
			noSessionPersistence: true,
			agent: "reviewer",
			verbose: true,
		});

		expect(args).toEqual([
			"--model",
			"opus",
			"--fallback-model",
			"sonnet",
			"--effort",
			"high",
			"--max-budget-usd",
			"10",
			"--max-turns",
			"5",
			"--tools",
			"Read,Grep",
			"--allowedTools",
			"Bash(git *)",
			"--disallowedTools",
			"Bash(rm *)",
			"--permission-mode",
			"acceptEdits",
			"--append-system-prompt",
			"Be concise",
			"--no-session-persistence",
			"--agent",
			"reviewer",
			"--verbose",
		]);
	});

	it("maps resume + fork session combo", () => {
		const args = buildArgs({
			resumeSessionId: "abc-123",
			forkSession: true,
		});
		expect(args).toEqual(["--resume", "abc-123", "--fork-session"]);
	});

	it("maps strict MCP with MCP config combo", () => {
		const args = buildArgs({
			mcpConfig: ["./sandboxed.json"],
			strictMcpConfig: true,
		});
		expect(args).toEqual(["--mcp-config", "./sandboxed.json", "--strict-mcp-config"]);
	});
});

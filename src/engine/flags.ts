/**
 * engine/flags.ts — DispatchOptions to CLI args builder.
 *
 * Pure function: takes typed options, returns string[] of CLI arguments.
 * No side effects, no I/O. Easy to test via snapshot assertions.
 *
 * Note: `-p` and `--output-format json` are added by spawn.ts, not here.
 * The prompt is also handled by spawn.ts (positional arg or stdin pipe).
 * This module only handles the optional flags.
 */

import type { DispatchOptions } from "../types.js";

/**
 * Convert DispatchOptions into CLI argument array for `claude`.
 *
 * Only includes flags that are explicitly set — no defaults are injected.
 * Order is deterministic for snapshot testing.
 */
export function buildArgs(options: Omit<DispatchOptions, "prompt">): string[] {
	const args: string[] = [];

	// ─── Model & LLM ──────────────────────────────────────────────────────

	if (options.model) {
		args.push("--model", options.model);
	}
	if (options.fallbackModel) {
		args.push("--fallback-model", options.fallbackModel);
	}
	if (options.effort) {
		args.push("--effort", options.effort);
	}

	// ─── Budget & Limits ───────────────────────────────────────────────────

	if (options.maxBudget !== undefined) {
		args.push("--max-budget-usd", options.maxBudget.toString());
	}
	if (options.maxTurns !== undefined) {
		args.push("--max-turns", options.maxTurns.toString());
	}

	// ─── Tool Control ──────────────────────────────────────────────────────

	if (options.tools) {
		args.push("--tools", options.tools.join(","));
	}
	if (options.allowedTools?.length) {
		args.push("--allowedTools", ...options.allowedTools);
	}
	if (options.disallowedTools?.length) {
		args.push("--disallowedTools", ...options.disallowedTools);
	}

	// ─── Permissions ───────────────────────────────────────────────────────

	if (options.permissionMode) {
		args.push("--permission-mode", options.permissionMode);
	}
	if (options.permissionPromptTool) {
		args.push("--permission-prompt-tool", options.permissionPromptTool);
	}

	// ─── System Prompt ─────────────────────────────────────────────────────

	if (options.systemPrompt) {
		args.push("--system-prompt", options.systemPrompt);
	}
	if (options.systemPromptFile) {
		args.push("--system-prompt-file", options.systemPromptFile);
	}
	if (options.appendSystemPrompt) {
		args.push("--append-system-prompt", options.appendSystemPrompt);
	}
	if (options.appendSystemPromptFile) {
		args.push("--append-system-prompt-file", options.appendSystemPromptFile);
	}

	// ─── Session Management ────────────────────────────────────────────────

	if (options.resumeSessionId) {
		args.push("--resume", options.resumeSessionId);
	}
	if (options.continueSession) {
		args.push("--continue");
	}
	if (options.forkSession) {
		args.push("--fork-session");
	}
	if (options.sessionId) {
		args.push("--session-id", options.sessionId);
	}
	if (options.noSessionPersistence) {
		args.push("--no-session-persistence");
	}

	// ─── Context & Configuration ───────────────────────────────────────────

	if (options.settingsFile) {
		args.push("--settings", options.settingsFile);
	}
	if (options.settingSources) {
		args.push("--setting-sources", options.settingSources);
	}
	if (options.mcpConfig?.length) {
		args.push("--mcp-config", ...options.mcpConfig);
	}
	if (options.strictMcpConfig) {
		args.push("--strict-mcp-config");
	}

	// ─── Structured Output ─────────────────────────────────────────────────

	if (options.jsonSchema) {
		args.push("--json-schema", options.jsonSchema);
	}

	// ─── Agent & Subagent ──────────────────────────────────────────────────

	if (options.agent) {
		args.push("--agent", options.agent);
	}
	if (options.agents) {
		args.push("--agents", JSON.stringify(options.agents));
	}

	// ─── Debugging ─────────────────────────────────────────────────────────

	if (options.verbose) {
		args.push("--verbose");
	}
	if (options.debug) {
		args.push("--debug", options.debug);
	}

	// ─── Directories ───────────────────────────────────────────────────────

	if (options.addDirs?.length) {
		args.push("--add-dir", ...options.addDirs);
	}

	return args;
}

/**
 * infra/hooks.ts — Per-dispatch hook injection via --settings.
 *
 * Claude Code supports 16+ hook events and 4 handler types. This module
 * provides typed configuration for all of them and handles temp file
 * lifecycle for per-dispatch injection.
 *
 * Key discovery: Claude Code's `--settings` flag loads additional settings
 * from a file (additive, not replacing). This means hooks can be injected
 * per-dispatch without modifying `.claude/settings.local.json`.
 *
 * Flow:
 * 1. Write hooks config to temp file
 * 2. Pass `--settings /tmp/ichabod-hooks-<uuid>.json` to claude -p
 * 3. Delete temp file after dispatch
 *
 * No user state modified. No cleanup needed beyond temp file deletion.
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ─── Hook Handler Types ────────────────────────────────────────────────────

/**
 * Shell command hook handler. Receives JSON on stdin, returns exit code + stdout.
 * Exit 0 = allow, exit 2 = block, exit 1 = non-blocking error.
 */
export interface CommandHook {
	type: "command";
	/** Shell command to execute. Receives hook input as JSON on stdin. */
	command: string;
	/** Timeout in seconds. Defaults to 600. */
	timeout?: number;
	/** Run asynchronously (non-blocking). Only supported for command type. */
	async?: boolean;
	/** Status message to display while hook runs. */
	statusMessage?: string;
}

/**
 * HTTP webhook handler. Sends JSON as POST body, expects 2xx with JSON/text response.
 */
export interface HttpHook {
	type: "http";
	/** URL to POST hook input to. */
	url: string;
	/** Timeout in seconds. Defaults to 30. */
	timeout?: number;
	/** HTTP headers. Supports env var interpolation ($VAR_NAME). */
	headers?: Record<string, string>;
	/** Env vars allowed for header interpolation. */
	allowedEnvVars?: string[];
}

/**
 * Prompt hook handler. Sends prompt + hook input to Claude Haiku for evaluation.
 * Returns { ok: true/false, reason: "..." }.
 */
export interface PromptHook {
	type: "prompt";
	/** Prompt template. $ARGUMENTS is replaced with hook input JSON. */
	prompt: string;
	/** Model to use for evaluation. Defaults to haiku. */
	model?: string;
	/** Timeout in seconds. Defaults to 30. */
	timeout?: number;
}

/**
 * Agent hook handler. Spawns a subagent with tool access for evaluation.
 * Returns { ok: true/false, reason: "..." }.
 */
export interface AgentHook {
	type: "agent";
	/** Prompt for the agent. $ARGUMENTS is replaced with hook input JSON. */
	prompt: string;
	/** Timeout in seconds. Defaults to 60. */
	timeout?: number;
}

/** Union of all hook handler types. */
export type HookDefinition = CommandHook | HttpHook | PromptHook | AgentHook;

// ─── Hook Matchers ─────────────────────────────────────────────────────────

/**
 * A matcher + handler pair. The matcher is a regex pattern that determines
 * when this hook fires (e.g., tool name for PreToolUse, event type for Notification).
 * Empty string means "always match".
 */
export interface HookMatcher {
	/** Regex pattern to match against the event's discriminant. Empty = always match. */
	matcher: string;
	/** Hook handlers to execute when matched. */
	hooks: HookDefinition[];
}

// ─── Hook Events ───────────────────────────────────────────────────────────

/**
 * All hook event types supported by Claude Code.
 *
 * Blocking events can prevent the action from proceeding.
 * Non-blocking events are informational only.
 *
 * Matchers vary by event:
 * - Tool events (PreToolUse, PostToolUse, etc.): match on tool name
 * - SessionStart: match on trigger (startup, resume, clear, compact)
 * - Notification: match on type (permission_prompt, idle_prompt, etc.)
 * - SubagentStart/Stop: match on agent type name
 * - ConfigChange: match on source (user_settings, project_settings, etc.)
 * - PreCompact: match on trigger (manual, auto)
 * - SessionEnd: match on reason (clear, logout, etc.)
 * - Others: no discriminant (empty matcher = always fire)
 */
export type HookEventName =
	| "SessionStart"
	| "UserPromptSubmit"
	| "PreToolUse"
	| "PermissionRequest"
	| "PostToolUse"
	| "PostToolUseFailure"
	| "Notification"
	| "SubagentStart"
	| "SubagentStop"
	| "Stop"
	| "TeammateIdle"
	| "TaskCompleted"
	| "ConfigChange"
	| "WorktreeCreate"
	| "WorktreeRemove"
	| "PreCompact"
	| "SessionEnd";

/**
 * Full hooks configuration matching Claude Code's settings schema.
 * Every event key is optional — only configure what you need.
 */
export type HooksConfig = Partial<Record<HookEventName, HookMatcher[]>>;

// ─── Settings File Types ───────────────────────────────────────────────────

/**
 * The full settings object written to the temp file.
 * Can include hooks and other additive settings.
 */
export interface SettingsFileContent {
	hooks?: HooksConfig;
	/** Disable all hooks for this dispatch. */
	disableAllHooks?: boolean;
	[key: string]: unknown;
}

// ─── Temp File Lifecycle ───────────────────────────────────────────────────

/**
 * Write a hooks config to a temp file and return the path.
 * Pass the returned path as `settingsFile` in DispatchOptions.
 */
export function writeHooksFile(hooks: HooksConfig): string {
	const settings: SettingsFileContent = { hooks };
	const filename = `ichabod-hooks-${randomUUID()}.json`;
	const filepath = join(tmpdir(), filename);
	writeFileSync(filepath, JSON.stringify(settings), "utf-8");
	return filepath;
}

/**
 * Write a full settings object to a temp file and return the path.
 * Use this when you need to inject both hooks and other settings.
 */
export function writeSettingsFile(settings: SettingsFileContent): string {
	const filename = `ichabod-settings-${randomUUID()}.json`;
	const filepath = join(tmpdir(), filename);
	writeFileSync(filepath, JSON.stringify(settings), "utf-8");
	return filepath;
}

/**
 * Compose an existing settings payload with an overlay and write the merged
 * result to a new temp settings file.
 *
 * The existing payload may be either:
 * - A path to a JSON settings file
 * - An inline JSON object string accepted by Claude's `--settings` flag
 */
export function composeSettingsFile(
	existingSettings: string | undefined,
	overlay: SettingsFileContent,
): string {
	const base = existingSettings ? loadSettings(existingSettings) : {};
	const merged: SettingsFileContent = {
		...base,
		...overlay,
	};

	const hooks = mergeHooks(base.hooks, overlay.hooks);
	if (hooks) {
		merged.hooks = hooks;
	} else {
		merged.hooks = undefined;
	}

	if (overlay.disableAllHooks === undefined && "disableAllHooks" in base) {
		merged.disableAllHooks = base.disableAllHooks;
	}

	return writeSettingsFile(merged);
}

/**
 * Clean up a hooks/settings temp file. Safe to call if file doesn't exist.
 */
export function cleanupHooksFile(filepath: string): void {
	try {
		if (existsSync(filepath)) {
			unlinkSync(filepath);
		}
	} catch {
		// Ignore cleanup failures — temp files will be cleaned by OS
	}
}

function loadSettings(settingsInput: string): SettingsFileContent {
	const trimmed = settingsInput.trim();
	if (!trimmed) {
		return {};
	}

	if (trimmed.startsWith("{")) {
		return parseSettingsJson(trimmed, "inline settings");
	}

	if (!existsSync(trimmed)) {
		throw new Error(`Settings file not found: ${trimmed}`);
	}

	return parseSettingsJson(readFileSync(trimmed, "utf-8"), trimmed);
}

function parseSettingsJson(raw: string, source: string): SettingsFileContent {
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			throw new Error("Settings payload must be a JSON object");
		}
		return parsed as SettingsFileContent;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown JSON parse error";
		throw new Error(`Invalid settings JSON in ${source}: ${message}`);
	}
}

function mergeHooks(
	base: HooksConfig | undefined,
	overlay: HooksConfig | undefined,
): HooksConfig | undefined {
	if (!base && !overlay) {
		return undefined;
	}

	if (!base) {
		return { ...overlay };
	}

	if (!overlay) {
		return { ...base };
	}

	const merged: HooksConfig = { ...base };

	for (const [event, matchers] of Object.entries(overlay) as [HookEventName, HookMatcher[]][]) {
		merged[event] = [...(merged[event] ?? []), ...matchers];
	}

	return merged;
}

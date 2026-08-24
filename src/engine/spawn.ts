/**
 * engine/spawn.ts — Low-level Claude process spawning.
 *
 * Wraps the generic process runner to execute `claude -p` with:
 * - Stdin pipe for prompt delivery (handles long prompts that would exceed shell arg limits)
 * - Stdout/stderr capture
 * - Timeout via SIGTERM → SIGKILL escalation
 * - Proper exit code handling
 *
 * This is the atom. Everything in core/ composes on top of this.
 */

import { runProcess } from "../process/run.js";
import type { SpawnResult } from "../types.js";

/** Default timeout: 5 minutes. Long dispatches with tools can take a while. */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Threshold for using stdin vs positional arg for prompt delivery. */
const STDIN_THRESHOLD_BYTES = 4096;

export interface SpawnClaudeOptions {
	/** CLI args to pass (built by flags.ts). Does NOT include the prompt. */
	args: string[];

	/** The prompt text to send to Claude. */
	prompt: string;

	/** Working directory for the process. */
	cwd?: string;

	/** Timeout in ms. Process gets SIGTERM after this. */
	timeoutMs?: number;

	/** Additional environment variables merged with process.env. */
	env?: Record<string, string>;
}

/**
 * Spawn a headless `claude -p` process and collect its output.
 *
 * Prompt delivery strategy:
 * - Short prompts (<4KB): passed as positional arg (simpler, no stdin race)
 * - Long prompts (>=4KB): piped via stdin (avoids shell arg length limits)
 *
 * Always includes `--output-format json` and `-p` flags.
 */
export async function spawnClaude(options: SpawnClaudeOptions): Promise<SpawnResult> {
	const { args, prompt, cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

	const useStdin = Buffer.byteLength(prompt, "utf-8") >= STDIN_THRESHOLD_BYTES;

	const fullArgs = ["-p", "--output-format", "json", ...args];

	// Short prompts go as positional arg after all flags
	if (!useStdin) {
		fullArgs.push(prompt);
	}

	return runProcess({
		command: "claude",
		args: fullArgs,
		stdin: useStdin ? prompt : undefined,
		cwd,
		env,
		timeoutMs,
	});
}

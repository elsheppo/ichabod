/**
 * process/run.ts — Generic child-process execution with timeout and stdio capture.
 *
 * Providers build command invocations; this runner handles the process lifecycle.
 */

import { spawn } from "node:child_process";
import type { SpawnResult } from "../types.js";

/** Default timeout: 5 minutes. Long dispatches with tools can take a while. */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Grace period between SIGTERM and SIGKILL. */
const KILL_GRACE_MS = 3000;

export interface ProcessInvocation {
	command: string;
	args: string[];
	stdin?: string;
	cwd?: string;
	timeoutMs?: number;
	env?: Record<string, string>;
}

export async function runProcess(invocation: ProcessInvocation): Promise<SpawnResult> {
	const { command, args, stdin, cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS } = invocation;

	const child = spawn(command, args, {
		cwd,
		env: env ? { ...process.env, ...env } : process.env,
		stdio: [stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
	});

	if (stdin !== undefined && child.stdin) {
		child.stdin.write(stdin);
		child.stdin.end();
	}

	return new Promise<SpawnResult>((resolve) => {
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let timedOut = false;
		let killTimer: ReturnType<typeof setTimeout> | null = null;

		child.stdout?.on("data", (chunk: Buffer) => {
			stdoutChunks.push(chunk);
		});

		child.stderr?.on("data", (chunk: Buffer) => {
			stderrChunks.push(chunk);
		});

		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
			killTimer = setTimeout(() => {
				child.kill("SIGKILL");
			}, KILL_GRACE_MS);
		}, timeoutMs);

		child.on("close", (exitCode) => {
			clearTimeout(timer);
			if (killTimer) {
				clearTimeout(killTimer);
			}

			resolve({
				stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
				stderr: Buffer.concat(stderrChunks).toString("utf-8"),
				exitCode,
				timedOut,
			});
		});

		child.on("error", (error) => {
			clearTimeout(timer);
			if (killTimer) {
				clearTimeout(killTimer);
			}

			resolve({
				stdout: "",
				stderr: `Spawn error: ${error.message}`,
				exitCode: null,
				timedOut: false,
			});
		});
	});
}

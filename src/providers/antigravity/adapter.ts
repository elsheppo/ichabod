import { runProcess } from "../../process/run.js";
import type {
	AntigravityJsonEnvelope,
	DispatchOptions,
	DispatchResult,
	SpawnResult,
} from "../../types.js";
import type { ProviderAdapter } from "../types.js";

export const antigravityAdapter: ProviderAdapter = {
	id: "antigravity",

	async spawn(options: DispatchOptions): Promise<SpawnResult> {
		validateOptions(options);
		const args = ["-p", options.prompt, "--output-format", "json"];

		if (options.model) args.push("--model", options.model);
		if (options.effort) args.push("--effort", options.effort);
		if (options.agent) args.push("--agent", options.agent);
		if (options.jsonSchema) args.push("--json-schema", options.jsonSchema);
		if (options.addDirs?.length) {
			for (const dir of options.addDirs) args.push("--add-dir", dir);
		}
		if (options.resumeSessionId) {
			args.push("--conversation", options.resumeSessionId);
		} else if (options.continueSession) {
			args.push("--continue");
		}
		switch (options.permissionMode) {
			case "acceptEdits":
				args.push("--mode", "accept-edits");
				break;
			case "plan":
				args.push("--mode", "plan");
				break;
			case "bypassPermissions":
				args.push("--dangerously-skip-permissions");
				break;
		}

		return runProcess({
			command: "agy",
			args,
			cwd: options.cwd,
			env: options.env,
			timeoutMs: options.timeoutMs,
		});
	},

	parse(spawn: SpawnResult): DispatchResult {
		if (spawn.timedOut) {
			return makeResult({
				envelope: {},
				ok: false,
				errors: ["Antigravity dispatch timed out"],
				spawn,
			});
		}

		const parsed = parseJsonPayload(spawn.stdout, spawn.stderr);
		if (!isAntigravityEnvelope(parsed)) {
			return makeResult({
				envelope: {},
				ok: false,
				errors: [spawn.stderr.trim() || "Could not parse Antigravity headless JSON output"],
				spawn,
			});
		}

		const ok = spawn.exitCode === 0 && parsed.status === "SUCCESS";
		return makeResult({
			envelope: parsed,
			ok,
			errors: ok ? [] : [readError(parsed, spawn)],
			spawn,
		});
	},
};

function validateOptions(options: DispatchOptions): void {
	if (options.effort === "max") {
		throw new Error('Antigravity supports effort values "low", "medium", and "high", not "max"');
	}
	if (options.resumeSessionId && options.continueSession) {
		throw new Error("Antigravity cannot use resumeSessionId and continueSession together");
	}
	if (
		options.permissionMode &&
		!["acceptEdits", "plan", "bypassPermissions"].includes(options.permissionMode)
	) {
		throw new Error(
			`Antigravity does not support Ichabod permission mode ${JSON.stringify(options.permissionMode)}`,
		);
	}

	const unsupported: Array<[keyof DispatchOptions, boolean]> = [
		["fallbackModel", options.fallbackModel !== undefined],
		["maxBudget", options.maxBudget !== undefined],
		["maxTurns", options.maxTurns !== undefined],
		["tools", options.tools !== undefined],
		["allowedTools", options.allowedTools !== undefined],
		["disallowedTools", options.disallowedTools !== undefined],
		["permissionPromptTool", options.permissionPromptTool !== undefined],
		["systemPrompt", options.systemPrompt !== undefined],
		["systemPromptFile", options.systemPromptFile !== undefined],
		["appendSystemPrompt", options.appendSystemPrompt !== undefined],
		["appendSystemPromptFile", options.appendSystemPromptFile !== undefined],
		["forkSession", options.forkSession === true],
		["sessionId", options.sessionId !== undefined],
		["noSessionPersistence", options.noSessionPersistence === true],
		["settingsFile", options.settingsFile !== undefined],
		["settingSources", options.settingSources !== undefined],
		["mcpConfig", options.mcpConfig !== undefined],
		["strictMcpConfig", options.strictMcpConfig === true],
		["agents", options.agents !== undefined],
		["verbose", options.verbose === true],
		["debug", options.debug !== undefined],
	];
	for (const [name, wasRequested] of unsupported) {
		if (wasRequested) {
			throw new Error(`Antigravity CLI does not support Ichabod option ${name}`);
		}
	}
}

function makeResult(input: {
	envelope: Partial<AntigravityJsonEnvelope>;
	ok: boolean;
	errors: string[];
	spawn: SpawnResult;
}): DispatchResult {
	const { envelope, ok, errors, spawn } = input;
	const usage = envelope.usage;
	const durationMs = readNumber(envelope.duration_seconds) * 1000;

	return {
		result: typeof envelope.response === "string" ? envelope.response : "",
		ok,
		subtype: ok ? "success" : "error_during_execution",
		sessionId: typeof envelope.conversation_id === "string" ? envelope.conversation_id : "",
		costUsd: 0,
		durationMs,
		durationApiMs: durationMs,
		numTurns: readNumber(envelope.num_turns),
		usage: {
			inputTokens: readNumber(usage?.input_tokens),
			outputTokens: readNumber(usage?.output_tokens),
			cacheCreationTokens: 0,
			cacheReadTokens: readNumber(usage?.cache_read_tokens),
			thinkingTokens: readNumber(usage?.thinking_tokens),
			totalTokens: readNumber(usage?.total_tokens),
		},
		modelUsage: {},
		permissionDenials: [],
		errors,
		structuredOutput: envelope.structured_output,
		stdout: spawn.stdout,
		stderr: spawn.stderr,
		rawEnvelope: envelope,
	};
}

function parseJsonPayload(stdout: string, stderr: string): unknown {
	for (const candidate of [stdout, stderr]) {
		try {
			return JSON.parse(candidate);
		} catch {
			// Try the other output stream before reporting a parse failure.
		}
	}
	return null;
}

function isAntigravityEnvelope(value: unknown): value is AntigravityJsonEnvelope {
	if (!value || typeof value !== "object") return false;
	return typeof (value as Record<string, unknown>).status === "string";
}

function readError(envelope: AntigravityJsonEnvelope, spawn: SpawnResult): string {
	if (typeof envelope.error === "string" && envelope.error.trim()) return envelope.error;
	if (envelope.error && typeof envelope.error === "object") {
		const message = (envelope.error as Record<string, unknown>).message;
		if (typeof message === "string" && message.trim()) return message;
	}
	return spawn.stderr.trim() || `Antigravity finished with status ${envelope.status}`;
}

function readNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

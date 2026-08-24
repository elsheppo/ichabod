import { buildArgs } from "../../engine/flags.js";
import { toDispatchResult } from "../../engine/parse.js";
import { spawnClaude } from "../../engine/spawn.js";
import type { DispatchOptions, SpawnResult } from "../../types.js";
import type { ProviderAdapter } from "../types.js";

function normalizeClaudeOptions(options: DispatchOptions): DispatchOptions {
	if (!options.jsonSchema) {
		return options;
	}

	if (options.maxTurns === undefined || options.maxTurns < 2) {
		return {
			...options,
			maxTurns: 2,
		};
	}

	return options;
}

export const claudeAdapter: ProviderAdapter = {
	id: "claude",

	spawn(options: DispatchOptions): Promise<SpawnResult> {
		const normalized = normalizeClaudeOptions(options);
		const { prompt, timeoutMs, cwd, env, ...flagOptions } = normalized;
		return spawnClaude({
			args: buildArgs(flagOptions),
			prompt,
			cwd,
			env,
			timeoutMs,
		});
	},

	parse(spawn) {
		return toDispatchResult(spawn);
	},
};

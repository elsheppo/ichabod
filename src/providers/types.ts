import type { DispatchOptions, DispatchResult, SpawnResult } from "../types.js";

export type ProviderId = "claude" | "codex" | "antigravity";

export interface ProviderAdapter {
	readonly id: ProviderId;
	spawn(options: DispatchOptions): Promise<SpawnResult>;
	parse(spawn: SpawnResult): DispatchResult;
}

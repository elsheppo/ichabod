import { UnsupportedProviderError } from "../types.js";
import { antigravityAdapter } from "./antigravity/adapter.js";
import { claudeAdapter } from "./claude/adapter.js";
import { codexAdapter } from "./codex/adapter.js";
import type { ProviderAdapter, ProviderId } from "./types.js";

const adapters: Record<ProviderId, ProviderAdapter | null> = {
	claude: claudeAdapter,
	codex: codexAdapter,
	antigravity: antigravityAdapter,
};

export function resolveProviderAdapter(provider: ProviderId = "claude"): ProviderAdapter {
	const adapter = adapters[provider];
	if (!adapter) {
		throw new UnsupportedProviderError(provider);
	}

	return adapter;
}

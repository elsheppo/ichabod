import type { ProviderTarget, TargetCatalogName } from "../types.js";

const CLAUDE_PANEL: ProviderTarget[] = [
	{
		id: "claude-sonnet",
		label: "Claude Sonnet",
		dispatchOptions: {
			provider: "claude",
			model: "sonnet",
		},
	},
	{
		id: "claude-opus",
		label: "Claude Opus",
		dispatchOptions: {
			provider: "claude",
			model: "opus",
		},
	},
];

const CODEX_PANEL: ProviderTarget[] = [
	{
		id: "codex-default",
		label: "Codex (default)",
		dispatchOptions: {
			provider: "codex",
			effort: "medium",
		},
	},
	{
		id: "codex-high",
		label: "Codex (high effort)",
		dispatchOptions: {
			provider: "codex",
			effort: "high",
		},
	},
];

const ANTIGRAVITY_PANEL: ProviderTarget[] = [
	{
		id: "antigravity-default",
		label: "Antigravity (default)",
		dispatchOptions: {
			provider: "antigravity",
		},
	},
	{
		id: "antigravity-high",
		label: "Antigravity (high effort)",
		dispatchOptions: {
			provider: "antigravity",
			effort: "high",
		},
	},
];

const FRONTIER_ALL: ProviderTarget[] = [...CLAUDE_PANEL, ...CODEX_PANEL, ...ANTIGRAVITY_PANEL];

const BUILTIN_CATALOGS: Record<TargetCatalogName, ProviderTarget[]> = {
	"claude-panel": CLAUDE_PANEL,
	"codex-panel": CODEX_PANEL,
	"antigravity-panel": ANTIGRAVITY_PANEL,
	"frontier-all": FRONTIER_ALL,
	"structured-output-panel": FRONTIER_ALL,
};

function cloneTarget(target: ProviderTarget): ProviderTarget {
	return {
		...target,
		dispatchOptions: { ...target.dispatchOptions },
	};
}

/**
 * Return cloned targets for a built-in catalog.
 * Catalog contents are intentionally local defaults and may be edited over time.
 */
export function getTargetCatalog(name: TargetCatalogName): ProviderTarget[] {
	return BUILTIN_CATALOGS[name].map(cloneTarget);
}

/**
 * List the built-in target catalogs available in this build.
 */
export function listTargetCatalogs(): TargetCatalogName[] {
	return Object.keys(BUILTIN_CATALOGS) as TargetCatalogName[];
}

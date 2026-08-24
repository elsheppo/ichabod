import type {
	DispatchOptions,
	ProviderTarget,
	ProviderTargetInput,
	TargetCatalogName,
	TargetSpecifier,
} from "../types.js";
import { getTargetCatalog } from "./catalog.js";

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function defaultTargetId(dispatchOptions: Omit<DispatchOptions, "prompt">): string {
	const provider = dispatchOptions.provider ?? "claude";
	const model = dispatchOptions.model ? slugify(dispatchOptions.model) : "default";
	const effort = dispatchOptions.effort ? slugify(dispatchOptions.effort) : null;

	return [provider, model, effort].filter(Boolean).join("-");
}

function defaultTargetLabel(dispatchOptions: Omit<DispatchOptions, "prompt">): string {
	const provider = dispatchOptions.provider ?? "claude";
	const model = dispatchOptions.model ?? "default";
	const effort = dispatchOptions.effort ? ` (${dispatchOptions.effort})` : "";

	return `${provider}:${model}${effort}`;
}

function normalizeTarget(target: ProviderTargetInput): ProviderTarget {
	return {
		id: target.id ?? defaultTargetId(target.dispatchOptions),
		label: target.label ?? defaultTargetLabel(target.dispatchOptions),
		dispatchOptions: { ...target.dispatchOptions },
	};
}

function expandOne(specifier: TargetSpecifier): ProviderTarget[] {
	if (typeof specifier === "string") {
		return getTargetCatalog(specifier as TargetCatalogName);
	}

	return [normalizeTarget(specifier)];
}

/**
 * Expand catalogs and explicit targets into a normalized flat target list.
 * Throws when duplicate target IDs are produced because downstream storage relies on stable IDs.
 */
export function expandTargets(specifiers: TargetSpecifier | TargetSpecifier[]): ProviderTarget[] {
	const items = Array.isArray(specifiers) ? specifiers : [specifiers];
	const targets = items.flatMap(expandOne);
	const seen = new Set<string>();

	for (const target of targets) {
		if (seen.has(target.id)) {
			throw new Error(`Duplicate target id "${target.id}" encountered during fanout expansion`);
		}
		seen.add(target.id);
	}

	return targets;
}

import { createHash } from "node:crypto";

export function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}

	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
			a.localeCompare(b),
		);
		return `{${entries
			.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
			.join(",")}}`;
	}

	return JSON.stringify(value);
}

export function hashJsonValue(value: unknown): string {
	return createHash("sha256").update(stableStringify(value)).digest("hex");
}

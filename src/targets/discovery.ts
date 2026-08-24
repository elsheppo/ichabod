import { spawnSync } from "node:child_process";
import type { ProviderId } from "../providers/types.js";
import type { ProviderAvailability, ProviderTarget, TargetAvailability } from "../types.js";

const PROVIDER_COMMANDS: Record<ProviderId, string> = {
	claude: "claude",
	codex: "codex",
	antigravity: "agy",
};

/**
 * Probe local CLI availability for one or more providers.
 * This is intentionally lightweight: command presence plus best-effort version capture.
 */
export function discoverProviders(
	providers: ProviderId[] = ["claude", "codex", "antigravity"],
): ProviderAvailability[] {
	return providers.map((provider) => {
		const command = PROVIDER_COMMANDS[provider];
		const result = spawnSync(command, ["--version"], {
			encoding: "utf-8",
		});

		if (result.error) {
			return {
				provider,
				command,
				available: false,
				error: result.error.message,
			};
		}

		if (result.status !== 0) {
			const stderr = result.stderr?.trim();
			return {
				provider,
				command,
				available: false,
				error: stderr || `Exited with status ${result.status}`,
			};
		}

		const version = result.stdout?.trim() || result.stderr?.trim() || undefined;

		return {
			provider,
			command,
			available: true,
			version,
		};
	});
}

/**
 * Annotate targets with provider availability to support preflight checks before fanout.
 */
export function discoverTargets(targets: ProviderTarget[]): TargetAvailability[] {
	const uniqueProviders = [
		...new Set(targets.map((target) => target.dispatchOptions.provider ?? "claude")),
	];
	const discovered = new Map(
		discoverProviders(uniqueProviders).map((entry) => [entry.provider, entry]),
	);

	return targets.map((target) => ({
		target,
		availability: discovered.get(target.dispatchOptions.provider ?? "claude") ?? {
			provider: target.dispatchOptions.provider ?? "claude",
			command: PROVIDER_COMMANDS[target.dispatchOptions.provider ?? "claude"],
			available: false,
			error: "Provider discovery did not return an availability record",
		},
	}));
}

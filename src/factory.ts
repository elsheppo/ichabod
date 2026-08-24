/**
 * factory.ts — Cross-cutting composition via ichabod.create().
 *
 * The factory sets a ceiling for all dispatches:
 * - Shared throttle (concurrency, delay, jitter)
 * - Shared cost tracker (cumulative budget)
 * - Scope ceiling (tools, permissions — steps can narrow but not widen)
 * - Default model and timeout
 *
 * @example
 * ```ts
 * import { create } from "ichabod-harness";
 *
 * const ic = create({
 *   throttle: { minDelay: 1000, maxConcurrency: 2 },
 *   maxBudget: 10.0,
 *   model: "sonnet",
 *   allowedTools: ["Read", "Grep", "Glob"],
 * });
 *
 * // All three share the same throttle, cost tracker, and scope ceiling
 * await ic.dispatch({ prompt: "..." });
 * await ic.batch({ items, template });
 * await ic.pipeline({ steps: [...] });
 * ```
 */

import { batch as coreBatch } from "./core/batch.js";
import { type DispatchDeps, dispatch as coreDispatch, dispatchWithHooks } from "./core/dispatch.js";
import { fanout as coreFanout } from "./core/fanout.js";
import { loop as coreLoop } from "./core/loop.js";
import { pipeline as corePipeline } from "./core/pipeline.js";
import { sweep as coreSweep } from "./core/sweep.js";
import { type CostTracker, createCostTracker } from "./infra/cost.js";
import type { HooksConfig } from "./infra/hooks.js";
import { createThrottle } from "./infra/throttle.js";
import type {
	BatchOptions,
	BatchResult,
	DispatchOptions,
	DispatchResult,
	FanoutOptions,
	FanoutResult,
	IchabodConfig,
	LoopOptions,
	LoopResult,
	PipelineOptions,
	PipelineResult,
	ProviderTargetInput,
	SweepOptions,
	SweepResult,
} from "./types.js";

/**
 * The Ichabod factory instance. Provides all primitives with shared
 * cross-cutting concerns (throttle, cost, scope).
 */
export interface Ichabod {
	/** Single headless dispatch. */
	dispatch(options: DispatchOptions): Promise<DispatchResult>;

	/** Dispatch with per-call hooks injection. */
	dispatchWithHooks(options: DispatchOptions, hooks: HooksConfig): Promise<DispatchResult>;

	/** Map prompt template over N items. */
	batch<T>(options: BatchOptions<T>): Promise<BatchResult<T>>;

	/** Execute one prompt across many provider/model targets. */
	fanout(options: FanoutOptions): Promise<FanoutResult>;

	/** Run a prompt x schema-variant x target matrix and persist artifacts if configured. */
	sweep(options: SweepOptions): Promise<SweepResult>;

	/** Chain steps with context accumulation. */
	pipeline(options: PipelineOptions): Promise<PipelineResult>;

	/** Repeat dispatch until completion predicate. */
	loop(options: LoopOptions): Promise<LoopResult>;

	/** The shared cost tracker — read spent/remaining. */
	readonly costs: CostTracker;
}

/**
 * Narrow dispatch options against the factory's scope ceiling.
 *
 * Rules:
 * - tools: intersection (step can't add tools factory didn't allow)
 * - disallowedTools: union (step can deny more)
 * - permissionMode: step can only make more restrictive
 */
function narrowOptions(
	options: Omit<DispatchOptions, "prompt">,
	config: IchabodConfig,
	applyDefaults = true,
): Omit<DispatchOptions, "prompt"> {
	const narrowed = { ...options };

	// Apply defaults from factory
	if (applyDefaults && config.model && !narrowed.model) {
		narrowed.model = config.model;
	}
	if (applyDefaults && config.provider && !narrowed.provider) {
		narrowed.provider = config.provider;
	}
	if (applyDefaults && config.cwd && !narrowed.cwd) {
		narrowed.cwd = config.cwd;
	}
	if (applyDefaults && config.timeoutMs && !narrowed.timeoutMs) {
		narrowed.timeoutMs = config.timeoutMs;
	}

	// Scope narrowing: allowedTools intersection
	if (config.allowedTools) {
		if (narrowed.allowedTools) {
			// Intersection: only tools in both
			const ceiling = new Set(config.allowedTools);
			narrowed.allowedTools = narrowed.allowedTools.filter((t) => ceiling.has(t));
		} else if (applyDefaults) {
			narrowed.allowedTools = [...config.allowedTools];
		}
	}

	// Scope narrowing: disallowedTools union
	if (config.disallowedTools) {
		if (narrowed.disallowedTools) {
			const merged = new Set([...narrowed.disallowedTools, ...config.disallowedTools]);
			narrowed.disallowedTools = [...merged];
		} else if (applyDefaults) {
			narrowed.disallowedTools = [...config.disallowedTools];
		}
	}

	// Scope narrowing: permissionMode (only toward more restrictive)
	if (config.permissionMode) {
		if (narrowed.permissionMode) {
			narrowed.permissionMode = moreRestrictivePermissionMode(
				narrowed.permissionMode,
				config.permissionMode,
			);
		} else if (applyDefaults) {
			narrowed.permissionMode = config.permissionMode;
		}
	}

	return narrowed;
}

function narrowTarget(target: ProviderTargetInput, config: IchabodConfig): ProviderTargetInput {
	return {
		...target,
		dispatchOptions: narrowOptions(target.dispatchOptions, config, false),
	};
}

function moreRestrictivePermissionMode(
	requested: NonNullable<DispatchOptions["permissionMode"]>,
	ceiling: NonNullable<DispatchOptions["permissionMode"]>,
): DispatchOptions["permissionMode"] {
	const rank: Record<NonNullable<DispatchOptions["permissionMode"]>, number> = {
		bypassPermissions: 0,
		acceptEdits: 1,
		auto: 1,
		manual: 2,
		dontAsk: 3,
		plan: 4,
	};

	return rank[requested] >= rank[ceiling] ? requested : ceiling;
}

/**
 * Create an Ichabod factory instance with shared cross-cutting concerns.
 */
export function create(config: IchabodConfig = {}): Ichabod {
	const throttle = createThrottle(config.throttle);
	const costTracker = createCostTracker(config.maxBudget);

	const deps: DispatchDeps = { throttle, costTracker };

	return {
		async dispatch(options) {
			const { prompt, ...rest } = options;
			const narrowed = narrowOptions(rest, config);
			return coreDispatch({ ...narrowed, prompt }, deps);
		},

		async dispatchWithHooks(options, hooks) {
			const { prompt, ...rest } = options;
			const narrowed = narrowOptions(rest, config);
			return dispatchWithHooks({ ...narrowed, prompt }, hooks, deps);
		},

		async batch<T>(options: BatchOptions<T>) {
			const narrowedDispatchOptions = narrowOptions(options.dispatchOptions ?? {}, config);
			return coreBatch({ ...options, dispatchOptions: narrowedDispatchOptions }, deps);
		},

		async fanout(options) {
			const narrowedDispatchOptions = narrowOptions(options.dispatchOptions ?? {}, config);
			const targetInputs = Array.isArray(options.targets) ? options.targets : [options.targets];
			const narrowedTargets = targetInputs.map((target) =>
				typeof target === "string" ? target : narrowTarget(target, config),
			);

			return coreFanout(
				{ ...options, targets: narrowedTargets, dispatchOptions: narrowedDispatchOptions },
				deps,
			);
		},

		async sweep(options) {
			const narrowedDispatchOptions = narrowOptions(options.dispatchOptions ?? {}, config);
			const targetInputs = Array.isArray(options.targets) ? options.targets : [options.targets];
			const narrowedTargets = targetInputs.map((target) =>
				typeof target === "string" ? target : narrowTarget(target, config),
			);

			return coreSweep(
				{ ...options, targets: narrowedTargets, dispatchOptions: narrowedDispatchOptions },
				deps,
			);
		},

		async pipeline(options) {
			const narrowedBaseOptions = narrowOptions(options.dispatchOptions ?? {}, config);
			const narrowedSteps = options.steps.map((step) => ({
				...step,
				dispatchOptions: step.dispatchOptions
					? narrowOptions(step.dispatchOptions, config, false)
					: step.dispatchOptions,
			}));

			return corePipeline(
				{ ...options, steps: narrowedSteps, dispatchOptions: narrowedBaseOptions },
				deps,
			);
		},

		async loop(options) {
			const narrowedDispatchOptions = narrowOptions(options.dispatchOptions ?? {}, config);
			return coreLoop({ ...options, dispatchOptions: narrowedDispatchOptions }, deps);
		},

		get costs() {
			return costTracker;
		},
	};
}

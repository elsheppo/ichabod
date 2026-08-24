/**
 * Ichabod — A structured-output harness for agent CLIs.
 *
 * Public library exports. Everything a recipe file needs.
 */

// Types — everything
export type {
	ClaudeJsonEnvelope,
	AntigravityJsonEnvelope,
	ProviderJsonEnvelope,
	ClaudeResultSubtype,
	ClaudeUsage,
	ClaudeModelUsage,
	ClaudePermissionDenial,
	ProviderId,
	DispatchOptions,
	DispatchResult,
	SpawnResult,
	AgentDefinition,
	BatchOptions,
	BatchItemResult,
	BatchResult,
	ProviderTarget,
	ProviderTargetInput,
	TargetCatalogName,
	TargetSpecifier,
	FanoutOptions,
	FanoutItemResult,
	FanoutSummary,
	FanoutResult,
	SweepPrompt,
	SweepPromptInput,
	SweepOptions,
	SweepCellResult,
	SweepSummary,
	SweepResult,
	ProviderAvailability,
	TargetAvailability,
	SerializedExecutionError,
	PipelineContext,
	PipelineStep,
	PipelineOptions,
	PipelineResult,
	LoopOptions,
	LoopResult,
	IchabodConfig,
	ThrottleConfig,
} from "./types.js";
export type {
	OutputContract,
	ValidationResult,
	ExecutionSample,
} from "./experiment/types.js";
export type {
	SchemaVariantKind,
	SchemaVariantDescriptor,
	CompiledSchemaVariant,
	SchemaVariantOptions,
} from "./schema/variants.js";
export type { RunManifest } from "./store/run.js";
export type { StoredSampleRecord } from "./store/sample.js";

// Error classes
export {
	BudgetExceededError,
	DispatchTimeoutError,
	ParseError,
	UnsupportedProviderError,
} from "./types.js";

// Factory — the main entry point
export { create, type Ichabod } from "./factory.js";

// Core primitives (also accessible standalone, without factory)
export { dispatch, dispatchWithHooks } from "./core/dispatch.js";
export { batch } from "./core/batch.js";
export { fanout } from "./core/fanout.js";
export { sweep } from "./core/sweep.js";
export { pipeline } from "./core/pipeline.js";
export { loop } from "./core/loop.js";
export { toExecutionSample } from "./experiment/normalize.js";
export { createOutputContract } from "./output/contracts.js";
export { validateStructuredOutput } from "./output/validate.js";
export { compileSchemaSource } from "./schema/compile.js";
export { hashJsonValue, stableStringify } from "./schema/hash.js";
export {
	applyDocsVariant,
	applyNamingVariant,
	applyConstraintVariant,
	applyStructureVariant,
	cloneSchema,
} from "./schema/perturb.js";
export { createSchemaVariants } from "./schema/variants.js";

// Engine (low-level, mostly for testing/debugging)
export { spawnClaude } from "./engine/spawn.js";
export { parseEnvelope, toDispatchResult, stripMarkdownFences } from "./engine/parse.js";
export { buildArgs } from "./engine/flags.js";
export { runProcess, type ProcessInvocation } from "./process/run.js";
export { resolveProviderAdapter } from "./providers/registry.js";
export { getTargetCatalog, listTargetCatalogs } from "./targets/catalog.js";
export { expandTargets } from "./targets/expand.js";
export { discoverProviders, discoverTargets } from "./targets/discovery.js";
export { createFilesystemRunStore, type FilesystemStoreOptions } from "./store/filesystem.js";

// Infrastructure (mostly internal, but useful for advanced usage)
export { createThrottle, type Throttle } from "./infra/throttle.js";
export { createCostTracker, type CostTracker } from "./infra/cost.js";
export { renderTemplate } from "./infra/template.js";
export {
	writeHooksFile,
	writeSettingsFile,
	cleanupHooksFile,
	type HooksConfig,
	type HookEventName,
	type HookDefinition,
	type HookMatcher,
	type CommandHook,
	type HttpHook,
	type PromptHook,
	type AgentHook,
	type SettingsFileContent,
} from "./infra/hooks.js";

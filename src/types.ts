/**
 * Ichabod — A structured-output harness for agent CLIs.
 *
 * Common sampling contracts plus provider-specific execution and envelope types.
 */

export type { ProviderId } from "./providers/types.js";

// ─── Claude CLI JSON Envelope ────────────────────────────────────────────────

/**
 * The raw JSON envelope returned by `claude -p --output-format json`.
 * This is the wire format — Ichabod normalizes it into {@link DispatchResult}.
 */
export interface ClaudeJsonEnvelope {
	type: "result";
	subtype: ClaudeResultSubtype;
	is_error: boolean;
	duration_ms: number;
	duration_api_ms: number;
	num_turns: number;
	result?: string;
	session_id: string;
	total_cost_usd: number;
	usage: ClaudeUsage;
	modelUsage: Record<string, ClaudeModelUsage>;
	permission_denials: ClaudePermissionDenial[];
	uuid: string;
	errors?: string[];
	/** Present when --json-schema is used */
	structured_output?: unknown;
}

/** Headless JSON envelope emitted by Antigravity CLI (`agy`). */
export interface AntigravityJsonEnvelope {
	conversation_id?: string;
	status: string;
	response?: string;
	duration_seconds?: number;
	num_turns?: number;
	structured_output?: unknown;
	json_schema?: unknown;
	error?: string | Record<string, unknown>;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		thinking_tokens?: number;
		cache_read_tokens?: number;
		total_tokens?: number;
	};
	[key: string]: unknown;
}

/** Raw provider output retained for diagnostics. */
export type ProviderJsonEnvelope = ClaudeJsonEnvelope | Partial<AntigravityJsonEnvelope>;

export type ClaudeResultSubtype =
	| "success"
	| "error_max_turns"
	| "error_during_execution"
	| "error_max_budget_usd"
	| "error_max_structured_output_retries";

export interface ClaudeUsage {
	input_tokens: number;
	cache_creation_input_tokens: number;
	cache_read_input_tokens: number;
	output_tokens: number;
	server_tool_use: {
		web_search_requests: number;
		web_fetch_requests: number;
	};
	service_tier: string;
	cache_creation: {
		ephemeral_1h_input_tokens: number;
		ephemeral_5m_input_tokens: number;
	};
}

export interface ClaudeModelUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	webSearchRequests: number;
	costUSD: number;
	contextWindow: number;
	maxOutputTokens: number;
}

export interface ClaudePermissionDenial {
	tool_name: string;
	tool_use_id: string;
	tool_input: Record<string, unknown>;
}

// ─── Dispatch Options ────────────────────────────────────────────────────────

/**
 * Options for one provider-backed sample. Adapters translate supported fields
 * into native CLI flags and reject material options without a safe equivalent.
 */
export interface DispatchOptions {
	/** The prompt to send. Required. */
	prompt: string;

	/** Which provider should execute this dispatch. Defaults to Claude today. */
	provider?: import("./providers/types.js").ProviderId;

	// ─── Model & LLM ──────────────────────────────────────────────────────

	/** Model alias ("haiku", "sonnet", "opus") or full model name. */
	model?: string;

	/** Fallback model if primary is overloaded. */
	fallbackModel?: string;

	/** Reasoning effort: low, medium, high, max. */
	effort?: "low" | "medium" | "high" | "max";

	// ─── Budget & Limits ───────────────────────────────────────────────────

	/** Maximum dollar spend for this dispatch. */
	maxBudget?: number;

	/** Maximum agentic turns before stopping. */
	maxTurns?: number;

	// ─── Tool Control ──────────────────────────────────────────────────────

	/** Tools available to Claude (whitelist). Empty array = no tools. */
	tools?: string[];

	/** Tools to auto-approve (no permission prompt). Supports pattern syntax. */
	allowedTools?: string[];

	/** Tools to always deny. Takes precedence over allowedTools. */
	disallowedTools?: string[];

	// ─── Permissions ───────────────────────────────────────────────────────

	/** Permission mode for the session. */
	permissionMode?: "acceptEdits" | "auto" | "bypassPermissions" | "manual" | "plan" | "dontAsk";

	/** MCP tool to handle permission prompts in non-interactive mode. */
	permissionPromptTool?: string;

	// ─── System Prompt ─────────────────────────────────────────────────────

	/** Replace the entire system prompt (inline text). */
	systemPrompt?: string;

	/** Replace the entire system prompt (load from file). */
	systemPromptFile?: string;

	/** Append to the default system prompt (inline text). */
	appendSystemPrompt?: string;

	/** Append to the default system prompt (load from file). */
	appendSystemPromptFile?: string;

	// ─── Session Management ────────────────────────────────────────────────

	/** Resume a prior session by ID. */
	resumeSessionId?: string;

	/** Resume the most recent conversation in the working directory. */
	continueSession?: boolean;

	/** Create a new session ID when resuming (don't overwrite the original). */
	forkSession?: boolean;

	/** Use a specific UUID for the session. */
	sessionId?: string;

	/** Don't persist session to disk. */
	noSessionPersistence?: boolean;

	// ─── Context & Configuration ───────────────────────────────────────────

	/** Working directory for the provider process. */
	cwd?: string;

	/** Additional directories to allow tool access to. */
	addDirs?: string[];

	/** Path to settings JSON file or inline JSON string. Additive to existing settings. */
	settingsFile?: string;

	/** Comma-separated list of settings sources to load: user, project, local. */
	settingSources?: string;

	/** MCP config files or JSON strings to load. */
	mcpConfig?: string[];

	/** Only use --mcp-config; ignore project/user MCP configurations. */
	strictMcpConfig?: boolean;

	// ─── Structured Output ─────────────────────────────────────────────────

	/** JSON Schema for structured output validation. */
	jsonSchema?: string;

	// ─── Agent & Subagent ──────────────────────────────────────────────────

	/** Named subagent to use for the session. */
	agent?: string;

	/** Dynamic subagent definitions as JSON object. */
	agents?: Record<string, AgentDefinition>;

	// ─── Debugging ─────────────────────────────────────────────────────────

	/** Show full turn-by-turn output and debug logging. */
	verbose?: boolean;

	/** Enable debug mode with optional category filtering (e.g., "api,hooks"). */
	debug?: string;

	// ─── Runtime ───────────────────────────────────────────────────────────

	/** Timeout in milliseconds. Process gets SIGTERM after this. */
	timeoutMs?: number;

	/** Environment variables to pass to the provider process. */
	env?: Record<string, string>;
}

/**
 * Dynamic subagent definition for --agents flag.
 */
export interface AgentDefinition {
	/** Human-readable description of the agent's purpose. */
	description?: string;
	/** System prompt for the agent. */
	prompt?: string;
	/** Tools available to this agent. */
	tools?: string[];
	/** Model to use for this agent. */
	model?: string;
	/** Maximum agentic turns for this agent. */
	maxTurns?: number;
}

// ─── Dispatch Result ─────────────────────────────────────────────────────────

/**
 * Normalized result from a single dispatch.
 * This is what user code works with — cleaner than the raw envelope.
 */
export interface DispatchResult {
	/** The text output from Claude. Empty string on error subtypes. */
	result: string;

	/** Whether this dispatch succeeded (subtype === "success"). */
	ok: boolean;

	/** The raw subtype from the envelope. */
	subtype: ClaudeResultSubtype;

	/** Session ID for resume. */
	sessionId: string;

	/** Total cost in USD for this dispatch. */
	costUsd: number;

	/** Wall-clock duration in milliseconds. */
	durationMs: number;

	/** API-only duration (excludes tool execution, hooks, etc.). */
	durationApiMs: number;

	/** Number of agentic turns used. */
	numTurns: number;

	/** Token usage breakdown. */
	usage: {
		inputTokens: number;
		outputTokens: number;
		cacheCreationTokens: number;
		cacheReadTokens: number;
		/** Provider-reported reasoning or thinking tokens, when available. */
		thinkingTokens?: number;
		/** Provider-reported total tokens, when available. */
		totalTokens?: number;
	};

	/** Per-model usage breakdown. */
	modelUsage: Record<string, ClaudeModelUsage>;

	/** Tools that were denied by permission system. */
	permissionDenials: ClaudePermissionDenial[];

	/** Error messages (empty on success). */
	errors: string[];

	/** Structured output if --json-schema was used. */
	structuredOutput?: unknown;

	/** Stdout output captured during execution. */
	stdout: string;

	/** Stderr output captured during execution. */
	stderr: string;

	/** The raw envelope, preserved for debugging. */
	rawEnvelope: ProviderJsonEnvelope;
}

// ─── Spawn Types ─────────────────────────────────────────────────────────────

/**
 * Raw output from spawning a provider process.
 * Before parsing — just stdout, stderr, and exit code.
 */
export interface SpawnResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	/** True if the process was killed by timeout. */
	timedOut: boolean;
}

// ─── Batch Types ─────────────────────────────────────────────────────────────

/**
 * Options for batch processing N items through a prompt template.
 */
export interface BatchOptions<T = unknown> {
	/** Items to process. */
	items: T[];

	/** Template function: item → prompt string. */
	template: (item: T, index: number) => string;

	/** Maximum concurrent dispatches. Defaults to 2. */
	concurrency?: number;

	/** Base dispatch options applied to every item. */
	dispatchOptions?: Omit<DispatchOptions, "prompt">;

	/** Called after each item completes. */
	onProgress?: (result: BatchItemResult<T>, index: number, total: number) => void;

	/** Path to checkpoint file for resume-from-failure. */
	checkpointPath?: string;

	/** Hooks to inject for all dispatches. Managed automatically (write/cleanup). */
	hooks?: import("./infra/hooks.js").HooksConfig;
}

export interface BatchItemResult<T = unknown> {
	item: T;
	index: number;
	result: DispatchResult;
}

export interface BatchResult<T = unknown> {
	results: BatchItemResult<T>[];
	totalCostUsd: number;
	totalDurationMs: number;
	/** Number of items that succeeded. */
	succeeded: number;
	/** Number of items that failed. */
	failed: number;
}

// ─── Fanout Types ────────────────────────────────────────────────────────────

/**
 * A normalized target in a model panel.
 * Targets are resolved before execution and carry a stable ID for analysis.
 */
export interface ProviderTarget {
	/** Stable identifier used in fanout summaries and downstream storage. */
	id: string;

	/** Human-readable display name for logs and reports. */
	label: string;

	/** Dispatch options applied when this target is selected. */
	dispatchOptions: Omit<DispatchOptions, "prompt">;
}

/**
 * Input form of a provider target.
 * `id` and `label` are optional and will be derived if omitted.
 */
export interface ProviderTargetInput {
	id?: string;
	label?: string;
	dispatchOptions: Omit<DispatchOptions, "prompt">;
}

/**
 * Built-in catalog names for common multi-provider panels.
 * These are editable local defaults rather than canonical model registries.
 */
export type TargetCatalogName =
	| "claude-panel"
	| "codex-panel"
	| "antigravity-panel"
	| "frontier-all"
	| "structured-output-panel";

/**
 * A target specifier passed to fanout/expansion helpers.
 * Can be a built-in catalog name or a concrete target definition.
 */
export type TargetSpecifier = TargetCatalogName | ProviderTargetInput;

/**
 * Options for one prompt executed across many targets.
 */
export interface FanoutOptions {
	/** Prompt to send to every expanded target. */
	prompt: string;

	/** Target catalogs and/or explicit targets to run. */
	targets: TargetSpecifier | TargetSpecifier[];

	/** Base dispatch options applied to every target before target-specific overrides. */
	dispatchOptions?: Omit<DispatchOptions, "prompt">;

	/** Normalized output contract to attach to produced samples. */
	outputContract?: import("./experiment/types.js").OutputContract;

	/** Schema variant descriptor attached to produced normalized samples. */
	sampleVariant?: import("./schema/variants.js").SchemaVariantDescriptor;

	/** Metadata attached to every produced normalized sample. */
	sampleMetadata?: Record<string, unknown>;

	/** Maximum concurrent target executions. Defaults to 2. */
	concurrency?: number;

	/** Skip provider availability probing and attempt execution directly. */
	skipAvailabilityCheck?: boolean;

	/** Reject immediately on the first thrown execution error. Defaults to false. */
	stopOnError?: boolean;

	/** Called after each target completes or fails preflight. */
	onProgress?: (result: FanoutItemResult, completed: number, total: number) => void;
}

/**
 * Serialized execution error captured for one fanout target.
 * Stored as plain data so it can be logged or persisted later.
 */
export interface SerializedExecutionError {
	name: string;
	message: string;
	stack?: string;
}

/**
 * Availability status for a single provider command.
 */
export interface ProviderAvailability {
	provider: import("./providers/types.js").ProviderId;
	command: string;
	available: boolean;
	version?: string;
	error?: string;
}

/**
 * Availability annotation for a resolved target.
 */
export interface TargetAvailability {
	target: ProviderTarget;
	availability: ProviderAvailability;
}

/**
 * Result record for one target in a fanout run.
 */
export interface FanoutItemResult {
	target: ProviderTarget;
	result?: DispatchResult;
	error?: SerializedExecutionError;
}

export interface FanoutSummary {
	total: number;
	succeeded: number;
	failed: number;
	byProvider: Partial<Record<import("./providers/types.js").ProviderId, number>>;
	byTarget: Record<string, number>;
}

export interface FanoutResult {
	runId: string;
	targets: ProviderTarget[];
	results: FanoutItemResult[];
	samples: import("./experiment/types.js").ExecutionSample[];
	summary: FanoutSummary;
	totalCostUsd: number;
	totalDurationMs: number;
}

// ─── Sweep Types ─────────────────────────────────────────────────────────────

export interface SweepPrompt {
	id?: string;
	text: string;
	metadata?: Record<string, unknown>;
}

export type SweepPromptInput = string | SweepPrompt;

export interface SweepOptions {
	/** Prompt family to expand across variants and targets. */
	prompts: SweepPromptInput[];

	/** Base schema source for variant generation. */
	schema: import("./schema/source.js").SchemaSourceInput;

	/** Target catalogs and/or explicit targets to run. */
	targets: TargetSpecifier | TargetSpecifier[];

	/** Base dispatch options applied to every target in every cell. */
	dispatchOptions?: Omit<DispatchOptions, "prompt">;

	/** Variant generation settings or precompiled variants. */
	variants?:
		| import("./schema/variants.js").SchemaVariantOptions
		| import("./schema/variants.js").CompiledSchemaVariant[];

	/** Name for the compiled output contracts. */
	outputName?: string;

	/** Number of replicate runs for each prompt/variant cell. Defaults to 1. */
	replicates?: number;

	/** Maximum concurrent fanout cells. Defaults to 1. */
	cellConcurrency?: number;

	/** Maximum concurrent executions inside each fanout. Defaults to 2. */
	targetConcurrency?: number;

	/** Skip provider availability probing and attempt execution directly. */
	skipAvailabilityCheck?: boolean;

	/** Fail the whole sweep immediately when a cell throws. Defaults to false. */
	stopOnError?: boolean;

	/** Filesystem store configuration. Set to false to keep results in memory only. */
	store?: false | import("./store/filesystem.js").FilesystemStoreOptions;

	/** Called after each sweep cell completes. */
	onCellComplete?: (cell: SweepCellResult, completed: number, total: number) => void;
}

export interface SweepCellResult {
	promptId: string;
	prompt: string;
	variant: import("./schema/variants.js").SchemaVariantDescriptor;
	replicate: number;
	fanout: FanoutResult;
}

export interface SweepSummary {
	totalCells: number;
	totalSamples: number;
	valid: number;
	invalid: number;
	unparseable: number;
	byProvider: Partial<Record<import("./providers/types.js").ProviderId, number>>;
	byVariant: Record<string, number>;
}

export interface SweepResult {
	runId: string;
	outputDir?: string;
	manifest?: import("./store/run.js").RunManifest;
	variants: import("./schema/variants.js").CompiledSchemaVariant[];
	cells: SweepCellResult[];
	samples: import("./experiment/types.js").ExecutionSample[];
	summary: SweepSummary;
}

// ─── Pipeline Types ──────────────────────────────────────────────────────────

/**
 * Context accumulator for pipeline steps.
 * Each step's output is stored under `ctx.steps[stepName]`.
 */
export interface PipelineContext {
	/** Accumulated step outputs, keyed by step name. */
	steps: Record<string, DispatchResult>;
	/** Total cost across all steps so far. */
	totalCostUsd: number;
}

/**
 * A single step in a pipeline.
 */
export interface PipelineStep {
	/** Unique name for this step. Used as key in ctx.steps. */
	name: string;

	/** Generate the prompt for this step, given all prior context. */
	prompt: (ctx: PipelineContext) => string;

	/** Override dispatch options for this step. */
	dispatchOptions?: Omit<DispatchOptions, "prompt">;
}

export interface PipelineOptions {
	/** Ordered steps to execute. */
	steps: PipelineStep[];

	/** Base dispatch options applied to every step. */
	dispatchOptions?: Omit<DispatchOptions, "prompt">;

	/** Called after each step completes. */
	onStepComplete?: (step: PipelineStep, result: DispatchResult, ctx: PipelineContext) => void;

	/** Hooks to inject for all steps. Managed automatically (write/cleanup). */
	hooks?: import("./infra/hooks.js").HooksConfig;
}

export interface PipelineResult {
	/** The pipeline context with all step outputs. */
	ctx: PipelineContext;
	/** Result of the final step. */
	finalResult: DispatchResult;
	/** Total cost across all steps. */
	totalCostUsd: number;
	/** Total wall-clock time. */
	totalDurationMs: number;
}

// ─── Loop Types ──────────────────────────────────────────────────────────────

/**
 * Options for the loop (Ralph Wiggum) pattern.
 * Repeat dispatch until a completion predicate is satisfied.
 */
export interface LoopOptions {
	/** Generate the prompt for iteration N, given prior output. */
	prompt: (iteration: number, priorResult: DispatchResult | null) => string;

	/** Return true when the loop should stop. */
	isDone: (result: DispatchResult, iteration: number) => boolean;

	/** Maximum iterations before forced stop. Defaults to 10. */
	maxIterations?: number;

	/** Base dispatch options applied to every iteration. */
	dispatchOptions?: Omit<DispatchOptions, "prompt">;

	/** Called after each iteration completes. */
	onIteration?: (result: DispatchResult, iteration: number) => void;

	/** Hooks to inject for all iterations. Managed automatically (write/cleanup). */
	hooks?: import("./infra/hooks.js").HooksConfig;
}

export interface LoopResult {
	/** All iteration results in order. */
	iterations: DispatchResult[];
	/** The final result (same as iterations[iterations.length - 1]). */
	finalResult: DispatchResult;
	/** Total iterations executed. */
	numIterations: number;
	/** Total cost across all iterations. */
	totalCostUsd: number;
	/** Total wall-clock time. */
	totalDurationMs: number;
	/** Whether the loop completed via isDone or hit maxIterations. */
	completedNaturally: boolean;
}

// ─── Factory Types ───────────────────────────────────────────────────────────

/**
 * Cross-cutting configuration for an Ichabod factory instance.
 * Sets the ceiling — individual dispatches can restrict further but never widen.
 */
export interface IchabodConfig {
	/** Throttle configuration. */
	throttle?: ThrottleConfig;

	/** Maximum total budget across all dispatches from this factory. */
	maxBudget?: number;

	/** Default provider for all dispatches from this factory. */
	provider?: import("./providers/types.js").ProviderId;

	/** Default model for all dispatches. */
	model?: string;

	/** Scope ceiling: tools available. Steps can only narrow. */
	allowedTools?: string[];

	/** Scope ceiling: tools denied. Steps can only add more denials. */
	disallowedTools?: string[];

	/** Default permission mode. Steps can only make more restrictive. */
	permissionMode?: DispatchOptions["permissionMode"];

	/** Working directory for all dispatches. */
	cwd?: string;

	/** Default timeout for all dispatches. */
	timeoutMs?: number;
}

export interface ThrottleConfig {
	/** Minimum milliseconds between dispatches. Defaults to 1000. */
	minDelay?: number;

	/** Random jitter range [min, max] in ms added to delay. Defaults to [200, 800]. */
	jitter?: [number, number];

	/** Maximum concurrent dispatches. Defaults to 2. */
	maxConcurrency?: number;
}

// ─── Error Types ─────────────────────────────────────────────────────────────

/**
 * Thrown when the cumulative cost across factory dispatches exceeds maxBudget.
 */
export class BudgetExceededError extends Error {
	constructor(
		public readonly spent: number,
		public readonly budget: number,
	) {
		super(`Budget exceeded: $${spent.toFixed(4)} spent of $${budget.toFixed(2)} budget`);
		this.name = "BudgetExceededError";
	}
}

/**
 * Thrown when a dispatch times out (SIGTERM after timeoutMs).
 */
export class DispatchTimeoutError extends Error {
	constructor(
		public readonly timeoutMs: number,
		public readonly stderr: string,
	) {
		super(`Dispatch timed out after ${timeoutMs}ms`);
		this.name = "DispatchTimeoutError";
	}
}

/**
 * Thrown when Claude's output cannot be parsed as a valid JSON envelope.
 */
export class ParseError extends Error {
	constructor(
		message: string,
		public readonly stdout: string,
		public readonly stderr: string,
	) {
		super(message);
		this.name = "ParseError";
	}
}

export class UnsupportedProviderError extends Error {
	constructor(public readonly provider: string) {
		super(`Provider "${provider}" is not implemented in this build of Ichabod`);
		this.name = "UnsupportedProviderError";
	}
}

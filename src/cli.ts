/**
 * Ichabod CLI entry point.
 *
 * The CLI now exposes the real dispatch runtime so local validation can happen
 * through Ichabod itself instead of ad hoc inline Node probes.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Command, Option } from "commander";
import { dispatch } from "./core/dispatch.js";
import { fanout } from "./core/fanout.js";
import { sweep } from "./core/sweep.js";
import type { ProviderId } from "./providers/types.js";
import { getTargetCatalog, listTargetCatalogs } from "./targets/catalog.js";
import { discoverTargets } from "./targets/discovery.js";
import type { DispatchOptions, DispatchResult, FanoutResult, SweepResult } from "./types.js";
import type { ProviderTarget, TargetAvailability, TargetCatalogName } from "./types.js";

const VERSION = "0.1.0";

interface WritableStreamLike {
	write(chunk: string): unknown;
}

interface CliDeps {
	dispatchFn: typeof dispatch;
	fanoutFn: typeof fanout;
	sweepFn: typeof sweep;
	getTargetCatalogFn: typeof getTargetCatalog;
	listTargetCatalogsFn: typeof listTargetCatalogs;
	discoverTargetsFn: typeof discoverTargets;
	stdout: WritableStreamLike;
	stderr: WritableStreamLike;
	existsSync: typeof existsSync;
	readFileSync: typeof readFileSync;
	cwd: () => string;
	env: NodeJS.ProcessEnv;
}

interface DispatchCommandOptions {
	provider?: ProviderId;
	model?: string;
	maxBudget?: string;
	maxTurns?: string;
	timeoutMs?: string;
	jsonSchema?: string;
	cwd?: string;
	addDir?: string[];
	permissionMode?: DispatchOptions["permissionMode"];
	envFile?: string;
	format?: "json" | "text";
	sessionPersistence?: boolean;
}

interface FanoutCommandOptions {
	catalog?: string[];
	maxTurns?: string;
	timeoutMs?: string;
	jsonSchema?: string;
	cwd?: string;
	addDir?: string[];
	permissionMode?: DispatchOptions["permissionMode"];
	envFile?: string;
	concurrency?: string;
	checkAvailability?: boolean;
	stopOnError?: boolean;
	format?: "json" | "summary";
	sessionPersistence?: boolean;
}

interface SweepCommandOptions {
	catalog?: string[];
	schema?: string;
	variantKind?: string[];
	seed?: string;
	outputName?: string;
	replicates?: string;
	cellConcurrency?: string;
	targetConcurrency?: string;
	checkAvailability?: boolean;
	stopOnError?: boolean;
	storeRoot?: string;
	store?: boolean;
	format?: "json" | "summary";
}

interface RunCommandOptions {
	format?: "json" | "summary";
}

type RecipeHandler = (api: RecipeApi) => Promise<unknown> | unknown;

type RecipeDefinition =
	| RecipeHandler
	| {
			run: RecipeHandler;
	  }
	| {
			kind: "dispatch";
			options: DispatchOptions;
	  }
	| {
			kind: "fanout";
			options: {
				prompt: string;
				targets: TargetCatalogName | TargetCatalogName[];
				dispatchOptions?: Omit<DispatchOptions, "prompt">;
				concurrency?: number;
				skipAvailabilityCheck?: boolean;
				stopOnError?: boolean;
			};
	  }
	| {
			kind: "sweep";
			options: {
				prompts: string[];
				schema: string | Record<string, unknown>;
				targets: TargetCatalogName | TargetCatalogName[];
				outputName?: string;
				replicates?: number;
				cellConcurrency?: number;
				targetConcurrency?: number;
				skipAvailabilityCheck?: boolean;
				stopOnError?: boolean;
				store?: false | { rootDir?: string };
			};
	  };

interface RecipeApi {
	dispatch: CliDeps["dispatchFn"];
	fanout: CliDeps["fanoutFn"];
	sweep: CliDeps["sweepFn"];
	getTargetCatalog: CliDeps["getTargetCatalogFn"];
	listTargetCatalogs: CliDeps["listTargetCatalogsFn"];
}

const DEFAULT_DEPS: CliDeps = {
	dispatchFn: dispatch,
	fanoutFn: fanout,
	sweepFn: sweep,
	getTargetCatalogFn: getTargetCatalog,
	listTargetCatalogsFn: listTargetCatalogs,
	discoverTargetsFn: discoverTargets,
	stdout: process.stdout,
	stderr: process.stderr,
	existsSync,
	readFileSync,
	cwd: () => process.cwd(),
	env: process.env,
};

export function buildProgram(overrides: Partial<CliDeps> = {}): Command {
	const deps: CliDeps = {
		...DEFAULT_DEPS,
		...overrides,
	};

	const program = new Command();

	program
		.name("ichabod")
		.description("A structured-output harness for Claude, Codex, and Antigravity CLIs")
		.version(VERSION)
		.showHelpAfterError()
		.showSuggestionAfterError()
		.addHelpText(
			"after",
			[
				"",
				"Quick Start:",
				'  $ ichabod dispatch "Classify this issue." --provider claude --json-schema schema.json',
				'  $ ichabod dispatch "Return {\\"answer\\":\\"pong\\"}." --provider codex --json-schema schema.json',
				'  $ ichabod sweep "Classify this issue." --schema schema.json --replicates 3',
			].join("\n"),
		);

	program
		.command("dispatch")
		.description("Run one structured-output task through a provider CLI")
		.argument("<prompt>", "Prompt to send")
		.addOption(
			new Option("--provider <provider>", "Provider to use")
				.choices(["claude", "codex", "antigravity"])
				.default("claude"),
		)
		.option("-m, --model <model>", "Model to use")
		.option("--max-budget <usd>", "Maximum budget in USD")
		.option("--max-turns <n>", "Maximum agentic turns")
		.option("--timeout-ms <ms>", "Dispatch timeout in milliseconds")
		.option("--json-schema <value>", "Inline JSON schema or path to a JSON schema file")
		.option("--cwd <dir>", "Working directory for the provider process")
		.option(
			"--add-dir <dir>",
			"Additional directory to grant tool access to (repeatable)",
			collectStringOption,
			[],
		)
		.addOption(
			new Option("--permission-mode <mode>", "Permission mode for the provider session").choices([
				"acceptEdits",
				"auto",
				"bypassPermissions",
				"manual",
				"plan",
				"dontAsk",
			]),
		)
		.option(
			"--env-file <path>",
			"Load environment variables from a .env file before spawning the provider",
		)
		.addOption(
			new Option("--format <format>", "Result output format")
				.choices(["json", "text"])
				.default("json"),
		)
		.option("--no-session-persistence", "Do not persist provider session state")
		.addHelpText(
			"after",
			[
				"",
				"Examples:",
				'  $ ichabod dispatch "Classify this issue." --provider claude --json-schema schema.json',
				'  $ ichabod dispatch "Extract the requested fields." --provider antigravity --json-schema schema.json',
				'  $ ichabod dispatch "Return {\\"answer\\":\\"pong\\"}." --provider codex --max-turns 2 --format json',
				"",
				"Notes:",
				"  - If a .env file exists in the current shell working directory, Ichabod loads it automatically.",
				"  - Shell environment variables take precedence over .env values.",
				"  - Structured Claude runs may require more than one turn; Ichabod handles that for Claude when a JSON schema is present.",
			].join("\n"),
		)
		.action(async (prompt: string, options: DispatchCommandOptions) => {
			await runDispatchCommand(prompt, options, deps);
		});

	program
		.command("fanout")
		.description("Run one structured-output task across a target panel")
		.argument("<prompt>", "Prompt to send to every selected target")
		.option(
			"--catalog <name>",
			"Target catalog to expand (repeatable, defaults to frontier-all)",
			collectStringOption,
			[],
		)
		.option("--max-turns <n>", "Maximum agentic turns for each target")
		.option("--timeout-ms <ms>", "Dispatch timeout in milliseconds for each target")
		.option("--json-schema <value>", "Inline JSON schema or path to a JSON schema file")
		.option("--cwd <dir>", "Working directory for each provider process")
		.option(
			"--add-dir <dir>",
			"Additional directory to grant tool access to across the panel (repeatable)",
			collectStringOption,
			[],
		)
		.addOption(
			new Option("--permission-mode <mode>", "Permission mode for provider sessions").choices([
				"acceptEdits",
				"auto",
				"bypassPermissions",
				"manual",
				"plan",
				"dontAsk",
			]),
		)
		.option(
			"--env-file <path>",
			"Load environment variables from a .env file before spawning providers",
		)
		.option("--concurrency <n>", "Maximum concurrent target executions")
		.option("--check-availability", "Probe CLI availability before executing targets")
		.option("--stop-on-error", "Abort fanout on the first thrown execution error")
		.addOption(
			new Option("--format <format>", "Result output format")
				.choices(["json", "summary"])
				.default("summary"),
		)
		.option("--no-session-persistence", "Do not persist provider session state")
		.addHelpText(
			"after",
			[
				"",
				"Examples:",
				'  $ ichabod fanout "Classify this issue." --catalog structured-output-panel --json-schema schema.json',
				'  $ ichabod fanout "Extract the requested fields." --json-schema schema.json --concurrency 3',
				'  $ ichabod fanout "Summarize this file." --catalog frontier-all --timeout-ms 120000',
				"",
				"Notes:",
				"  - Fanout defaults to the built-in frontier-all catalog.",
				"  - Availability preflight is opt-in; use it when every selected provider CLI is installed locally.",
				"  - Summary mode highlights per-target success and validation status for quick panel reads.",
			].join("\n"),
		)
		.action(async (prompt: string, options: FanoutCommandOptions) => {
			await runFanoutCommand(prompt, options, deps);
		});

	program
		.command("sweep")
		.description("Run a task, schema variant, target, and replicate matrix")
		.argument("<prompt>", "Prompt to send to every sweep cell")
		.option(
			"--schema <value>",
			"Inline JSON schema or path to the base schema file for variant generation",
		)
		.option(
			"--catalog <name>",
			"Target catalog to expand (repeatable, defaults to frontier-all)",
			collectStringOption,
			[],
		)
		.option(
			"--variant-kind <kind>",
			"Schema variant family to include (repeatable)",
			collectStringOption,
			[],
		)
		.option("--seed <value>", "Deterministic seed for schema variant generation")
		.option("--output-name <name>", "Friendly output contract name for generated variants")
		.option("--replicates <n>", "Number of replicate runs per prompt/variant cell")
		.option("--cell-concurrency <n>", "Maximum concurrent sweep cells")
		.option("--target-concurrency <n>", "Maximum concurrent targets within each cell")
		.option("--check-availability", "Probe CLI availability before executing fanout cells")
		.option("--stop-on-error", "Abort the sweep on the first thrown cell error")
		.option("--store-root <dir>", "Persist run artifacts under this root directory")
		.option("--no-store", "Keep sweep results in memory only")
		.addOption(
			new Option("--format <format>", "Result output format")
				.choices(["json", "summary"])
				.default("summary"),
		)
		.addHelpText(
			"after",
			[
				"",
				"Examples:",
				'  $ ichabod sweep "Extract one structured record." --schema schema.json',
				'  $ ichabod sweep "Classify this issue." --schema schema.json --variant-kind docs-only --variant-kind naming',
				'  $ ichabod sweep "Summarize this document." --schema schema.json --catalog structured-output-panel --replicates 2 --store-root runs/benchmarks',
				"",
				"Notes:",
				"  - Sweep defaults to the built-in frontier-all catalog and persists artifacts under ./runs.",
				"  - The first CLI sweep intentionally takes one prompt; multi-prompt recipes remain the richer path.",
				"  - Variant kinds are optional; omitting them uses the library defaults.",
			].join("\n"),
		)
		.action(async (prompt: string, options: SweepCommandOptions) => {
			await runSweepCommand(prompt, options, deps);
		});

	program
		.command("targets")
		.description("List built-in target catalogs and optionally probe provider availability")
		.option(
			"--catalog <name>",
			"Limit output to a specific built-in catalog (repeatable)",
			collectStringOption,
			[],
		)
		.option("--discover", "Probe local CLI availability for the selected targets")
		.addOption(
			new Option("--format <format>", "Result output format")
				.choices(["json", "text"])
				.default("text"),
		)
		.addHelpText(
			"after",
			[
				"",
				"Examples:",
				"  $ ichabod targets",
				"  $ ichabod targets --catalog frontier-all",
				"  $ ichabod targets --catalog structured-output-panel --discover --format json",
				"",
				"Notes:",
				"  - Discovery is opt-in; it checks each selected provider executable before the sweep starts.",
				"  - Catalogs are local defaults, not a remote model registry.",
			].join("\n"),
		)
		.action(async (options: TargetsCommandOptions) => {
			await runTargetsCommand(options, deps);
		});

	program
		.command("run")
		.description("Execute a TypeScript recipe file")
		.argument("<recipe>", "Path to recipe .ts file")
		.addOption(
			new Option("--format <format>", "Result output format")
				.choices(["json", "summary"])
				.default("summary"),
		)
		.addHelpText(
			"after",
			[
				"",
				"Examples:",
				"  $ ichabod run recipes/structured-output.ts",
				"  $ ichabod run recipes/panel.ts --format json",
				"",
				"Notes:",
				"  - Recipes may default-export an async function, an object with a run() method, or a declarative dispatch/fanout/sweep spec.",
				"  - Node 22 on this machine can import .ts modules directly, so recipes can stay in TypeScript without an extra transpiler.",
			].join("\n"),
		)
		.action(async (recipe: string, options: RunCommandOptions) => {
			await runRecipeCommand(recipe, options, deps);
		});

	return program;
}

interface TargetsCommandOptions {
	catalog?: string[];
	discover?: boolean;
	format?: "json" | "text";
}

async function runDispatchCommand(
	prompt: string,
	options: DispatchCommandOptions,
	deps: CliDeps,
): Promise<void> {
	try {
		const env = buildDispatchEnvironment(options.envFile, deps);
		const jsonSchema = resolveJsonSchemaInput(options.jsonSchema, deps);

		const dispatchOptions: DispatchOptions = {
			prompt,
			provider: options.provider,
			model: options.model,
			maxBudget: parseOptionalNumber(options.maxBudget, "--max-budget"),
			maxTurns: parseOptionalInteger(options.maxTurns, "--max-turns"),
			timeoutMs: parseOptionalInteger(options.timeoutMs, "--timeout-ms"),
			jsonSchema,
			cwd: options.cwd,
			addDirs: options.addDir?.length ? options.addDir : undefined,
			permissionMode: options.permissionMode,
			noSessionPersistence: options.sessionPersistence === false,
			env,
		};

		const result = await deps.dispatchFn(stripUndefinedValues(dispatchOptions));
		writeDispatchOutput(result, options.format ?? "json", deps);
		process.exitCode = result.ok ? 0 : 1;
	} catch (error) {
		deps.stderr.write(`${formatError(error)}\n`);
		process.exitCode = 1;
	}
}

async function runTargetsCommand(
	options: TargetsCommandOptions,
	deps: Pick<
		CliDeps,
		"discoverTargetsFn" | "getTargetCatalogFn" | "listTargetCatalogsFn" | "stdout" | "stderr"
	>,
): Promise<void> {
	try {
		const catalogNames = resolveCatalogNames(options.catalog, deps.listTargetCatalogsFn);
		const catalogs = catalogNames.map((catalog) => ({
			catalog,
			targets: deps.getTargetCatalogFn(catalog),
		}));

		const availabilityById = options.discover
			? new Map(
					deps
						.discoverTargetsFn(catalogs.flatMap((entry) => entry.targets))
						.map((entry) => [entry.target.id, entry] as const),
				)
			: new Map<string, TargetAvailability>();

		if ((options.format ?? "text") === "json") {
			deps.stdout.write(
				`${JSON.stringify(
					catalogs.map((entry) => ({
						catalog: entry.catalog,
						targets: entry.targets.map((target) =>
							serializeTarget(target, availabilityById.get(target.id)),
						),
					})),
					null,
					2,
				)}\n`,
			);
			process.exitCode = 0;
			return;
		}

		deps.stdout.write(`${formatTargetsText(catalogs, availabilityById)}\n`);
		process.exitCode = 0;
	} catch (error) {
		deps.stderr.write(`${formatError(error)}\n`);
		process.exitCode = 1;
	}
}

async function runFanoutCommand(
	prompt: string,
	options: FanoutCommandOptions,
	deps: Pick<
		CliDeps,
		| "fanoutFn"
		| "cwd"
		| "env"
		| "existsSync"
		| "readFileSync"
		| "stdout"
		| "stderr"
		| "listTargetCatalogsFn"
	>,
): Promise<void> {
	try {
		const env = buildDispatchEnvironment(options.envFile, deps);
		const jsonSchema = resolveJsonSchemaInput(options.jsonSchema, deps);
		const targets: TargetCatalogName[] = options.catalog?.length
			? resolveCatalogNames(options.catalog, deps.listTargetCatalogsFn)
			: ["frontier-all"];
		const result = await deps.fanoutFn({
			prompt,
			targets,
			concurrency: parseOptionalInteger(options.concurrency, "--concurrency"),
			skipAvailabilityCheck: !options.checkAvailability,
			stopOnError: options.stopOnError ?? false,
			dispatchOptions: stripUndefinedValues({
				jsonSchema,
				cwd: options.cwd,
				addDirs: options.addDir?.length ? options.addDir : undefined,
				permissionMode: options.permissionMode,
				maxTurns: parseOptionalInteger(options.maxTurns, "--max-turns"),
				timeoutMs: parseOptionalInteger(options.timeoutMs, "--timeout-ms"),
				noSessionPersistence: options.sessionPersistence === false,
				env,
			}),
		});

		if ((options.format ?? "summary") === "json") {
			deps.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		} else {
			deps.stdout.write(`${formatFanoutSummary(result)}\n`);
		}

		process.exitCode = result.summary.failed > 0 ? 1 : 0;
	} catch (error) {
		deps.stderr.write(`${formatError(error)}\n`);
		process.exitCode = 1;
	}
}

async function runSweepCommand(
	prompt: string,
	options: SweepCommandOptions,
	deps: Pick<
		CliDeps,
		"sweepFn" | "cwd" | "existsSync" | "readFileSync" | "stdout" | "stderr" | "listTargetCatalogsFn"
	>,
): Promise<void> {
	try {
		const schema = resolveJsonSchemaInput(options.schema, deps);
		if (!schema) {
			throw new Error("--schema is required");
		}

		const targets: TargetCatalogName[] = options.catalog?.length
			? resolveCatalogNames(options.catalog, deps.listTargetCatalogsFn)
			: ["frontier-all"];
		const variantKinds = parseVariantKinds(options.variantKind);
		const result = await deps.sweepFn({
			prompts: [prompt],
			schema,
			targets,
			variants:
				variantKinds || options.seed
					? {
							seed: options.seed,
							kinds: variantKinds ?? undefined,
						}
					: undefined,
			outputName: options.outputName,
			replicates: parseOptionalInteger(options.replicates, "--replicates"),
			cellConcurrency: parseOptionalInteger(options.cellConcurrency, "--cell-concurrency"),
			targetConcurrency: parseOptionalInteger(options.targetConcurrency, "--target-concurrency"),
			skipAvailabilityCheck: !options.checkAvailability,
			stopOnError: options.stopOnError ?? false,
			store: options.store === false ? false : { rootDir: options.storeRoot },
		});

		if ((options.format ?? "summary") === "json") {
			deps.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		} else {
			deps.stdout.write(`${formatSweepSummary(result)}\n`);
		}

		process.exitCode = result.summary.invalid > 0 || result.summary.unparseable > 0 ? 1 : 0;
	} catch (error) {
		deps.stderr.write(`${formatError(error)}\n`);
		process.exitCode = 1;
	}
}

async function runRecipeCommand(
	recipePath: string,
	options: RunCommandOptions,
	deps: Pick<
		CliDeps,
		| "dispatchFn"
		| "fanoutFn"
		| "sweepFn"
		| "getTargetCatalogFn"
		| "listTargetCatalogsFn"
		| "stdout"
		| "stderr"
		| "cwd"
	>,
): Promise<void> {
	try {
		const recipe = await loadRecipeDefinition(recipePath, deps.cwd);
		const result = await executeRecipeDefinition(recipe, {
			dispatch: deps.dispatchFn,
			fanout: deps.fanoutFn,
			sweep: deps.sweepFn,
			getTargetCatalog: deps.getTargetCatalogFn,
			listTargetCatalogs: deps.listTargetCatalogsFn,
		});

		if ((options.format ?? "summary") === "json") {
			deps.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		} else {
			deps.stdout.write(`${formatRecipeResult(result)}\n`);
		}

		process.exitCode = exitCodeForRecipeResult(result);
	} catch (error) {
		deps.stderr.write(`${formatError(error)}\n`);
		process.exitCode = 1;
	}
}

function stripUndefinedValues<T extends object>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function buildDispatchEnvironment(
	envFile: string | undefined,
	deps: Pick<CliDeps, "cwd" | "env" | "existsSync" | "readFileSync">,
): Record<string, string> | undefined {
	const shellEnvironment = toStringRecord(deps.env);
	const dotEnvPath = envFile
		? resolveFromCwd(envFile, deps.cwd())
		: resolveFromCwd(".env", deps.cwd());
	const dotEnvRequired = Boolean(envFile);
	const dotEnvValues = readDotEnvFile(dotEnvPath, dotEnvRequired, deps);

	const merged = {
		...dotEnvValues,
		...shellEnvironment,
	};

	return Object.keys(merged).length > 0 ? merged : undefined;
}

function resolveJsonSchemaInput(
	input: string | undefined,
	deps: Pick<CliDeps, "cwd" | "existsSync" | "readFileSync">,
): string | undefined {
	if (!input) {
		return undefined;
	}

	const trimmed = input.trim();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		assertValidJson(trimmed, "--json-schema");
		return trimmed;
	}

	const schemaPath = resolveFromCwd(trimmed, deps.cwd());
	if (deps.existsSync(schemaPath)) {
		const contents = deps.readFileSync(schemaPath, "utf-8");
		assertValidJson(contents, "--json-schema");
		return contents;
	}

	assertValidJson(trimmed, "--json-schema");
	return trimmed;
}

function writeDispatchOutput(
	result: DispatchResult,
	format: "json" | "text",
	deps: Pick<CliDeps, "stdout" | "stderr">,
): void {
	if (format === "json") {
		deps.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		return;
	}

	if (result.structuredOutput !== undefined) {
		deps.stdout.write(`${JSON.stringify(result.structuredOutput, null, 2)}\n`);
		return;
	}

	if (result.result) {
		deps.stdout.write(`${result.result}\n`);
		return;
	}

	const message = result.errors[0] ?? result.subtype;
	deps.stderr.write(`${message}\n`);
}

function resolveFromCwd(inputPath: string, cwd: string): string {
	return resolve(cwd, inputPath);
}

function resolveCatalogNames(
	selectedCatalogs: string[] | undefined,
	listCatalogs: () => TargetCatalogName[],
): TargetCatalogName[] {
	const available = listCatalogs();
	if (!selectedCatalogs || selectedCatalogs.length === 0) {
		return available;
	}

	return selectedCatalogs.map((catalog) => {
		if (!available.includes(catalog as TargetCatalogName)) {
			throw new Error(`Unknown target catalog: ${catalog}`);
		}

		return catalog as TargetCatalogName;
	});
}

function readDotEnvFile(
	filePath: string,
	required: boolean,
	deps: Pick<CliDeps, "existsSync" | "readFileSync">,
): Record<string, string> {
	if (!deps.existsSync(filePath)) {
		if (required) {
			throw new Error(`Environment file not found: ${filePath}`);
		}
		return {};
	}

	return parseDotEnv(deps.readFileSync(filePath, "utf-8"));
}

function parseDotEnv(contents: string): Record<string, string> {
	const parsed: Record<string, string> = {};

	for (const rawLine of contents.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}

		const normalized = line.startsWith("export ") ? line.slice("export ".length) : line;
		const separatorIndex = normalized.indexOf("=");
		if (separatorIndex <= 0) {
			continue;
		}

		const key = normalized.slice(0, separatorIndex).trim();
		if (!key) {
			continue;
		}

		let value = normalized.slice(separatorIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		parsed[key] = value;
	}

	return parsed;
}

function toStringRecord(environment: NodeJS.ProcessEnv): Record<string, string> {
	const parsed: Record<string, string> = {};

	for (const [key, value] of Object.entries(environment)) {
		if (typeof value === "string") {
			parsed[key] = value;
		}
	}

	return parsed;
}

function parseOptionalInteger(value: string | undefined, flag: string): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed < 0) {
		throw new Error(`${flag} must be a non-negative integer`);
	}

	return parsed;
}

function parseOptionalNumber(value: string | undefined, flag: string): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	const parsed = Number.parseFloat(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`${flag} must be a non-negative number`);
	}

	return parsed;
}

function assertValidJson(value: string, flag: string): void {
	try {
		JSON.parse(value);
	} catch (error) {
		throw new Error(`${flag} must be valid JSON: ${formatError(error)}`);
	}
}

function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function collectStringOption(value: string, prior: string[]): string[] {
	return [...prior, value];
}

function serializeTarget(target: ProviderTarget, availability?: TargetAvailability) {
	return {
		id: target.id,
		label: target.label,
		provider: target.dispatchOptions.provider ?? "claude",
		model: target.dispatchOptions.model ?? "default",
		effort: target.dispatchOptions.effort,
		availability: availability?.availability,
	};
}

function formatTargetsText(
	catalogs: Array<{
		catalog: TargetCatalogName;
		targets: ProviderTarget[];
	}>,
	availabilityById: Map<string, TargetAvailability>,
): string {
	return catalogs
		.map(({ catalog, targets }) => {
			const lines = [`Catalog: ${catalog}`];
			for (const target of targets) {
				const provider = target.dispatchOptions.provider ?? "claude";
				const model = target.dispatchOptions.model ?? "default";
				const effort = target.dispatchOptions.effort
					? ` | effort=${target.dispatchOptions.effort}`
					: "";
				const availability = availabilityById.get(target.id)?.availability;
				const availabilityText = availability
					? availability.available
						? ` | available=yes${availability.version ? ` | version=${availability.version}` : ""}`
						: ` | available=no | error=${availability.error ?? "unknown error"}`
					: "";
				lines.push(
					`  ${target.id} | ${target.label} | provider=${provider} | model=${model}${effort}${availabilityText}`,
				);
			}
			return lines.join("\n");
		})
		.join("\n\n");
}

function formatFanoutSummary(result: FanoutResult): string {
	const sampleByTargetId = new Map(
		result.samples.map((sample) => [sample.targetId, sample] as const),
	);
	const lines = [
		`Run: ${result.runId}`,
		`Targets: ${result.summary.total} | succeeded=${result.summary.succeeded} | failed=${result.summary.failed} | costUsd=${result.totalCostUsd.toFixed(4)} | durationMs=${result.totalDurationMs}`,
	];

	for (const entry of result.results) {
		const sample = sampleByTargetId.get(entry.target.id);
		if (entry.result) {
			lines.push(
				`${entry.target.id} | ok=${entry.result.ok ? "yes" : "no"} | provider=${entry.target.dispatchOptions.provider ?? "claude"} | validation=${sample?.validation.status ?? "unparseable"} | output=${summarizeText(sample?.text ?? entry.result.result)}`,
			);
			continue;
		}

		lines.push(
			`${entry.target.id} | ok=no | provider=${entry.target.dispatchOptions.provider ?? "claude"} | error=${entry.error?.message ?? "unknown error"}`,
		);
	}

	return lines.join("\n");
}

function summarizeText(value: string): string {
	const singleLine = value.replace(/\s+/gu, " ").trim();
	if (!singleLine) {
		return "(empty)";
	}

	return singleLine.length > 120 ? `${singleLine.slice(0, 117)}...` : singleLine;
}

function parseVariantKinds(
	input: string[] | undefined,
): Array<"docs-only" | "naming" | "constraint" | "structure"> | undefined {
	if (!input || input.length === 0) {
		return undefined;
	}

	const allowed = new Set(["docs-only", "naming", "constraint", "structure"]);
	const parsed = input.map((kind) => {
		if (!allowed.has(kind)) {
			throw new Error(`Unknown --variant-kind value: ${kind}`);
		}

		return kind as "docs-only" | "naming" | "constraint" | "structure";
	});

	return parsed;
}

async function loadRecipeDefinition(
	recipePath: string,
	cwd: () => string,
): Promise<RecipeDefinition> {
	const resolved = resolveFromCwd(recipePath, cwd());
	const module = (await import(pathToFileURL(resolved).href)) as Record<string, unknown>;
	const candidate = (module.default ?? module.run ?? module) as unknown;

	if (typeof candidate === "function" || (typeof candidate === "object" && candidate !== null)) {
		return candidate as RecipeDefinition;
	}

	throw new Error(`Unsupported recipe export in ${resolved}`);
}

async function executeRecipeDefinition(recipe: RecipeDefinition, api: RecipeApi): Promise<unknown> {
	if (typeof recipe === "function") {
		return await recipe(api);
	}

	if ("run" in recipe && typeof recipe.run === "function") {
		return await recipe.run(api);
	}

	if ("kind" in recipe) {
		switch (recipe.kind) {
			case "dispatch":
				return await api.dispatch(recipe.options);
			case "fanout":
				return await api.fanout(recipe.options);
			case "sweep":
				return await api.sweep(recipe.options);
			default:
				throw new Error(`Unsupported recipe kind: ${(recipe as { kind: string }).kind}`);
		}
	}

	return recipe;
}

function formatSweepSummary(result: SweepResult): string {
	const lines = [
		`Run: ${result.runId}`,
		`Cells: ${result.summary.totalCells} | samples=${result.summary.totalSamples} | valid=${result.summary.valid} | invalid=${result.summary.invalid} | unparseable=${result.summary.unparseable}`,
		`Output: ${result.outputDir ?? "(memory only)"}`,
		"Variants:",
	];

	for (const variant of result.variants) {
		lines.push(
			`  ${variant.descriptor.variantId} | kind=${variant.descriptor.kind} | name=${variant.descriptor.name}`,
		);
	}

	return lines.join("\n");
}

function formatRecipeResult(result: unknown): string {
	if (isDispatchResult(result)) {
		if (result.structuredOutput !== undefined) {
			return JSON.stringify(result.structuredOutput, null, 2);
		}

		return result.result || result.errors[0] || result.subtype;
	}

	if (isFanoutResult(result)) {
		return formatFanoutSummary(result);
	}

	if (isSweepResult(result)) {
		return formatSweepSummary(result);
	}

	return JSON.stringify(result, null, 2);
}

function exitCodeForRecipeResult(result: unknown): number {
	if (isDispatchResult(result)) {
		return result.ok ? 0 : 1;
	}

	if (isFanoutResult(result)) {
		return result.summary.failed > 0 ? 1 : 0;
	}

	if (isSweepResult(result)) {
		return result.summary.invalid > 0 || result.summary.unparseable > 0 ? 1 : 0;
	}

	return 0;
}

function isDispatchResult(value: unknown): value is DispatchResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"ok" in value &&
		"subtype" in value &&
		"sessionId" in value
	);
}

function isFanoutResult(value: unknown): value is FanoutResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"runId" in value &&
		"results" in value &&
		"summary" in value &&
		"targets" in value
	);
}

function isSweepResult(value: unknown): value is SweepResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"runId" in value &&
		"variants" in value &&
		"cells" in value &&
		"summary" in value
	);
}

function isCliEntrypoint(metaUrl: string): boolean {
	const entry = process.argv[1];
	if (!entry) {
		return false;
	}

	return pathToFileURL(entry).href === metaUrl;
}

if (isCliEntrypoint(import.meta.url)) {
	await buildProgram().parseAsync(process.argv);
}

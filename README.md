# Ichabod

Ichabod is a structured-output harness for agent CLIs.

Run a task through Claude, Codex, or Antigravity and get back validated data
your software can use.

## Why it exists

Agent CLIs can do substantial work inside real environments, but their JSON and
structured-output modes are awkward to use programmatically. Claude, Codex, and
Antigravity expose different flags, schema transports, response envelopes,
session models, and failure behavior. A task that should need a prompt and JSON
Schema instead requires provider-specific process and parsing code.

Ichabod provides the missing harness. You supply a task and schema; Ichabod
translates the request, runs one or many locally installed agent CLIs, normalizes
their responses, validates the structured results, and preserves the evidence
needed to inspect or reproduce the run.

```text
task + JSON Schema
        ↓
Claude / Codex / Antigravity
        ↓
validated structured results + provenance
```

The agent CLIs still own authentication, model access, reasoning, and tool
execution. Ichabod owns request translation, concurrency, result normalization,
schema variation, validation, comparison, and optional run artifacts.

## What structured-output parity means

Ichabod gives every target the same output contract and evaluates the results by
the same rules. Each normalized result records:

- provider, model, target, and request identifiers;
- raw text and parsed structured output;
- `valid`, `invalid`, or `unparseable` validation status;
- schema identity and variant provenance;
- latency, token usage, raw stdout/stderr, and execution errors.

Parity does not mean the providers behave identically or support identical
execution controls. Provider adapters use the strongest native schema mechanism
available; execution controls outside the output contract remain provider-specific.

## Quick start

Requirements:

- Node.js 20 or newer
- pnpm 10
- One or more authenticated provider CLIs: `claude`, `codex`, or `agy`

Install the CLI package:

```bash
npm install --global ichabod-harness
ichabod --help
```

Or run Ichabod from a source checkout:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm ichabod --help
```

Create `classification.schema.json`:

```json
{
  "type": "object",
  "properties": {
    "label": { "type": "string", "enum": ["bug", "feature", "question"] },
    "evidence": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["label", "evidence"],
  "additionalProperties": false
}
```

Run one structured-output task:

```bash
ichabod dispatch \
  "Classify: Export fails when the destination contains a space." \
  --provider antigravity \
  --json-schema classification.schema.json
```

Run the same task and contract across the built-in provider panel:

```bash
ichabod fanout \
  "Classify: Export fails when the destination contains a space." \
  --catalog structured-output-panel \
  --json-schema classification.schema.json \
  --concurrency 3
```

Use `ichabod targets --discover` to see which local backends are available. From
a source checkout, prefix commands with `pnpm`, as in `pnpm ichabod targets`.

## Ways to run

- `dispatch` runs one task through one provider CLI.
- `fanout` runs one task and contract across a provider panel.
- `sweep` expands tasks across schema variants, targets, and replicates, then
  optionally persists the complete run.
- `batch`, `pipeline`, and `loop` are available through the TypeScript API for
  custom structured-output workflows.
- `run` executes a reusable TypeScript recipe.

A sweep is useful when the schema itself is part of the experiment:

```bash
ichabod sweep \
  "Classify: Export fails when the destination contains a space." \
  --schema classification.schema.json \
  --catalog structured-output-panel \
  --variant-kind naming \
  --variant-kind constraint \
  --replicates 3 \
  --store-root runs/classification
```

## Provider translation

| Provider | Executable | Structured-output transport |
| --- | --- | --- |
| Claude | `claude` | Native JSON Schema output with normalized Claude envelopes |
| Codex | `codex` | Temporary schema file passed through `--output-schema`, with JSONL normalization |
| Antigravity | `agy` | Native `--json-schema` in headless JSON mode |

Model names and availability come from the authenticated provider installation,
not from Ichabod. Built-in Antigravity targets therefore use the provider
default rather than pinning a model name that will age quickly.

Antigravity supports model, effort, named agent, JSON Schema, conversation
resume/continue, repeated `--add-dir`, `acceptEdits`, `plan`, and explicit
permission bypass through its adapter. Claude-specific tool, budget,
system-prompt, and persistence controls are rejected when Antigravity has no
safe equivalent.

## TypeScript API

```ts
import { createOutputContract, fanout } from "ichabod-harness";

const outputContract = createOutputContract({
  type: "object",
  properties: {
    label: { type: "string", enum: ["bug", "feature", "question"] },
    evidence: { type: "array", items: { type: "string" } },
  },
  required: ["label", "evidence"],
  additionalProperties: false,
});

const run = await fanout({
  prompt: "Classify: Export fails when the destination contains a space.",
  targets: ["structured-output-panel"],
  outputContract,
});

for (const sample of run.samples) {
  console.log(sample.provider, sample.validation.status, sample.structured);
}
```

## Agent skill

The npm package and repository include a versioned agent skill at
[`skills/ichabod/`](skills/ichabod/). Its `SKILL.md` is a compact operating
guide; focused references cover CLI workflows, output contracts, and provider
behavior. This keeps the skill easy to load while giving its references and
assets room to evolve alongside each release.

## What it is useful for

- calling agent CLIs from scripts and pipelines that require schema-valid data;
- extracting, classifying, or transforming information into application-ready records;
- passing structured results into automations or other agents;
- comparing output reliability across providers, models, prompts, or schemas;
- generating repeated samples for evaluations, analysis, or training data.

Schema validity is only one quality gate. Ichabod records whether a sample fits
the requested shape; it does not establish factual correctness, safe tool use,
dataset quality, or fitness for a downstream application. Those checks belong in
the surrounding workflow.

The local validator intentionally implements the common JSON Schema subset used
by Ichabod's contracts rather than every keyword in the specification.

## Data and safety

Ichabod does not provide credentials or model access. It invokes CLIs already
installed and authenticated on the operator's machine.

Stored runs can contain prompts, responses, parsed data, and raw provider output.
Keep `runs/` private, do not commit environment files, and review artifacts
before sharing them. Provider environment values are redacted from persisted
request metadata, but model responses may still reproduce sensitive prompt
content.

See [USAGE.md](USAGE.md) for command details and [SECURITY.md](SECURITY.md) for
reporting security issues.

## Development

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm check
pnpm audit:public
pnpm verify:package
```

Ichabod is released under the MIT License; see [LICENSE](LICENSE).

# Usage

Ichabod is a structured-output harness for locally installed agent CLIs. It runs
a task and JSON Schema through a provider, then normalizes and validates the
result. Use `dispatch` for one structured result, `fanout` for provider or model
comparisons, and `sweep` for a full task × schema variant × target × replicate
matrix.

## Dispatch one prompt

```bash
ichabod dispatch "Reply with exactly pong." \
  --provider claude \
  --model haiku \
  --format text
```

The provider can be `claude`, `codex`, or `antigravity`. Provider-specific options
are passed through the corresponding adapter where supported.

Antigravity CLI installs the `agy` executable. A structured one-shot dispatch
looks like:

```bash
ichabod dispatch 'Return {"answer":"pong"}.' \
  --provider antigravity \
  --json-schema schema.json
```

Antigravity supports `model`, `effort` (`low`, `medium`, or `high`), `agent`,
schema, conversation options, and repeated additional directories through the
TypeScript API. Ichabod maps `acceptEdits`, `plan`, and `bypassPermissions` to
native `agy` modes. Unsupported tool-control, budget, system-prompt, persistence,
and other permission options fail explicitly rather than being ignored.

## Fan out across providers

```bash
ichabod fanout "Return JSON with answer=pong." \
  --catalog frontier-all \
  --json-schema schema.json \
  --concurrency 3
```

List available catalogs with:

```bash
ichabod targets
```

## Run a schema sweep

```bash
ichabod sweep "Classify this document." \
  --schema schema.json \
  --catalog structured-output-panel \
  --variant-kind docs-only \
  --variant-kind naming \
  --replicates 2
```

Sweeps create controlled schema variants and preserve every sample's validation
outcome and provenance for later analysis. Use `--no-store` for an ephemeral run
or `--store-root` to keep artifacts in a dedicated directory.

## Environment files

`--env-file` can load provider-specific environment variables for a single
operation. Environment values are used only for the child process and are
redacted from persisted request metadata. Keep environment files outside git.

## Recipes

Recipes are TypeScript modules that can compose the library primitives:

```ts
import { fanout } from "ichabod-harness";

export default async function run() {
  return fanout({
    prompt: "Reply with exactly pong.",
    targets: ["frontier-all"],
  });
}
```

Run one with:

```bash
ichabod run recipes/pong.ts
```

## Stored artifacts

Stored runs contain a manifest, samples, validation results, and raw provider
stdout/stderr. Treat them as potentially sensitive because prompts and model
responses may contain operator-provided data.

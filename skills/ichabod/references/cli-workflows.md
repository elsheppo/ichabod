# CLI workflows

Read this reference when choosing an Ichabod command, output mode, target panel,
or persistence strategy.

## Start with the smallest shape

| Need | Command | Result |
| --- | --- | --- |
| One provider result | `dispatch` | One native execution normalized as a dispatch result |
| The same task across targets | `fanout` | Comparable normalized samples and a run summary |
| Schema, target, or replicate variation | `sweep` | A controlled sample matrix with optional artifacts |
| Reusable composition | `run` | A TypeScript recipe using the public API |

Develop the task and schema with `dispatch` before multiplying calls. Use
`fanout` when provider or model comparison matters. Use `sweep` when variation
or replication is itself part of the question.

## Discover local targets

```bash
ichabod targets
ichabod targets --discover
ichabod targets --catalog structured-output-panel --discover --format json
```

Discovery checks executable availability. A provider may still require login,
model access, project configuration, or permission setup when invoked.

## Dispatch one task

```bash
ichabod dispatch "Extract the requested fields." \
  --provider claude \
  --json-schema schema.json
```

Use `--format json` when another program consumes the full normalized envelope.
Use `--format text` only when the provider's text result is the intended output.

## Compare a panel

```bash
ichabod fanout "Extract the requested fields." \
  --catalog structured-output-panel \
  --json-schema schema.json \
  --concurrency 3 \
  --format json
```

`structured-output-panel` currently spans the built-in Claude, Codex, and
Antigravity targets. Use provider-specific panels when a cross-provider run is
unnecessary.

## Run a sweep

```bash
ichabod sweep "Classify this record." \
  --schema schema.json \
  --catalog structured-output-panel \
  --variant-kind naming \
  --replicates 3 \
  --store-root runs/classification
```

Stored runs preserve manifests, normalized samples, validation, and raw provider
output. Use `--no-store` when artifacts are unnecessary or the data should not
be written to disk.

## Compose with TypeScript

Install the library in an application:

```bash
npm install ichabod-harness
```

```ts
import { createOutputContract, fanout } from "ichabod-harness";

const outputContract = createOutputContract({
  type: "object",
  properties: { result: { type: "string" } },
  required: ["result"],
  additionalProperties: false,
});

const run = await fanout({
  prompt: "Return the requested structured result.",
  targets: ["structured-output-panel"],
  outputContract,
});
```

Use the installed package types and exports as the API contract. Inspect the
package version before applying examples from a newer repository revision.

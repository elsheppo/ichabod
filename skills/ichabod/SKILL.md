---
name: ichabod
description: Use Ichabod to run schema-constrained structured-output work through installed Claude, Codex, and Antigravity CLIs. Applies to one-off dispatches, cross-provider fanout, schema sweeps, target discovery, result validation, and reusable TypeScript recipes; not for interactive provider sessions or direct API routing.
---

# Ichabod

Ichabod is a structured-output harness for agent CLIs. It translates one task
and JSON Schema into each provider's native headless interface, then normalizes
and validates the result without hiding which runtime produced it.

## Establish the local runtime

Use the installed CLI as runtime truth before choosing models or options:

```bash
ichabod --version
ichabod targets --discover
```

Provider CLIs own authentication, available models, reasoning, tool execution,
and sessions. Ichabod owns request translation, concurrency, structured-result
normalization, validation, comparison, and optional run artifacts. Do not copy
or move provider credentials into Ichabod.

## Route the work

- `dispatch` runs one task through one provider CLI.
- `fanout` runs the same task and schema across a target panel.
- `sweep` varies schemas, targets, and replicates for a controlled matrix.
- `run` executes a reusable TypeScript recipe for composed workflows.

Start with `dispatch` when developing a task or schema. Move to `fanout` only
when comparison matters, and to `sweep` only when variation or replication is
part of the work.

- Read [CLI workflows](references/cli-workflows.md) when selecting commands,
  catalogs, output formats, persistence, or recipes.
- Read [output contracts](references/output-contracts.md) when designing a
  schema, interpreting validation, or depending on a particular JSON Schema
  keyword.
- Read [provider behavior](references/provider-behavior.md) when authentication,
  model availability, option translation, or a provider-specific failure is in
  scope.

Use `ichabod <command> --help` for the installed version's complete option
surface. The installed package and provider CLIs are runtime truth; references
in this skill explain the maintained design but do not override their help.

## Treat validation as evidence

Schema validity does not prove factual correctness, safe tool use, or fitness
for the surrounding application. Inspect validation errors and raw provider
output before retrying or promoting a result.

Structured-output parity means a shared contract and validation surface. It
does not mean providers reason identically or support identical execution
controls. Preserve provider, model, schema, timing, usage, and raw-envelope
provenance when results will be compared or reused.

## Respect execution and data boundaries

- Prefer provider-native authentication already configured on the machine.
- Do not enable permission bypass, broaden working directories, or allow tool
  side effects unless the user authorized that execution scope.
- Treat stored runs as potentially sensitive: they may contain prompts,
  responses, parsed data, stderr, and provider envelopes.
- Keep environment files outside version control. Ichabod redacts environment
  values from persisted request metadata, not sensitive content repeated by a
  model response.

Import the public API from `ichabod-harness` when dispatch, fanout, sweep,
batch, loop, or pipeline composition belongs in application code. See the
TypeScript section of [CLI workflows](references/cli-workflows.md).

Completion means the selected runtimes executed, every result's validation
state is explicit, failures retain diagnostic evidence, and any persisted
artifacts remain within the user's intended data boundary.

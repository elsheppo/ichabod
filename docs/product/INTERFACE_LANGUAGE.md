# Ichabod Interface Language

## Purpose

This document defines the public vocabulary for Ichabod. It does not rename
internal APIs, provider payloads, stored artifacts, or established CLI commands.

## User and task

> A developer needs to run work through one or more agent CLIs and receive
> schema-valid data that software can consume, without implementing each CLI's
> process, JSON-mode, and response-envelope behavior.

The journey succeeds when the developer can supply a task and JSON Schema, run
the selected provider CLIs, and receive normalized results with validation and
enough provider evidence to diagnose a failure.

## Primary journey

Task and schema → provider CLI execution → normalized result → validation →
application, automation, evaluation, analysis, or dataset

In scope:

- README, usage guide, package description, and CLI help
- names for inputs, outputs, provider panels, validation, and artifacts

Out of scope:

- renaming public TypeScript types or established commands
- adding direct API backends or changing credential ownership

## Canonical vocabulary

| Concept | Say | Avoid as the primary description | Notes and exceptions |
| --- | --- | --- | --- |
| Product category | structured-output harness for agent CLIs | orchestrator, unified CLI, sampling layer | Orchestration and sampling describe capabilities, not the product center. |
| Work supplied to a CLI | task | job, operation | `prompt` remains correct for the literal CLI argument and API field. |
| Required result shape | JSON Schema, schema, output contract | format instructions | Use output contract when validation and provenance are also in view. |
| One completed execution | result | answer | Use sample when the result belongs to a repeated or comparative experiment. |
| Several configured runtimes | provider panel, target panel | model router | Ichabod does not hide provider identity or dynamically route by quality. |
| Common provider boundary | structured-output parity | identical provider behavior | Parity means a shared contract and validation surface. |
| Diagnostic evidence | raw provider output, provenance | internal envelope | Exact envelope is appropriate in technical API documentation. |

## Canonical actions

| User intent | Action language | Consequence |
| --- | --- | --- |
| Run one task | dispatch | One provider result is returned. |
| Compare providers | fan out across a panel | Each target runs the same task and contract. |
| Explore a matrix | run a sweep | Schema variants, targets, and replicates produce comparable samples. |
| Check local support | discover targets | Installed provider executables are reported. |

## Success and recovery

| Event | User-facing expression | Recovery |
| --- | --- | --- |
| Provider result matches the schema | valid structured result | Continue into the surrounding workflow. |
| JSON parses but violates the schema | invalid structured result | Inspect validation errors, then revise the task or schema. |
| No structured value can be parsed | unparseable result | Inspect raw output and provider errors. |
| Provider execution fails | provider execution failed | Check authentication, availability, permissions, and raw stderr. |

## Technical details

Keep provider IDs, model IDs, schema hashes, session IDs, token usage, raw
stdout/stderr, and native envelopes available in JSON output and stored artifacts.
Lead public explanations with the structured result and validation state.

## Voice and domain exceptions

- Keep `JSON Schema`, structured output, provider, model, validation, and
  provenance because they are precise terms for the intended developer.
- Keep sampling language for repeated generation and experiments, but not as the
  universal description of every Ichabod run.
- Keep dataset generation as an important use case, not the product definition.

## Representative validation tasks

1. Run one extraction task with a schema and inspect the validated result.
2. Run the same task across the structured-output panel and compare validation.
3. Diagnose an invalid or unparseable provider result from preserved evidence.

## Open product decisions

- Whether credential setup should remain detection and guidance or include
  Ichabod-owned credential profiles.
- Whether direct API gateways should become explicit backends alongside agent CLIs.

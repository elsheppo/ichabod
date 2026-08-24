# Provider behavior

Read this reference when setup, authentication, model selection, option parity,
or a provider-specific failure is involved.

## Ownership boundary

Ichabod launches installed provider CLIs. Those CLIs own credentials, account
entitlements, models, sessions, reasoning, tool execution, and native permission
behavior. Ichabod should detect or explain missing setup without copying provider
tokens into its own store.

| Provider | Executable | Structured-output transport |
| --- | --- | --- |
| Claude | `claude` | Native JSON Schema output and normalized result envelope |
| Codex | `codex` | Temporary schema file through `--output-schema`; JSONL normalization |
| Antigravity | `agy` | Native `--json-schema` in headless JSON mode |

Run `ichabod targets --discover`, then use the provider's own CLI to complete
authentication or inspect available models. Do not infer authentication from
executable discovery alone.

## Provider-specific behavior

- Structured Claude dispatches use at least two turns because the native schema
  path may require an additional tool/result turn.
- Codex model availability depends on the authenticated account. Built-in Codex
  targets therefore use the provider default with medium or high effort.
- Built-in Antigravity targets also use the provider default. Its adapter maps
  native effort, agent, conversation, additional-directory, plan, edit-accepting,
  and explicit permission-bypass controls where representable.
- Material options without a safe native equivalent should fail explicitly
  rather than being silently ignored.

## Diagnose in layers

1. Confirm the executable with `ichabod targets --discover`.
2. Run a minimal native provider prompt to prove authentication and inference.
3. Run native JSON or schema mode to prove the provider contract.
4. Run the same task through `ichabod dispatch`.
5. Inspect normalized errors, stderr, and the raw envelope before changing the
   adapter.

An unavailable model, expired login, missing cloud project, or provider-native
hook failure is not automatically an Ichabod translation defect. Conversely, a
native success followed by an Ichabod failure is strong adapter evidence.

# Ichabod Public Release Climb

## Target state

Ichabod is safe and credible for its first public GitHub push: it contains no private organization or personal material, supports the current Antigravity CLI contract, enforces its documented safety ceilings, and ships as a runnable npm tarball from a clean checkout.

## Success metrics

- [x] Unit suite, typecheck, build, and formatter/linter pass on Node 20.
- [x] A clean `pnpm pack` includes compiled `dist` output without requiring a prior build.
- [x] The packed tarball installs in an empty consumer project and its CLI starts successfully.
- [x] Throttling never exceeds `maxConcurrency`, including simultaneous delayed acquires.
- [x] Factory scope ceilings apply to sweep-level and target-level dispatch options.
- [x] The public provider contract uses `antigravity` and the `agy` executable; no retired Gemini adapter remains.
- [x] Antigravity success, error, timeout, usage, session, structured-output, and argument behavior have regression coverage.
- [x] Repository working tree and complete public history pass private-name, personal-path, email, and credential-signature scans.
- [x] Public documentation accurately describes installation, supported providers, permissions, and release verification.

## Baseline — 2026-08-24

- Public release is isolated in its own one-commit repository at `public-release/`; the private parent repository is not being modified.
- Existing source suite passes (197 tests), but a clean package tarball omits `dist` and is unusable.
- Audit found a delayed-acquire race in the throttle and missing sweep-level factory narrowing.
- Claude permission-mode types are stale relative to the installed CLI.
- Provider ID, executable, output parser, targets, tests, and docs still describe the retired Gemini CLI rather than Antigravity CLI.

## Iterations

### 1. Runtime and package invariants

Status: complete.

Evidence:

- Throttle and factory regression suites pass (17 focused tests).
- Simultaneous delayed acquires now reserve the semaphore slot and dispatch time synchronously.
- Sweep accepts base dispatch options, and the factory narrows them against its defaults and safety ceiling.
- `prepack` compiles the package; the tarball contains JavaScript and declarations under `dist`.
- `verify:package` installed the tarball into an empty temporary project, launched `ichabod --version`, and imported its public API.

### 2. Antigravity provider contract

Status: complete.

Evidence:

- Public provider IDs, registry, discovery, catalogs, CLI choices, tests, and docs now use `antigravity`; discovery resolves it to `agy`.
- The adapter matches documented headless flags for JSON output, models, effort, named agents, schemas, conversations, and explicit permission bypass.
- The parser preserves Antigravity's conversation ID, status, response, structured output, timing, turn count, token breakdown, and raw envelope.
- Unsupported or ambiguous option mappings fail explicitly rather than being silently ignored.
- All 203 source tests pass, including six focused Antigravity contract tests; typecheck, build, and repository checks pass.

### 3. Public release verification

Status: complete.

Evidence:

- Node 20.19.3 passes all 203 tests, typecheck, and the production build.
- The packed consumer smoke passes under Node 20, including installed CLI and ESM API execution.
- CI covers Node 20 and 22, runs the public-source gate, and verifies the package tarball.
- The production dependency audit reports no known vulnerabilities.
- The automated source audit covers publishable tracked and untracked files, forbidden artifact paths, personal home paths, private keys, and common credential signatures; project-specific banned terms also pass.
- The public branch was rebuilt from the reviewed tree so its reachable history carries only the generic contributor identity and public Ichabod content.

Plateau decision: the remaining choices require repository-owner input rather than more code changes—namely the final GitHub owner/URL and whether npm publication should accompany the source release.

### 4. Structured-output product contract

Status: complete.

Evidence:

- The README, CLI descriptions, package metadata, and usage guide now present Ichabod as a structured-output harness rather than a generic flag-unification wrapper.
- The documented contract follows the live path: prompt and JSON Schema to provider adapter, native CLI response, normalized sample, common validation, and optional run artifacts.
- Normalized execution samples now retain provider token usage alongside latency, raw output, validation, schema identity, and provenance.
- Antigravity argument translation now covers repeated additional directories plus native `accept-edits`, `plan`, and permission-bypass modes. Seven adapter tests cover the installed CLI contract.
- All 205 source tests, typecheck, build, repository checks, public-source audit, and the clean Node 20 package-consumer smoke pass.
- Source checkouts expose `pnpm ichabod`, avoiding internal bin paths and accidental resolution of an unrelated globally installed `ichabod` executable.
- After the operator activated the required Google Cloud project configuration, native Antigravity text and structured-output calls succeeded through the existing Keychain login. The same structured contract succeeded through Ichabod with normalized output, timing, session, and token usage.
- A live six-target `structured-output-panel` run initially exposed stale pinned Codex model IDs. The built-in Codex catalog now follows the authenticated CLI's provider default at medium and high effort, matching the durable policy already used for Antigravity. The repaired panel completed 6/6 samples successfully, with every Claude, Codex, and Antigravity sample validating against the common schema.

Architecture decision: Ichabod standardizes the data contract, validation, experiment geometry, and provenance. It does not promise identical provider behavior or flatten provider-specific execution controls into a misleading lowest-common-denominator interface.

### 5. Structured-output harness language

Status: complete.

Evidence:

- The canonical category is now “a structured-output harness for agent CLIs” across the README, usage guide, package metadata, CLI help, and public API headers.
- Public language begins with the programmatic structured-output problem, then explains provider translation, validation, and provenance.
- Dataset generation remains an important use case without defining the whole product; scripts, applications, automations, provider comparisons, and evaluations share the same structured-output primitive.
- The interface-language contract distinguishes a result from an experimental sample and preserves `prompt`, `dispatch`, `fanout`, and `sweep` where those established terms remain technically accurate.

### 6. Public skill, package identity, and release automation

Status: complete locally; external publication pending.

Evidence:

- The unscoped npm name `ichabod-harness` was available when checked on 2026-08-25. The package retains the `ichabod` binary and product name.
- The package now ships `skills/ichabod/`, including a compact skill entrypoint and focused CLI/output/provider references.
- Both the official Codex skill validator and the repository-owned skill gate pass. The package smoke requires the complete skill tree in the tarball.
- CI covers the public-source audit, skill validation, tests, typecheck, build, formatting, and clean package-consumer installation on Node 20 and 22.
- The release workflow validates the GitHub tag and package version, then supports npm trusted publishing through OIDC after the one-time initial package bootstrap.

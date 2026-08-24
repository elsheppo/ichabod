# Releasing Ichabod

## Before the first public push

1. Review the complete tracked tree and commit history.
2. Run the public-source audit with any project-specific banned terms supplied
   locally through `ICHABOD_BANNED_TERMS`.
3. Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm check`.
4. Run `pnpm verify:package`; this packs Ichabod, installs it in an empty
   temporary project, launches the installed CLI, and imports the public API.
5. Run `pnpm audit --prod` and review any advisory rather than applying a
   blind force upgrade.
6. Create the GitHub repository, enable private vulnerability reporting, push
   `main`, and require the CI check before merging changes.

Example repository creation after review:

```bash
gh repo create <owner>/ichabod --public --source . --remote origin --push
```

Do not use `--push` until the local history and privacy audit are both clean.

## Package publication

The npm package is `ichabod-harness`; it installs the `ichabod` executable and
ships the public `skills/ichabod/` tree. Package publication is a separate
decision from making the source repository public.

Before the first npm release:

1. Confirm `ichabod-harness` is still available on npm.
2. Confirm `repository`, `homepage`, and `bugs` metadata match the final public
   GitHub URL exactly so npm provenance points to the right source.
3. Run the complete local gates and inspect `npm pack --dry-run`.
4. Publish `0.1.0` once from a clean `main` checkout with an npm account
   protected by 2FA: `npm publish --access public`.
5. In the npm package settings, configure GitHub Actions trusted publishing for
   the public repository and `.github/workflows/release.yml`, allowing
   `npm publish`.

After that bootstrap release, publish by creating the matching GitHub release
tag, such as `v0.1.1`. The release workflow verifies the repository, uses npm
OIDC without an `NPM_TOKEN`, and skips versions already present in the registry.

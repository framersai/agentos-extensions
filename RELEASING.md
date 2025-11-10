# AgentOS Extensions Release Workflow

This package publishes to npm via [semantic-release](https://semantic-release.gitbook.io) and GitHub Actions.

## Branch flow

- `master` is the canonical release branch.
- Each merge to `master` triggers `.github/workflows/release.yml`.
- Commits must follow the [Conventional Commits](https://conventionalcommits.org) syntax so semantic-release can derive the correct version bump.
- If there are no `feat`/`fix` (or breaking) commits since the previous release, the workflow exits without publishing.

## What the workflow does

1. Installs dependencies (`pnpm install`).
2. Runs `pnpm run build` to ensure all curated registries compile.
3. Executes `semantic-release`, which:
   - Calculates the next version.
   - Updates `CHANGELOG.md`.
   - Publishes a tag/release in GitHub (`vX.Y.Z`).
   - Publishes the package to npm.
   - Commits the updated changelog & package.json back to `master` as `chore(release): X.Y.Z [skip ci]`.

## Commit → Version mapping

| Commit message                     | Release                  |
|-----------------------------------|--------------------------|
| `fix:`                            | Patch (x.y.z → x.y.z+1)  |
| `feat:`                           | Minor (x.y.z → x.y+1.0)  |
| `feat!:`, `fix!:` or `BREAKING CHANGE:` | Major (x.y.z → x+1.0.0) |
| `docs:`, `chore:` (no breaking)   | No release               |

## Manual invocation

If you need to re-run locally:

```bash
pnpm install
pnpm run build
npx semantic-release --dry-run  # inspect
npx semantic-release            # publish
```

Run manual releases only from a clean checkout of `master` with the correct `NPM_TOKEN` configured.

## Secrets

- `GITHUB_TOKEN` is provided automatically by GitHub Actions.
- `NPM_TOKEN` must be stored as a repository secret in the submodule (`Settings → Secrets and variables → Actions`).


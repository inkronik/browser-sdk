# Releasing

`@inkronik/browser-sdk` is released from the manually dispatched `Release` GitHub Actions workflow. Release It calculates the version from
Conventional Commits, updates `package.json` and the SDK version embedded in `src/constants.ts`, creates the release commit and tag, pushes
them, creates the GitHub Release, and only then publishes the package to npm.

## Workflow inputs

- `branch`: `main` for stable releases or `rc` for prereleases.
- `dry_run`: enabled by default. It validates the release without committing, tagging, pushing, creating a GitHub Release, or publishing to npm.

The workflow reruns tests, typechecking, linting, formatting, the build, and package-content inspection before starting Release It.

Release It selects the next version from commits since the previous tag:

- `fix:` creates a patch release;
- `feat:` creates a minor release;
- a breaking change declared with `!` or `BREAKING CHANGE:` creates a major release.

## npm publication

The release workflow publishes exclusively through npm Trusted Publishing and GitHub Actions OIDC. It does not read an `NPM_TOKEN` or export
`NODE_AUTH_TOKEN`. The job runs on a GitHub-hosted runner with `id-token: write`, Node 24, npm 11.18, and the protected `npm` environment.

Remove any obsolete `NPM_TOKEN` repository or environment secret and revoke the corresponding npm automation token. If private npm dependencies
are added later, use a separate read-only token only on the dependency-install step; the publish step must remain tokenless.

## One-time trusted-publisher configuration

After the bootstrap version exists, configure its npm trusted publisher with these values:

- provider: GitHub Actions;
- organisation or user: `inkronik`;
- repository: `browser-sdk`;
- workflow filename: `release.yaml`;
- environment: `npm`;
- allowed action: `npm publish`.

The GitHub `npm` environment may require reviewers. npm Trusted Publishing requires a GitHub-hosted runner and generates provenance automatically.
The package repository URL, workflow filename, and environment must match this configuration exactly.

## Stable releases

Run the workflow from `main` and first leave `dry_run` enabled. If the automatically selected version is correct, rerun it with `dry_run`
disabled. The resulting npm package uses the `latest` dist-tag.

## Release candidates

Maintain an `rc` branch and dispatch the workflow with `branch: rc`. The first prerelease of a new line derives its increment from Conventional
Commits and produces a version such as `1.1.0-rc.0`. Subsequent runs advance the prerelease number. RC packages use the `rc` dist-tag, so they
do not replace the stable default.

After validating an RC, merge the intended release changes to `main` and run a stable release there. Do not merge the RC version commit into
`main`.

# Releasing

`@inkronik/browser-sdk` is released from the manually dispatched `Release` GitHub Actions workflow. Release It calculates the version, updates
`package.json` and the SDK version embedded in `src/constants.ts`, creates the release commit and tag, pushes them, creates the GitHub Release,
and only then publishes the package to npm.

## Workflow inputs

- `increment`: `current`, `patch`, `minor`, or `major`. Use `current` only when the version already present in `package.json` has not been
  published.
- `branch`: `main` for stable releases or `rc` for prereleases.
- `dry_run`: enabled by default. It validates the release without committing, tagging, pushing, creating a GitHub Release, or publishing to npm.

The workflow reruns tests, typechecking, linting, formatting, the build, and package-content inspection before starting Release It.

## Bootstrap the npm package

npm requires the package to exist before a trusted publisher can be configured. For the first release:

1. Keep the `NPM_TOKEN` repository or `npm` environment secret configured with an npm granular access token that can publish
   `@inkronik/browser-sdk`.
2. Run the workflow from `main` with `increment: current` and `dry_run: true`.
3. Review the output, then repeat with `dry_run: false`.

The token is exposed only to the final release step and only for a non-dry run. Once Trusted Publishing works, delete `NPM_TOKEN`; the workflow
will publish through GitHub Actions OIDC.

## One-time trusted-publisher configuration

After the bootstrap version exists, configure its npm trusted publisher with these values:

- provider: GitHub Actions;
- organisation or user: `inkronik`;
- repository: `browser-sdk`;
- workflow filename: `release.yaml`;
- environment: `npm`.

The GitHub `npm` environment may require reviewers. npm Trusted Publishing requires a GitHub-hosted runner.

## Stable releases

Run the workflow from `main`, select `patch`, `minor`, or `major`, and first leave `dry_run` enabled. If the preview is correct, rerun it with
`dry_run` disabled. The resulting npm package uses the `latest` dist-tag.

## Release candidates

Maintain an `rc` branch and dispatch the workflow with `branch: rc`. The first prerelease of a new line should use the desired increment and
produces a version such as `1.1.0-rc.0`. Subsequent runs use `increment: current` and advance the prerelease number. RC packages use the `rc`
dist-tag, so they do not replace the stable default.

After validating an RC, merge the intended release changes to `main` and run a stable release there. Do not merge the RC version commit into
`main`.

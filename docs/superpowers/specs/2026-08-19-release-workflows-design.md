# Release workflows for the Expo and Electron apps

Status: approved 2026-08-19. The durable decisions are recorded in
[ADR-0028](../../adrs/0028-desktop-release-publication.md); this document is the
design that produced it.

## Goal

Manually triggered GitHub workflows and matching `openbot` commands that release the Expo
app through EAS and the Electron app to an S3 update feed, without letting a fork publish
to Tilde's bucket.

## What already existed

- `openbot mobile release build|submit|status|credentials|install` with the ADR-0027 upstream
  guard, and `.github/workflows/mobile-release.yml` driving it from a `mobile-v*` tag or a
  manual dispatch. The mobile side turned out to need neither a command nor a workflow.
- `openbot desktop package`, a local unsigned build with no publish path.
- `.github/workflows/changesets.yml` and `mobile-release.yml`.
- `tilde-app-updates-prod` in the shared AWS account, already hosting Tilde's Electrobun feed
  under `desktop/`, with public read on `desktop/*`.

Two premises from the request did not hold. `trytilde/agent` has no Electron release and no
notarization — it builds Rust binaries and attaches them to GitHub Releases. No GitHub OIDC
provider exists in AWS; the current desktop publisher is a long-lived IAM user access key in
`identity-terraform`.

## Design

**Commands.** `openbot desktop release build|publish|manifest|status`, mirroring the shape of
`openbot mobile release`. `build` packages, signs, and notarizes. `publish` uploads this
platform's artifacts plus a `release-<platform>-<arch>.json` entry. `manifest` rebuilds
`version.json` from the entries already in the bucket. `status` prints the resolved target.

**Bucket layout.** `s3://tilde-app-updates-prod/desktop/openbot/<channel>/` holding
`version.json`, `latest-*.yml`, the per-platform release entries, and the artifacts.

**Client contract.** `version.json`, keyed by `darwin-arm64` / `linux-x64`, each entry carrying
its own version, `signed`, `notarized`, and artifacts with size, base64 sha512, and absolute
URL. A client reads its own platform key and semver-compares.

**Fork boundary.** The official bucket is a constant in the CLI; the command refuses it from a
non-upstream `origin` and names `OPENBOT_DESKTOP_UPDATES_BUCKET`. A GitHub OIDC role scoped to
`repo:trytilde/openbot:*` is the backstop. `release-desktop.yml` does not filter on repository
name, so a fork with its own bucket runs it unchanged. This differs from `mobile-release.yml`,
which fences on `github.repository`.

**Signing.** Developer ID certificate plus notarytool with an App Store Connect key, under the
hardened runtime with Electron's JIT entitlements. Missing credentials degrade to unsigned with
a warning and `signed: false` in the manifest.

**Matrix.** macOS arm64 and Linux x64. mac x64 is not built.

**Version source.** `apps/desktop/package.json`, which changesets owns through the fixed group.
`publish` refuses a version already in the bucket unless `--overwrite`.

## Testing

`cli/src/commands/desktop/release.test.ts` covers target resolution and fork overrides, the
guard in both directions, artifact classification, per-platform entry construction, manifest
merge including the mac-only-re-run case, and all three signing degradation paths. S3 sits
behind an injectable `ObjectStore` so nothing touches the network.

What tests cannot prove: that a notarized dmg passes Gatekeeper. That needs one real `dry_run`
dispatch on a runner with the certificate secrets present.

## Out of scope

The in-app update banner and its `client-runtime` contract, the web/Expo parity decision that
banner triggers, Windows, linux arm64, mac x64, `eas update` OTA, and pruning current versions
from the bucket.

## Infrastructure change

`trytilde/infrastructure-terraform` needs a GitHub OIDC provider in the shared account and a
role trusting `repo:trytilde/openbot:*`, scoped to the `desktop/openbot/*` prefix. Raised as a
separate pull request; it deploys through Terraform Cloud on merge.

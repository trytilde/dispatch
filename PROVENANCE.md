
## Inspected Tilde references

Public contracts and architectural boundaries were inspected at these pinned
revisions on 2026-08-12:

- `trytilde/frontend` at `01ff2a9`
- `trytilde/api` at `755bd34`
- `trytilde/docs` at `46decc1`
- `trytilde/harness-sdk` at `2f5070d`
- `trytilde/examples` at `9d73adf`

These repositories remain references, not vendored source. Their public API
contracts must be reverified before changing pinned Tilde dependencies.

The repo-native `.agents/skills/tilde/SKILL.md` is copied verbatim from
`trytilde/docs` `skill.md` at `8af9de2c`. The `.agents/skills/vercel` guidance
was synthesized from OpenBot's own deployment code and Vercel's public Agent
Resources and product documentation as inspected on 2026-08-12. No upstream
Vercel skill package was copied verbatim.

## Runtime artifact pins

- Google Chrome stable `151.0.7922.137-1` for Linux amd64, package SHA-256
  `e6dabf044cf9cd0279cfe86efa431682c18bfc06d06339ce055aaa87ae871727`.
  Linux arm64 guests use Debian's Chromium because Google does not distribute
  Chrome for that architecture.
- Vercel Turso Marketplace product `tursocloud/database`, starter plan, and
  Deploy Button integration ID `oac_axiehHAX1Zn7QiwRSzDD2j7J`, verified from
  Vercel's live Marketplace on 2026-08-12.

## Direct Beautiful UI source

Beautiful UI component provenance, per-file hashes, upstream license, and
OpenBot modifications are recorded in
`packages/ui/src/beautiful-ui/PROVENANCE.md` and `THIRD_PARTY_NOTICES.md`.

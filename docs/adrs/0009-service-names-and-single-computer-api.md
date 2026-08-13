# ADR-0009: Service names and one computer API

## In brief

- Name application packages after the service they own.
- `apps/control-service` owns the owner-facing Hono and Connect service.
- `apps/computer-service` is the only API running inside an OpenBot Computer.
- Remove the legacy `box-host` package and `BoxService` protocol.
- Generate Vercel-specific control adapters in `control-service-provider`, not the portable application.

## Context

The repository carried both a legacy `apps/box-host` RPC from `packages/contracts`
and the newer `apps/computer-service` backed by `computer-service-proto`. They
overlapped on process, file, screenshot, input, and port operations. The newer
service also owns lifecycle bundles and the VNC tunnel, so renaming both would
leave two competing computer APIs.

The owner-facing application was also named `apps/server`, which described its
transport rather than its domain, and contained a Vercel-only fetch wrapper.

## Decision

Rename `apps/server` and `@openbot/server` to `apps/control-service` and
`@openbot/control-service`. Keep its Hono app and local Node entrypoint portable.
The Vercel control provider generates and bundles the Web fetch adapter as part
of its prebuilt artifact lifecycle.

Keep `apps/computer-service` and `computer-service-proto` as the single computer
RPC boundary. Delete `apps/box-host`, `BoxService`, and `BoxHealth*` rather than
renaming them into a collision. Existing shared legacy messages remain until
their remaining consumers migrate.

```mermaid
flowchart LR
  U["Web and desktop"] --> C["control-service"]
  C --> P["computer providers"]
  P --> S["computer-service"]
  V["Vercel control provider"] -->|"generates adapter"| C
```

## Consequences

- Package names identify domain ownership instead of generic hosting roles.
- There is one capability-protected computer API and one generated computer contract.
- Control-service source contains no platform-specific Vercel entrypoint.
- Removing the private legacy RPC is intentionally breaking for untracked consumers.

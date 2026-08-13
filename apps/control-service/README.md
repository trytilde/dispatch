# @openbot/control-service

The portable Hono control application. It serves health, federates generated ConnectRPC handlers under `/rpc`, and serves the built web UI with SPA fallback both locally and in a Vercel Function.

## Public API

- `app` is the configured Web-standard Hono application exported for local and provider-generated entrypoints.
- `registerControlServices(router)` registers owner-facing ConnectRPC methods. It is intentionally empty while `control-service-proto` is redesigned from the UX.

The package default application also exposes `GET /healthz`. There is no `/api` prefix and no pairing-code setup route.

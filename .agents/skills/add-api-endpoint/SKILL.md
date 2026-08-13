---
name: add-api-endpoint
description: Add or modify an OpenBot Hono HTTP route or ConnectRPC method while preserving authentication, provider boundaries, Web-standard request handling, generated contracts, and focused tests.
metadata:
  author: openbot
  version: "1.0.0"
  argument-hint: <surface> <change-summary>
---

# Add Or Modify An API Endpoint

OpenBot uses ConnectRPC for authenticated control operations and Hono for protocol-native HTTP routes. Keep handlers thin and portable across the local Node server and Vercel Functions.

## Process

1. Choose the surface:
   - ConnectRPC: control-plane methods used by OpenBot clients.
   - Hono: setup unlock, health, ChatKit compatibility, or signed Tilde webhooks/tools.
2. For ConnectRPC, edit the owning proto, run `pnpm contracts:generate`, then implement the method in `apps/control-service` or `apps/computer-service`.
3. For Hono, edit `apps/control-service/src/app.ts` and keep Web-standard request handling.
4. Validate input at the edge. Use protobuf types for Connect and Zod or narrow parsing for untyped HTTP payloads.
5. Apply the existing authorization mechanism before business work.
6. Delegate external behavior to the owning `*-provider-core` interface and matching provider adapter. Keep route code provider-neutral.
7. Preserve `Request.signal` through `ProviderCallContext`.
8. Add focused tests beside the server surface. Test status/code, response shape, authorization, and the owning provider call.

## Authentication And Scope

- Control Connect services live under `apps/control-service`; computer RPCs stay in `apps/computer-service`.
- `/api/chat` requires a valid setup session.
- `/api/tilde/chatkit` and `/api/tilde/tools/sandbox` require Tilde webhook verification and raw request bodies.
- `/healthz` is public and must remain side-effect free.
- Treat Tilde org/team IDs as deployment configuration. Do not accept tenant overrides on signed runtime callbacks.

## Collections

Add pagination only when the backing provider supports a stable cursor contract. Put page size and continuation tokens in protobuf messages or explicit HTTP schemas; do not leak a provider-specific response shape to clients.

## Checklist

- [ ] Correct Hono or ConnectRPC surface chosen.
- [ ] Handler remains thin and Web-standard.
- [ ] Authentication or signature verification preserved.
- [ ] Provider work stays behind its domain `*-provider-core` contract.
- [ ] Proto regenerated when changed; generated files not hand-edited.
- [ ] Local and Vercel routing still agree with `vercel.json`.
- [ ] Focused server/provider tests pass.
- [ ] `pnpm check` and `pnpm build` pass.
- [ ] Browser flow tested when user-visible behavior changed.

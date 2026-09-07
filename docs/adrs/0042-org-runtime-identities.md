# ADR-0042: Org identity clients and session-authorized runtime proxy

Status: Accepted

## In brief

- Separate application login from organization-owned runtime identity.
- Keep org credentials on the server and resource authorization in Tilde.

## Context

Applications need independent login providers while preserving Tilde tenant, identity, resource, and billing boundaries across concurrent requests.

## Decision

The core SDK exposes an unbound org application client for explicit provisioning/link-start capabilities and immutable per-request identity/team clients for runtime calls. A server-only Fetch proxy authenticates through a trusted resolver, fixes the upstream origin, replaces delegation headers, constrains supported runtime routes and team selection, and preserves streams/cancellation. It never exposes application credentials or upgrades a delegated call into provisioning authority.

## Consequences

Runtime identity ownership and history survive managed account linking. Runtime
usage is charged to the organization without automatic account-seat enrollment.
Deployment requires matching API/SDK/application versions and configured credentials.
Real provider-dependent verification and the approved fresh cutover remain required;
local test doubles do not prove live authentication.

## Updates

- 2026-09-07T14:45:00Z: The security review requires transport-wide redirect rejection, frozen context/header snapshots, CSP sandbox/nosniff for navigated proxy content, explicit rejection of unsupported gRPC delegation, and unbound capability checks for team membership and identifier management. These controls prevent credential leakage and authority changes during concurrent requests.

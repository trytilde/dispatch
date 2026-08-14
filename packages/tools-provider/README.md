# @tryopenbot/tools-provider

Startup provisioning boundary for external MCP servers. `TildeToolProvider`
idempotently reconciles one dynamic server and Tilde control-plane toolkit per
authored agent. When Vercel is the selected service platform, it also reconciles
the Vercel proxied MCP connection using `VERCEL_TOKEN`. Stable IDs are persisted
in the authored agent's environment.

Every resource is looked up before mutation. Missing resources are created,
mutable fields are updated only when they drift, and resources whose Tilde API
does not support updates are replaced only after a configuration comparison.

It does not list or invoke tools and authored agents do not import it. Agents
integrate their chosen MCP or tool SDK directly.

## Public API

`ToolProvider` exposes only the shared deployment lifecycle. Concrete adapters
may retain reconciliation helpers such as `ensureServer()` for their own
lifecycle implementation, but those helpers are not part of the provider
contract.

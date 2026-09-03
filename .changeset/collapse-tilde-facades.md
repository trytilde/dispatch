---
"@trytilde/dispatch-agent-provider": minor
"@trytilde/dispatch-agent-service-provider": minor
"@trytilde/dispatch-auth-provider": minor
"@trytilde/cli": minor
"@trytilde/dispatch-computer-service-provider": minor
"@trytilde/dispatch-client-runtime": minor
"@trytilde/dispatch-computer-tools": minor
"@trytilde/dispatch-computer-service": minor
"@trytilde/dispatch-computer-service-proto": minor
"@trytilde/dispatch-configuration": minor
"@trytilde/dispatch-desktop": minor
"@trytilde/dispatch-utilities": minor
"@trytilde/dispatch-platform-integrations": minor
"@trytilde/dispatch-control-service-provider": minor
"@trytilde/dispatch-runtime-provider": minor
"@trytilde/dispatch-control-service": minor
"@trytilde/dispatch-ui": minor
"@trytilde/dispatch-web": minor
"@trytilde/dispatch-git-provider": minor
---

Use native Tilde plugin, connector, routine, and signal resources through one authenticated allowlisted bridge, and remove the corresponding control-service route APIs.

Plugin inventory now pages Tilde's native MCP, skill, provider, and registry collections directly; it no longer depends on Tilde's Dispatch-specific aggregate catalogue or its first-page limit.

Routines now consume Tilde's native trigger/version contract, and signal history uses native trigger IDs while accepting legacy rule IDs during the migration window. Signal provider and instance inventories follow every continuation token.

Development agent creation retains the completed source-generation result until asynchronous Tilde bundle provisioning becomes active, so queued provisioning no longer turns the next status poll into “job not found”.

Fresh installations and future agents now explicitly select ChatKit `agentLoop` response mode, matching the required SDK endpoint contract.

The ChatKit credential bridge now permits only the workspace, queue, observation, and attachment operations used by Client Runtime instead of forwarding the complete ChatKit namespace.

Migration:
- Replace direct calls to `/api/plugins`, `/api/connectors`, `/api/routines`, and `/api/signals` with `@trytilde/dispatch-client-runtime`.
- Replace `registerConnectorRoutes` with `registerConnectorAuthorizedRoute` when constructing a custom control service.

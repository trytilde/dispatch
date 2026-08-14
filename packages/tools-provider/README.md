# @tryopenbot/tools-provider

Startup provisioning boundary for external MCP servers. `TildeToolProvider`
creates a missing server or updates its name and dynamic-discovery setting, then
returns the ID needed by the authored agent's environment.

It does not list or invoke tools and authored agents do not import it. Agents
integrate their chosen MCP or tool SDK directly.

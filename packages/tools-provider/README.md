# @openbot/tools-provider

Internal Vercel AI SDK tool boundary with the Tilde implementation. Providers return concrete AI SDK tools and may contribute a prompt part; they are not automatically exposed over RPC.

## Public API

### Functions

- `asRegisteredTool(name, aiTool)` attaches a stable OpenBot name to one AI SDK tool.
- `registeredToolsToToolSet(tools)` converts registered tools into an AI SDK `ToolSet` keyed by their registered names.
- `providerSignal(context, fallbackMs?)` derives the cancellation signal for a provider call.

### Classes

- `ToolsProviderError` is the normalized provider failure with a `ToolsProviderErrorCode` and retryability flag.
- `TildeToolProvider` implements `ToolProvider` through the typed Harness SDK and is configured with `TildeToolProviderConfig`.

### Critical interfaces

- `ToolProvider` defines tool discovery, `registerTools()`, optional `injectPromptPart()`, and optional deployment behavior.
- `ToolsProviderCallContext` carries request identity, cancellation, deadlines, and idempotency.
- `ToolSummary`, `RegisteredTool`, and `ToolsPromptContext` describe provider-neutral discovery and model integration.
- `JsonValue` and `JsonObject` describe JSON-safe metadata.

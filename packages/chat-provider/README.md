# @tryopenbot/chat-provider

Chat-facing application boundary used to back desktop and web API endpoints.
It owns agent, session, and message reads and conversation mutations. It does
not register or deploy agent endpoint resources, and authored agents do not
import it.

`TildeChatProvider` implements the contract with typed Tilde Mission Control
and ChatKit APIs.

## Public API

- `ChatProvider`: agent, session, and message operations consumed by the control service.
- `ChatProviderCallContext`, request types, `Page`, and chat entity interfaces: typed call and result contracts.
- `ChatProviderError` and `ChatProviderErrorCode`: normalized provider failure surface.
- `pageSize()`: validates and caps paginated request sizes.
- `providerSignal()`: derives a bounded abort signal from a provider call context.
- `TildeChatProvider` and `TildeChatProviderConfig`: typed Tilde implementation and configuration.

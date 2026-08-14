# @tryopenbot/chat-provider

Chat-facing application boundary used to back desktop and web API endpoints.
It owns agent, session, and message reads and conversation mutations. It does
not register or deploy agent endpoint resources, and authored agents do not
import it.

`TildeChatProvider` implements the contract with typed Tilde Mission Control
and ChatKit APIs.

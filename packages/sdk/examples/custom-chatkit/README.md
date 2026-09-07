# Customer-hosted ChatKit providers

These Linq and AgentMail adapters use only the public
`@trytilde/sdk/chatkit-provider` contract. The agent endpoint and the
provider endpoint are separate services: Tilde executes the agent and owns the
conversation; this backend translates platform operations.

## Run an adapter

Use Node.js 24 and install this workspace with `pnpm install`.

1. Register a definition in **ChatKit → Configure providers**, using your public
   `https://your-host/provider` discovery URL. Registration returns a definition
   ID and a signing key once; discovery can remain pending while you deploy.
2. Set `CHATKIT_PROVIDER` to `linq` or `agentmail`, `TILDE_PROVIDER_ID`,
   `TILDE_PROVIDER_SIGNING_KEY`, `PROVIDER_PUBLIC_URL`, and `TILDE_API_URL`.
3. Set `PROVIDER_STORE_PATH` to a durable local file and `PROVIDER_STORE_KEY` to
   a base64-encoded 32-byte key. Generate a key with
   `node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))'`.
   Keep it in your host's secret manager. Losing it makes stored credentials and
   receipts unreadable.
4. Run `pnpm exec tsx --conditions=development packages/sdk/examples/custom-chatkit/server.ts`. The example listens on
   `127.0.0.1:8787`; use your HTTPS reverse proxy or a public Dev Tunnel. Set `PORT`
   to change the local port.
5. Refresh discovery, then create a connection with a default agent. Configure
   the account credentials in the generic setup flow. Each connection receives
   a separate runtime credential; it cannot access other connections or act as
   a Tilde user.

Linq setup creates a webhook subscription and filters selected phone lines.
If a create response is lost, retry removes only subscriptions matching this
connection's exact webhook URL and recreates the subscription to obtain a fresh
one-time signing secret.
AgentMail setup asks you to create an inbox webhook and supply its signing
secret; remove that manually created webhook when disconnecting. Each platform
posts directly to `/webhooks/<connection-id>`. The adapter verifies the raw body
before calling the scoped ingestion client.

The example store uses encrypted SQLite for customer-backend state, event drafts,
and action receipts. Tilde's canonical storage remains Postgres. Run one process
per database file, keep its directory and encryption key private, back up both,
and implement retention for old event drafts in a production host.

## Session tools and delivery

The Linq adapter declares reactions, thread reads, and poll creation/options/votes.
AgentMail declares thread reads and prepares rich email sends with To/CC/BCC,
subject, HTML, and reply-all. Tilde owns `sendMessage`; providers cannot shadow it.
Agents discover the current turn's tools with `client.chatkit.sessionTools()` or
`context.session.tools` from the Vercel AI integration.

Handlers receive trusted connection/session coordinates separately from model
arguments. Use `context.session.executionId` for mutation IDs and
`input.deliveryId` for sends. Reconciliation must return `applied`, `absent`, or
`uncertain`; never return `absent` merely because a local receipt is missing.
The reference adapters use deterministic mutation IDs. AgentMail persists the
original send request, looks up delivery labels across pages, and stops uncertain
resends before its 24-hour platform key window expires.
Reaction reconciliation reads the platform's current message state.

Private delivery options are encrypted with Tilde's durable delivery intent.
Do not copy BCC or raw platform objects into tool results or inbound metadata.
The email adapter strips BCC from thread reads and inbound metadata. Attachment
content uses the scoped upload API; allowlisted platform downloads are bounded
and redirects are checked.

`streaming-chat.ts` demonstrates a custom client protocol using the caller's
own authenticated SDK client. It submits canonical turns and relays resumable,
audience-filtered session events. Supply a real caller authentication function;
do not substitute the provider runtime token or a shared administrator key.

## Validate without platform accounts

```sh
pnpm exec tsc -p packages/sdk/examples/custom-chatkit/tsconfig.json --noEmit
pnpm exec vitest run packages/sdk/test/chatkit-provider.test.ts packages/sdk/test/chatkit-provider-parity.test.ts packages/sdk/test/chatkit-session-stream.test.ts
```

Tests use mock platform APIs and cover signed operations, replay recovery,
rich email privacy, attachment workflows, and stream reconnection. Live platform
validation is a separate opt-in deployment check.

To start a new email from an existing authorized session turn, pass
`provider_options: { new_thread: true }` to canonical `sendMessage` and supply
`to` recipients. Omitting it replies to the exact triggering email. This option
is interpreted by the email adapter and persisted in the private delivery intent.

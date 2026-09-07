# ChatKit voice example

Two registered agents demonstrate the same Tilde-owned audio interface:

- **Pipeline:** Rust streams speech to OpenAI transcription, invokes the normal
  `chatKitEndpoint` callback once per response turn, then streams the callback's
  text through OpenAI TTS.
- **Realtime:** Rust maintains an OpenAI Realtime conversation. The model
  generates speech directly; its transcript does not invoke the text callback.

Both create ordinary ChatKit sessions. The pipeline callback receives typed
`context.audio` and, for phone calls, `context.telnyx`. Audio models and voice
settings are registered on the Tilde agent, not on the callback.

## Run locally

Requires the matching `codex/chatkit-realtime-voice` API and SDK changes, Node 24+
and pnpm. Use a Tilde API reachable from the browser and a callback URL reachable
from that API. The example binds to loopback and is intended for local testing.

From the Dispatch repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @trytilde/api-client build
pnpm --filter @trytilde/sdk build
pnpm --filter @trytilde/sdk-vercel-ai-node build
cd examples/realtime-voice
pnpm install --ignore-workspace
cp .env.example .env.local
```

Set `TILDE_BASE_URL`, `TILDE_ORG_ID`, `TILDE_TEAM_ID`, and a **human-owned**
`TILDE_API_KEY` in `.env.local`. Browser media admission rechecks that human's
current session membership. Set `AGENT_ENDPOINT_ORIGIN` to a URL the Rust API can
reach. When both run on this machine, `http://127.0.0.1:31247` works; a hosted API
requires an authenticated development tunnel or deployed endpoint.

Set `OPENAI_API_KEY` on the **Rust API** for transcription, synthesis and native
Realtime. Alternatively bind a managed `chatkit_openai_audio` credential to each
agent. Set `OPENAI_API_KEY` in this example for its ordinary text model too.

```sh
pnpm setup
pnpm dev
```

Setup registers two new agents and saves their endpoint credentials in ignored
`.agents.local.json` with mode 0600. It does not print those secrets. Re-running
setup creates new demo agents; delete old demo agents through Tilde when done.

Open `http://localhost:31247`, select a mode, click **Start conversation**, and
allow microphone access. Local HTTPS certificates must be trusted by both the
browser and Node (`NODE_EXTRA_CA_CERTS` can name your local root certificate).

Test:

1. Ask “What is two plus two?” Hear a short spoken answer.
2. Interrupt while the agent speaks. Queued audio should stop.
3. End the conversation. Microphone tracks and upstream audio connection close.
4. Open the displayed ChatKit session ID in Tilde. Final transcripts are stored.
5. In pipeline mode, server output shows one normal callback per user turn and
   `context.audio.mode = pipeline`. Native mode makes no speech-triggered HTTP
   callback. Transcripts describe generated speech; exact word-level playback
   alignment is not guaranteed after interruption.

The sample uses a mono 24 kHz PCM WebSocket to the Rust API. Native Realtime also
uses the Rust media runtime here; this example does not negotiate direct
browser-to-OpenAI WebRTC. Audio recordings are not retained by this first slice. Native Realtime uses its
configured instructions; it does not inherit tools or prompts from the text
callback. Agent state exports carry speech settings and credential setup references;
configure Telnyx number/application routes again in the destination installation.

## Attach a Telnyx test number

Use a dedicated test Voice API application. Do not repoint a production number.

1. In Tilde managed credentials, create a **Telnyx Voice** credential
   (`chatkit_telnyx_voice`) containing your Telnyx `api_key`. Copy its ID.
2. In Telnyx, create a Voice API application and select a test number. Copy the
   application/connection ID and account Ed25519 public key.
3. Add these optional settings to `.env.local` before `pnpm setup`:

```dotenv
TELNYX_CREDENTIAL_ID=your-tilde-managed-credential-id
TELNYX_PUBLIC_KEY=your-base64-ed25519-public-key
TELNYX_PHONE_NUMBER=+12025550100
TELNYX_CONNECTION_ID=your-telnyx-voice-application-id
TELNYX_AGENT_MODE=pipeline
VOICE_MEDIA_BASE_URL=https://your-public-tilde-api-origin
```

4. Setup prints the exact webhook URL. Put it in the test application's **Webhook
   URL**, select POST, and associate the number with that application.
5. Call your test number manually. Tilde verifies the webhook, checks the number
   and application, answers, and attaches a one-time authenticated media stream.
6. To test native speech, bind the route to the realtime demo agent with
   `client.chatkit.audio.configureTelnyx()` and update the application's webhook
   to the returned URL. Do not run both routes for the same application at once.

The API's public HTTPS origin must also accept WSS upgrades. Hookdeck can capture
and replay lifecycle webhooks but cannot replace the live media WebSocket.
No ngrok process is started by this example. Telnyx input/output uses PCMU at
8 kHz; Rust converts generated 24 kHz PCM for carrier playback.

For WhatsApp calls, first enable WhatsApp Business Calling in Telnyx and use the
actual calling application's connection ID. It reaches the same media adapter.
This example does not initiate outbound calls or buy/assign phone numbers.

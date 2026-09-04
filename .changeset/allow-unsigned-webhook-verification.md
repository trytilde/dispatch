---
"@trytilde/sdk-vercel-ai-node": minor
"openbot": minor
---

Allow `webhookSigningKey: null` on `chatKitEndpoint`, `toolEndpoint`, and `verifyWebhookRequest` to skip webhook signature verification explicitly (warning once per process), add `webhookSigningKeyFromEnv`, and let generated agents opt in with `AGENT_<ID>_WEBHOOK_SIGNING_KEY=null`; an undefined key still rejects every request.

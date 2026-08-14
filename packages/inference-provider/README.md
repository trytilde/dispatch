# `@tryopenbot/inference-provider`

Initialization and external provisioning for inference services. The default Vercel implementation
creates a labeled AI Gateway key and persists it as `AI_GATEWAY_API_KEY`. Authored agents use AI
SDK's recommended plain `creator/model` string; this package does not expose model factories or
request-time inference APIs.

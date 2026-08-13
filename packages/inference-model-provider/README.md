# @openbot/inference-model-provider

Internal inference-model boundary and OpenAI adapters. Model selection stays explicit, while credential acquisition and persistence remain outside this package.

## Public API

### Functions

- `openAIChatGPTAccountId(accessToken)` reads the ChatGPT account identifier from a JWT-shaped OAuth access token when present.

### Classes

- `OpenAIApiKeyInferenceModelProvider` returns Vercel AI SDK OpenAI models using a Platform API key and `OpenAIApiKeyInferenceModelProviderOptions`.
- `OpenAIOAuthInferenceModelProvider` returns ChatGPT/Codex OAuth-backed models using resolved `OpenAIOAuthCredential` values and `OpenAIOAuthInferenceModelProviderOptions`.

### Critical interfaces

- `InferenceModelProvider` defines `model(name)`, optional `injectPromptPart()`, and optional deployment behavior.
- `InferenceModelPromptContext` supplies agent and session context for prompt contributions.

The package deliberately exposes constructors rather than a provider-type factory.

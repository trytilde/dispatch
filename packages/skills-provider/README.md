# @tryopenbot/skills-provider

Internal skill and skill-registry boundary with the Tilde Harness SDK implementation. Managed skill assets remain behind an explicit destination instead of becoming general computer credentials or RPC methods.

## Public API

### Functions

- `pageSize(value, fallback, maximum?)` normalizes provider pagination.
- `providerSignal(context, fallbackMs?)` derives the cancellation signal for a provider call.
- `safeSkillAssetPath(path)` validates and normalizes a relative skill asset path.

### Classes

- `SkillsProviderError` is the normalized provider failure with a `SkillsProviderErrorCode` and retryability flag.
- `TildeSkillProvider` implements `SkillProvider` through the typed Harness SDK and is configured with `TildeSkillProviderConfig`.

### Critical interfaces

- `SkillProvider` owns skill and registry operations plus optional `registerTools()`, `injectPromptPart()`, and deployment behavior.
- `SkillsProviderCallContext` carries request identity, cancellation, deadlines, and idempotency.
- `Skill`, `SkillSummary`, `SkillRegistry`, and `Page<T>` are provider-neutral records.
- `CreateSkillRequest`, `UpdateSkillRequest`, `ListSkillsRequest`, `ListSkillRegistriesRequest`, and `RegisterSkillsRequest` define operations.
- `SkillAssetManifest`, `SkillAsset`, and `SkillAssetDestination` define checksum-verified asset installation without exposing provider credentials.

The repository pins the generated API client to the same official Harness SDK commit as these package endpoints. A pnpm package extension supplies that Git subpackage's monorepo-owned Vite build dependencies so clean installs produce its typed distribution; provider code does not replace it with untyped Tilde requests.

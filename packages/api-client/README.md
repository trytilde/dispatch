# @trytilde/api-client

Generated TypeScript client and URL helpers for the Tilde API.

Most applications should install
[`@trytilde/sdk`](https://www.npmjs.com/package/@trytilde/sdk)
instead of using this package directly.

## Public API

- `createTildeApiClient(options)` creates the generated fetch client with Tilde authentication and
  organization headers.
- `unwrapTildeResponse(result)` maps generated success/error results.
- `teamPath`, `mcpServerUrl`, `reverseProxyPath`, and `reverseProxyUrl` construct canonical API
  paths and URLs.
- `@trytilde/api-client/generated` exposes generated operations and types for SDK implementation
  work; applications should prefer stable `@trytilde/sdk` wrappers.

The generated contract includes ChatKit voice profiles, agent audio configuration,
browser media admission, and Telnyx Voice route setup. Use `client.chatkit.audio`
from the SDK for the stable public interface; relay mode uses Telnyx speech
services and normal signed agent callbacks.

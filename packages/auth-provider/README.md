# Auth provider

Owner authentication for OpenBot control surfaces. Tilde is the default OIDC authority; each
installation has its own audience and public PKCE client registration.

## Public API

- `AuthProvider` defines authorization URL creation, PKCE code exchange, refresh, and access-token verification for an installation.
- `OwnerPrincipal` is the verified owner identity and its groups and scopes.
- `OAuthTokens` carries the access token, optional refresh token, and expiry returned by an authorization server.
- `AuthProviderError` classifies invalid configuration, invalid tokens, and failed exchanges at the provider boundary.
- `TildeAuthProvider` reconciles the installation's Tilde OIDC registration and implements the `AuthProvider` contract. Development reconciliation includes the local Vite callback origins without replacing the deployed callback.

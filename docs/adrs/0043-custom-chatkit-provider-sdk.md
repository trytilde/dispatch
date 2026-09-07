# ADR-0043: Framework-neutral ChatKit provider authoring

Status: Accepted

## In brief

- Export authoring and runtime helpers from a dedicated ChatKit provider subpath.
- Separate administrative, connection-runtime, and end-user credentials.
- Keep platform behavior in TypeScript and canonical accounting in Tilde.

## Context

A custom provider must express setup, ingestion, rich sends, identities, contextual
session tools, and recovery without requiring a specific agent framework or a
separately provisioned toolkit for each action.

This extends [SDK ownership](0030-tilde-sdk-and-cli-ownership.md) and preserves
[org/runtime identity separation](0042-org-runtime-identities.md). Platform
extensions follow [ADR-0038](0038-metadata-is-extension-data.md).

## Decision

Use standard Fetch Request/Response handlers for signed discovery and versioned
operations. Validate declared schemas/capabilities and keep server-bound execution
context outside model arguments. Provide connection-scoped ingestion, attachment,
conversation, and participant methods. Expose administrative wrappers separately.

Use stable execution/delivery IDs and explicit applied/absent/uncertain
reconciliation. Private rendering and recipient options flow through canonical
send preparation; reference email adapters redact BCC from public outputs.
Streaming protocol adapters submit canonical turns and relay cursor-based events
using the requesting user's authenticated client. Vercel AI adaptation is optional.

## Consequences

The core provider entry point has no Vercel AI requirement. Linq and AgentMail
serve as executable reference adapters, while hosts own deployment, secret
storage, webhook verification, and platform recovery. Backend support must ship
before an SDK release exposes these methods to customers. The example Node host
uses durable encrypted SQLite locally; Tilde's canonical database remains Postgres.

# @openbot/computer-provider

The internal computer boundary, shared image/build behavior, and Microsandbox and Vercel Sandbox implementations. This package owns computer lifecycle and capability-backed operations; it is not an owner-facing control API.

## Public API

### Provider classes

- `BaseComputerProvider` supplies AI SDK computer-tool registration, prompt injection, OCI image build/deploy lifecycles, per-agent workspace registration, and trusted development-sandbox setup.
- `MicrosandboxComputerProvider` implements `ComputerProvider` with Microsandbox.
- `VercelSandboxComputerProvider` implements `ComputerProvider` with Vercel Sandbox.
- `ComputerProviderError` normalizes provider failures and retryability.

### Functions

- `asRegisteredComputerTool(typeId, manifest, aiTool)` combines a Vercel AI SDK tool with its Tilde custom-tool manifest.
- `ensurePublishedComputerImage(provider, spec, previous, context)` reuses a matching content digest or builds and publishes a new image.
- `computerServiceApiKey(value?)` validates and returns the SOPS-backed static computer-service key.
- `scopedCapability("vnc", computerId, secret?)` derives a per-computer VNC capability without exposing that key.
- `randomCapability()` creates a random capability value.
- `deterministicComputerId(prefix, requested?)` validates a requested computer ID or generates one.
- `imageSourceDigest(parts)` calculates a stable SHA-256 source digest.
- `materializeComputerImageContext(repositoryRoot, providerId)` renders the shared Handlebars image assets and returns the content-addressed build context.
- `computerWorkspacePath(path, agentId?)` resolves relative paths beneath `/workspace/<agent-id>` when scoped while preserving absolute computer paths.
- `logicalComputerPath(path, root?)` resolves relative computer paths beneath the selected root and preserves absolute paths.
- `scopeComputerExecRequest(request, agentId?)` defaults scoped commands and environment values to `/workspace/<agent-id>`.
- `agentWorkspaceRoot(agentId)` returns `/workspace/<agent-id>`.
- `createBashTool(options)`, `createAwaitShellTool(options)`, `createReadFileTool(options)`, `createWriteFileTool(options)`, `createCopyToComputerTool(options)`, `createCopyFromComputerTool(options)`, `createGlobTool(options)`, `createGrepTool(options)`, and `createScreenshotTool(options)` create reusable Zod-schema Vercel AI SDK tools from the `@openbot/computer-provider/tools` subpath.

### Critical interfaces

- `ComputerProvider` defines lifecycle, command, file, desktop, prompt/tool, image, agent-workspace, and trusted-sandbox behavior.
- `ComputerCallContext` carries request identity, agent scope, cancellation, deadlines, and idempotency.
- `ComputerSpec`, `ComputerHandle`, `ComputerExecRequest`, `ComputerExecResult`, `ComputerInput`, and `ComputerVncEndpoint` define the runtime boundary.
- `ComputerAgentWorkspace` and `DeployAgentWorkspacesRequest` define seed-once per-agent workspaces.
- `ComputerImageSpec`, `BuiltComputerImage`, `PublishedComputerImage`, and `ComputerImageDeploymentConfig` define content-addressed image publication.
- `RegisteredComputerTool` and `RegisterComputerToolsContext` define model-facing tools.
- `ComputerToolOptions` binds shared tools to a fixed agent ID and optionally overrides their typed computer-service URL and API-key resolution.

## Deployment behavior

Build creates a multi-stage image that compiles `@openbot/computer-service` inside the container. Deploy publishes the content-tagged OCI image and contributes its immutable reference to later participants. Existing computers are not updated: their image and persistent disk belong to their creation lifecycle.

Agents share one filesystem and process identity. Their commands default to `/workspace/<agent-id>`, but absolute paths and sibling agent directories remain accessible; these directories are not a security boundary. A separate trusted development sandbox is the only computer that receives aggregate deployment credentials and `SOPS_AGE_KEY`; its environment file is mode `0600` and ordinary agent directories never receive it.

When populated, files under `configuration/agents/<id>/sandbox/workspace/` seed `/workspace/<id>` only once. Empty seed trees do not create a directory. Later edits do not affect an existing deployed computer.

`deployAgentWorkspaces()` returns the typed computer-service URL for later service deployment. The static `OPENBOT_COMPUTER_SERVICE_API_KEY` originates in SOPS and is installed independently into control, agent, and computer runtimes rather than being emitted as a provider output. Agent-authored computer tools send their fixed agent ID through that service; computer-service uses it for the default directory and background-job ownership, not OS isolation.

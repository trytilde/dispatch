# @openbot/computer-provider

The internal computer boundary, shared image/build behavior, and Microsandbox and Vercel Sandbox implementations. This package owns computer lifecycle and capability-backed operations; it is not an owner-facing control API.

## Public API

### Provider classes

- `BaseComputerProvider` supplies AI SDK registration for `bash`, `read_file`, `write_file`, `glob`, and `grep`, prompt injection, OCI image build/deploy lifecycles, per-agent workspace registration, and trusted development-sandbox setup.
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
- `computerWorkspacePath(path, agentId?)` validates `/workspace` paths and maps agent file operations to their private persistent directory.
- `logicalComputerWorkspacePath(path)` validates and returns the agent-visible `/workspace` path.
- `scopeComputerExecRequest(request, agentId?)` wraps agent commands with the private mount-namespace launcher.
- `agentWorkspaceRoot(agentId)` returns the physical persistent workspace for an agent ID.
- `agentLinuxUsername(agentId)` derives its stable Linux username.

### Critical interfaces

- `ComputerProvider` defines lifecycle, command, file, desktop, prompt/tool, image, agent-workspace, and trusted-sandbox behavior.
- `ComputerCallContext` carries request identity, agent scope, cancellation, deadlines, and idempotency.
- `ComputerSpec`, `ComputerHandle`, `ComputerExecRequest`, `ComputerExecResult`, `ComputerInput`, and `ComputerVncEndpoint` define the runtime boundary.
- `ComputerAgentWorkspace` and `DeployAgentWorkspacesRequest` define seed-once per-agent workspaces.
- `ComputerImageSpec`, `BuiltComputerImage`, `PublishedComputerImage`, and `ComputerImageDeploymentConfig` define content-addressed image publication.
- `RegisteredComputerTool` and `RegisterComputerToolsContext` define model-facing tools.

## Deployment behavior

Build creates a multi-stage image that compiles `@openbot/computer-service` inside the container. Deploy publishes the content-tagged OCI image and contributes its immutable reference to later participants. Existing computers are not updated: their image and persistent disk belong to their creation lifecycle.

An agent sees its own directory mounted at `/workspace` and runs as its own Linux user. A separate trusted development sandbox is the only computer that receives aggregate deployment credentials and `SOPS_AGE_KEY`; its environment file is mode `0600` and ordinary agent workspaces never receive it.

Files under `configuration/agents/<id>/sandbox/workspace/` seed only a newly registered workspace. Later edits do not affect an existing deployed computer.

`deployAgentWorkspaces()` returns the typed computer-service URL for later service deployment. The static `OPENBOT_COMPUTER_SERVICE_API_KEY` originates in SOPS and is installed independently into control, agent, and computer runtimes rather than being emitted as a provider output. Agent-authored computer tools send their fixed agent ID through that service; computer-service, rather than the tool or provider SDK, maps it to the registered Linux user and private workspace.

# @tryopenbot/computer-service

The API-key-protected ConnectRPC server that runs inside an OpenBot Computer image. It executes lifecycle bundles, agent-scoped commands and file operations, Cua Driver GUI automation, port discovery, and VNC tunneling.

## Public API

This package is a service executable and declares no importable package exports. Its network contract is `@tryopenbot/computer-service-proto`, mounted under `/rpc`; the listening port is `COMPUTER_SERVICE_PORT` or `4101`.

Model-facing requests include an agent ID. The service validates it and defaults relative command and file operations to `/workspace/<agent-id>`. Agents otherwise share the computer's process identity and filesystem, so this directory is not a security boundary. Agent tools call this service through the generated typed client. The web and desktop applications do not call it directly.

Every RPC requires `Authorization: Bearer <COMPUTER_SERVICE_API_KEY>`. Init creates this static key only inside `configuration/secrets.enc.yaml`; deployment installs the same secret into the computer, agent service, and control service without returning it in provider outputs.

Model-controlled processes start with an allowlisted environment, so the service key and other computer-service environment variables are not inherited. `HOME` is the agent directory, allowing its seeded `.profile` to initialize Bash login shells.

Background shell commands detach from the service process and keep private job metadata, bounded output, and an exit-status file under `/workspace/.openbot/jobs`. `AwaitExec` validates the originating agent ID and can recover a running or completed job after computer-service restarts; jobs still belong to the lifetime of the Computer itself.

`ListCuaTools` and `CallCuaTool` expose the exact runtime Cua catalog and result envelope. One lazy private worker receives each agent's display, isolated home/XDG state (including Cua's browser data), and accessibility environment. Legacy screenshot and input RPCs are compatibility translations through Cua. noVNC remains a separate owner preview and takeover transport.

`EnsureBrowserSession` turns the agent display's Chrome into a self-hosted Tilde browser runtime (ADR-0040). It ensures the desktop, derives the loopback DevTools port `9200 + display number` that `openbot-browser` also uses, registers one `runtime: self_hosted` Tilde browser session per agent through `TildeBrowserSessionRegistry` (persisting `{ id, runtimeToken }` with mode `0600` beside the desktop state), starts `openbot-browser` on the display when the port is closed, and bootstraps the vendored trusted-runtime extension over CDP on every call so a restarted Chrome reconnects. The response carries the session ID, the owner preview URL built from `COMPUTER_PREVIEW_ORIGIN`, the port, and whether the runtime authenticated. Registration needs `TILDE_API_KEY`, `TILDE_ORG_ID`, `TILDE_TEAM_ID`, and optionally `TILDE_BASE_URL` in the service environment; only the trusted host Computer receives them, so sandboxed Computers answer `FailedPrecondition`. `COMPUTER_BROWSER_LAUNCHER` overrides the launcher path.

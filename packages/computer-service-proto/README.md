# @openbot/computer-service-proto

Generated ConnectRPC and protobuf types for the capability-protected service inside an OpenBot Computer. This is an internal provider transport, not an API for the web or desktop UI.

## Public API

The root and `gen/*` subpath re-export generated `openbot.computer.v1` symbols:

- `ComputerService` describes health, lifecycle-bundle, agent-scoped command, file, screenshot, input, port, and VNC tunnel RPCs.
- Request and response schemas cover each RPC, with `LifecyclePhase`, lifecycle file/script/result schemas, and `Port` as shared generated types.

`ExecRequest`, `ReadFileRequest`, `WriteFileRequest`, `ScreenshotRequest`, and `InputRequest` carry the agent ID that computer-service maps to its Linux user. The package contains no hand-written public functions. Edit `proto/openbot/computer/v1/computer.proto` and run `pnpm contracts:generate`; never hand-edit `src/gen/`.

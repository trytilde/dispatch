# Repository configuration

`configuration/index.ts` is the single fork-owned configuration entrypoint. `openbot init` creates it with explicit provider instances for the selected runtime. Replace or add concrete provider instances under `providers`; provider packages do not select implementations from string IDs. `Configuration()` types provider selection only. The file must not contain credentials; providers read secret values from the initialized environment.

```ts
import { Configuration } from "@openbot/configuration";
import { TildeAgentProvider } from "@openbot/agent-provider";
import { VercelAgentServiceProvider } from "@openbot/agent-service-provider";
import { VercelControlServiceProvider } from "@openbot/control-service-provider";
import { VercelSandboxComputerProvider } from "@openbot/computer-providers";
import { TildeToolProvider } from "@openbot/tools-provider";
import { createClient } from "@trytilde/harness-sdk";

const tilde = {
  apiKey: process.env.TILDE_API_KEY!,
  orgId: process.env.TILDE_ORG_ID!,
  teamId: process.env.TILDE_TEAM_ID!,
};
const client = createClient({ baseUrl: "https://api.trytilde.ai", ...tilde });

export default Configuration({
  providers: {
    controlService: new VercelControlServiceProvider(),
    agentService: new VercelAgentServiceProvider(),
    computer: new VercelSandboxComputerProvider(),
    agent: new TildeAgentProvider(tilde),
    tools: new TildeToolProvider({
      client,
      serverId: process.env.TILDE_MCP_SERVER_ID!,
    }),
  },
});
```

Repository resources always use their canonical file locations:

- agents: `configuration/agents/<id>/`, served below `/api/agents/<id>`
- global agent instrumentation: `configuration/instrumentation.ts`
- skills: `configuration/skills/`
- custom provider source: `configuration/providers/`
- sandbox assets: `configuration/sandbox/assets/`
- sandbox bootstrap: `configuration/sandbox/bootstrap.sh`

These locations are conventions, not configuration options. File discovery makes the same fork work from source and from a Vercel function bundle. Symlinks, escaping paths, duplicate IDs, oversized files, and malformed skill metadata fail generation or startup.

Custom provider implementations live under `configuration/providers/` and must be explicitly imported and instantiated in `configuration/index.ts`.

The generated computer provider reads `OPENBOT_COMPUTER_IMAGE_REPOSITORY` as an
untagged OCI repository. `openbot init` asks for it; alternatively pass
`{ repository: "ghcr.io/example/openbot-computer" }` to the concrete computer
provider constructor.

Run `vp run openbot check` after every configuration change. `vp run openbot doctor` also checks the selected providers without exposing secret values.

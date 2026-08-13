# Repository configuration

The upstream repository initially tracks only `configuration/.gitignore`, with every configuration entry ignored. Run the standalone `openbot init` command from a completely empty destination directory; it creates and clones the owner repository before configuration begins. After initialization succeeds, init removes that exact sentinel so the fork can commit its generated configuration. Commit the sentinel deletion with the generated files. Git preserves that committed deletion during ordinary merges while upstream leaves the sentinel unchanged; if upstream ever changes it, resolve the delete/modify conflict in favor of the fork's configuration. Init creates `configuration/index.ts` as the single fork-owned composition root and `configuration/runtime-providers.ts` for the provider instances imported by agent functions. `index.ts` still names every provider role explicitly; the split prevents deployment-only compilers and platform SDKs from entering agent bundles. Provider packages do not select implementations from string IDs. `Configuration()` and `RuntimeProviders()` type provider selection only. These files must not contain credentials; providers read secret values from the initialized environment.

OpenBot never loads root `.env`, `.env.local`, or a root SOPS document. Fork-owned values live only in `configuration/.env` and `configuration/secrets.enc.yaml`. Contributors and CI use their process environment for repository-maintenance credentials.

```ts
import { Configuration } from "@tryopenbot/configuration";
import { TildeAgentProvider } from "@tryopenbot/agent-provider";
import { VercelAgentServiceProvider } from "@tryopenbot/agent-service-provider";
import { VercelControlServiceProvider } from "@tryopenbot/control-service-provider";
import { VercelSandboxComputerProvider } from "@tryopenbot/computer-provider";
import { TildeToolProvider } from "@tryopenbot/tools-provider";
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
- agent skills: `configuration/agents/<id>/skills/`
- custom provider source: `configuration/providers/`
- agent workspace seed: `configuration/agents/<id>/sandbox/workspace/`

These locations are conventions, not configuration options. Global `configuration/skills/` and `configuration/sandbox/` directories are not supported. File discovery makes the same fork work from source and from a Vercel function bundle. Symlinks, escaping paths, duplicate IDs, oversized files, and malformed skill metadata fail generation or startup.

Custom provider implementations live under `configuration/providers/` and must be explicitly imported and instantiated in `configuration/index.ts`.

The Vercel Sandbox computer provider does not ask for a registry. Deployment
creates the control and agent Vercel projects first, then authenticates Docker
with the deployment token and creates `openbot-computer` in the agent project's
built-in Vercel Container Registry on first push. The local Microsandbox
provider tags its local image from the Git remote, such as
`trytilde/openbot-computer:<content-tag>`.

Run `pnpm openbot check` after every configuration change. Provider build checks also run automatically before `pnpm openbot deploy` creates or deploys an artifact.

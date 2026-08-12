import { defineConfig } from "@openbot/config";

export default defineConfig({
  providers: {
    ai: "openai",
    agents: "tilde-agents",
    chat: "tilde-chatkit",
    skills: "tilde-skills",
    sandbox: "auto",
    environment: "auto",
    sourceControl: "github",
    deployment: "vercel",
  },
  skills: {
    directory: "configuration/skills",
    registryName: "OpenBot",
    registryDescription: "Skills committed with this OpenBot fork.",
  },
  agents: {
    directory: "agents",
    routePrefix: "/api/agents",
  },
  sandbox: {
    assetsDirectory: "sandbox/assets",
    bootstrap: "sandbox/bootstrap.sh",
    secretsManifest: "sandbox/secrets.example.yaml",
  },
  publishing: {
    mode: "pull-request",
    deploymentBranch: "main",
  },
});

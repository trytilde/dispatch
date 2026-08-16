import { describe, expect, it } from "vite-plus/test";
import type { AgentServiceProvider } from "@tryopenbot/agent-service-provider";
import type { ControlServiceProvider } from "@tryopenbot/control-service-provider";
import {
  Configuration,
  repositoryDigest,
  type OpenBotProviders,
  type UserConfiguration,
} from "./index.js";

const agentServiceProvider = {} as AgentServiceProvider;
const controlServiceProvider = {} as ControlServiceProvider;
const domainProvider = {};
const configuration = Configuration({
  providers: {
    auth: domainProvider as OpenBotProviders["auth"],
    controlService: controlServiceProvider,
    agentService: agentServiceProvider,
    chat: domainProvider as OpenBotProviders["chat"],
    agent: domainProvider as OpenBotProviders["agent"],
    computer: domainProvider as OpenBotProviders["computer"],
    skills: domainProvider as OpenBotProviders["skills"],
    tools: domainProvider as OpenBotProviders["tools"],
  },
});

describe("repository configuration", () => {
  it("groups explicitly constructed providers", () =>
    expect(configuration.providers).toMatchObject({
      controlService: controlServiceProvider,
      agentService: agentServiceProvider,
    }));
  it("hashes files deterministically", () =>
    expect(repositoryDigest({ b: "2", a: "1" })).toBe(repositoryDigest({ a: "1", b: "2" })));
  it("keeps chat and lifecycle providers distinct", () => {
    expect(configuration.providers.chat).toBe(domainProvider);
    expect(configuration.providers.agent).toBe(domainProvider);
  });
  it("types user-local SOPS lookup configuration separately", () => {
    const userConfiguration: UserConfiguration = {
      version: 1,
      sops: {
        ownerIdentity: {
          kind: "onepassword",
          reference: "op://Engineering/OpenBot/password",
        },
      },
    };
    expect(userConfiguration.sops?.ownerIdentity?.kind).toBe("onepassword");
  });
});

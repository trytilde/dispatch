import { describe, expect, it } from "vite-plus/test";
import type { AgentServiceProvider } from "@trytilde/dispatch-agent-service-provider";
import type { ControlServiceProvider } from "@trytilde/dispatch-control-service-provider";
import {
  Configuration,
  repositoryDigest,
  type DispatchProviders,
  type UserConfiguration,
} from "./index.js";

const agentServiceProvider = {} as AgentServiceProvider;
const controlServiceProvider = {} as ControlServiceProvider;
const domainProvider = {};
const configuration = Configuration({
  providers: {
    auth: domainProvider as DispatchProviders["auth"],
    controlService: controlServiceProvider,
    agentService: agentServiceProvider,
    agent: domainProvider as DispatchProviders["agent"],
    computer: domainProvider as DispatchProviders["computer"],
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
  it("keeps the agent lifecycle provider explicit", () => {
    expect(configuration.providers.agent).toBe(domainProvider);
  });
  it("types user-local SOPS lookup configuration separately", () => {
    const userConfiguration: UserConfiguration = {
      version: 1,
      sops: {
        ownerIdentity: {
          kind: "onepassword",
          reference: "op://Engineering/Dispatch/password",
        },
      },
    };
    expect(userConfiguration.sops?.ownerIdentity?.kind).toBe("onepassword");
  });
});

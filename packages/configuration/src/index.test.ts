import { describe, expect, it } from "vite-plus/test";
import {
  Configuration,
  repositoryDigest,
  RuntimeProviders,
  type OpenBotProviders,
  type ServiceProvider,
} from "./index.js";

const serviceProvider = {} as ServiceProvider;
const domainProvider = {};
const configuration = Configuration({
  providers: {
    controlService: serviceProvider,
    agentService: serviceProvider,
    agent: domainProvider as OpenBotProviders["agent"],
    computer: domainProvider as OpenBotProviders["computer"],
    inferenceModel: domainProvider as OpenBotProviders["inferenceModel"],
    skills: domainProvider as OpenBotProviders["skills"],
    tools: domainProvider as OpenBotProviders["tools"],
  },
});

describe("repository configuration", () => {
  it("groups explicitly constructed providers", () =>
    expect(configuration.providers).toMatchObject({
      controlService: serviceProvider,
      agentService: serviceProvider,
    }));
  it("hashes files deterministically", () =>
    expect(repositoryDigest({ b: "2", a: "1" })).toBe(repositoryDigest({ a: "1", b: "2" })));
  it("types the provider subset imported by agent entrypoints", () =>
    expect(
      RuntimeProviders({
        agent: configuration.providers.agent,
        computer: configuration.providers.computer,
        inferenceModel: configuration.providers.inferenceModel,
        skills: configuration.providers.skills,
        tools: configuration.providers.tools,
      }),
    ).toMatchObject({ agent: domainProvider, tools: domainProvider }));
});

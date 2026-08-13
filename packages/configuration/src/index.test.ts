import { describe, expect, it } from "vitest";
import { Configuration, repositoryDigest, type ServiceProvider } from "./index.js";

const serviceProvider = {} as ServiceProvider;
const configuration = Configuration({
  providers: {
    controlService: serviceProvider,
    agentService: serviceProvider,
  },
});

describe("repository configuration", () => {
  it("groups explicitly constructed providers", () => expect(configuration.providers).toEqual({ controlService: serviceProvider, agentService: serviceProvider }));
  it("hashes files deterministically", () => expect(repositoryDigest({ b: "2", a: "1" })).toBe(repositoryDigest({ a: "1", b: "2" })));
});

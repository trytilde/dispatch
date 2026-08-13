import { describe, expect, it, vi } from "vite-plus/test";
import type { ComputerProvider, PublishedComputerImage } from "./index.js";
import { ensurePublishedComputerImage } from "./index.js";

describe("ensurePublishedComputerImage", () => {
  it("does not rebuild or publish an unchanged image", async () => {
    const previous: PublishedComputerImage = {
      sourceDigest: "sha256:same",
      localReference: "openbot:test",
      reference: "registry/openbot@sha256:same",
      publishedAt: new Date(0),
    };
    const provider = {
      buildImage: vi.fn(),
      publishImage: vi.fn(),
    } as unknown as ComputerProvider;

    const result = await ensurePublishedComputerImage(
      provider,
      {
        sourceDigest: "sha256:same",
        contextDirectory: ".",
        dockerfilePath: "Containerfile",
        repository: "registry/openbot",
      },
      previous,
      { requestId: "test" },
    );

    expect(result).toEqual({ image: previous, changed: false });
    expect(provider.buildImage).not.toHaveBeenCalled();
    expect(provider.publishImage).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vite-plus/test";
import { createProviderSetupWorkflow, type ProviderSetupNextAction } from "./provider-setup.js";
const input = {
  providerId: "example",
  returnUrl: "https://heyash.test/app/connected",
  formValues: { token: "test-only-secret" },
};
describe("provider setup continuation", () => {
  it.each<ProviderSetupNextAction>([
    { type: "redirect", url: "https://example.test/oauth" },
    { type: "submit_form", fields: [], submit_label: "Continue" },
    { type: "render_instructions", markdown: "Finish setup" },
    { type: "configure_credential", setup_item_id: "item" },
    { type: "download_secret_outputs" },
    { type: "complete", message: "Connected" },
  ])("preserves $type without retaining outputs or submitted credentials", async (next_action) => {
    const workflow = createProviderSetupWorkflow({
      start: async () => ({
        setup_id: "setup",
        next_action,
        outputs: { token: "output-secret" },
        resource: { token: "resource-secret" },
      }),
      resume: vi.fn(),
    });
    const result = await workflow.start(input);
    expect(result).toEqual({ setup_id: "setup", next_action });
    const state = JSON.stringify(workflow.store.getState());
    for (const secret of ["test-only-secret", "output-secret", "resource-secret"])
      expect(state).not.toContain(secret);
  });
  it("resumes the same setup after a failed form and allows retry", async () => {
    const resume = vi
      .fn()
      .mockRejectedValueOnce(new Error("try again"))
      .mockResolvedValue({ next_action: { type: "complete" } });
    const workflow = createProviderSetupWorkflow({
      start: async () => ({
        setup_id: "setup",
        next_action: { type: "submit_form", fields: [], submit_label: "Continue" },
      }),
      resume,
    });
    await workflow.start(input);
    await workflow.resume({ code: "secret-code" }, input.returnUrl);
    expect(workflow.store.getState().error).toBe("try again");
    await workflow.resume({ code: "new-code" }, input.returnUrl);
    expect(resume).toHaveBeenLastCalledWith(
      "setup",
      { code: "new-code" },
      input.returnUrl,
      expect.any(AbortSignal),
    );
    expect(workflow.store.getState().status).toBe("complete");
  });
  it("aborts and ignores a late result after workspace disposal", async () => {
    let resolve!: (value: unknown) => void;
    const start = vi.fn(
      (_input, _signal) =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const workflow = createProviderSetupWorkflow({ start, resume: vi.fn() });
    const pending = workflow.start(input);
    workflow.dispose();
    expect(start.mock.calls[0]![1].aborted).toBe(true);
    resolve({ next_action: { type: "complete" } });
    await pending;
    expect(workflow.store.getState()).toEqual({ status: "idle" });
  });
  it("rejects malformed responses and missing continuation identifiers", async () => {
    const resume = vi.fn();
    const workflow = createProviderSetupWorkflow({
      start: async () => ({ next_action: { type: "unknown" } }),
      resume,
    });
    await workflow.start(input);
    expect(workflow.store.getState().status).toBe("error");
    await workflow.resume({}, input.returnUrl);
    expect(resume).not.toHaveBeenCalled();
  });
});

import { defineInstrumentation } from "@openbot/agent-service-provider/instrumentation";

export default defineInstrumentation({
  async setup({ agentName }: { agentName: string }): Promise<void> {
    void agentName;
  },
});

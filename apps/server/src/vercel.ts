import { migrate } from "@openbot/db";
import { fetchRequestHandler } from "./fetch-handler.js";

let migration: Promise<void> | undefined;

export default {
  async fetch(request: Request): Promise<Response> {
    migration ??= migrate();
    try {
      await migration;
      return fetchRequestHandler(request);
    } catch (error) {
      migration = undefined;
      console.error("OpenBot request initialization failed", error instanceof Error ? error.message : "unknown error");
      return Response.json({ error: "Service initialization failed" }, { status: 503 });
    }
  },
};

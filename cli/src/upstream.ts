// Identifies the canonical OpenBot repository.
//
// Store publication is upstream-only: the official EAS project, bundle identifier, and
// store listings belong to trytilde/openbot. A fork inherits the tracked configuration,
// so the guard has to be in code — a comment in a config file does not stop a release.
import { spawnSync } from "node:child_process";

export const upstreamRepository = "trytilde/openbot";

/** `owner/name` for a remote, from either an SSH or HTTPS URL. Undefined when unknown. */
export function remoteRepository(cwd: string, remote = "origin"): string | undefined {
  const result = spawnSync("git", ["remote", "get-url", remote], { cwd, encoding: "utf8" });
  if (result.status !== 0) return undefined;
  const url = result.stdout.trim();
  const matched = /(?:[:/])([^/:]+\/[^/]+?)(?:\.git)?$/.exec(url);
  return matched?.[1];
}

export function isUpstreamRepository(cwd: string): boolean {
  return remoteRepository(cwd)?.toLowerCase() === upstreamRepository;
}

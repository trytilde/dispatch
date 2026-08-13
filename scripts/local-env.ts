import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { randomBytes } from "node:crypto";
import { arch, platform } from "node:os";
import { config } from "dotenv";

export async function loadLocalEnvironment(): Promise<NodeJS.ProcessEnv> {
  config({ path: [".env.local", ".env"], quiet: true });
  process.env.DATABASE_URL ||= "file:./.data/openbot.db";
  process.env.OPENBOT_PORT ||= process.env.TUNNEL_PORT || process.env.PORT || "4100";
  process.env.OPENBOT_WEB_PORT ||= "4173";
  process.env.OPENBOT_PUBLIC_ORIGIN ||=
    process.env.TILDE_LOCAL_RUNTIME_TUNNEL_ORIGIN ||
    `http://127.0.0.1:${process.env.OPENBOT_WEB_PORT}`;
  if (!process.env.OPENBOT_SETUP_CODE) {
    await mkdir(".data", { recursive: true });
    const path = ".data/local-setup-code";
    let code: string;
    try {
      code = (await readFile(path, "utf8")).trim();
    } catch {
      code = randomBytes(32).toString("base64url");
      await writeFile(path, `${code}\n`, { mode: 0o600 });
    }
    process.env.OPENBOT_SETUP_CODE = code;
  }
  return process.env;
}

export async function validateLocalSandboxHost(): Promise<{
  provider: "microsandbox" | "vercel-sandbox";
  message: string;
}> {
  if (
    process.env.OPENBOT_SANDBOX_PROVIDER === "vercel" ||
    process.env.OPENBOT_SANDBOX_PROVIDER === "vercel-sandbox"
  ) {
    process.env.OPENBOT_SANDBOX_PROVIDER = "vercel-sandbox";
    return {
      provider: "vercel-sandbox",
      message: "Remote Vercel Sandbox selected explicitly; local virtualization is not required.",
    };
  }
  if (platform() === "darwin") {
    if (arch() === "arm64")
      return {
        provider: "microsandbox",
        message: "Apple Silicon detected; Microsandbox will start on demand.",
      };
    process.env.OPENBOT_SANDBOX_PROVIDER = "vercel-sandbox";
    return {
      provider: "vercel-sandbox",
      message: "Intel macOS detected; local sandboxes will use remote Vercel Sandbox.",
    };
  }
  if (platform() !== "linux")
    throw new Error(`OpenBot local development supports macOS and Linux, not ${platform()}`);
  try {
    await access("/dev/kvm", constants.R_OK | constants.W_OK);
  } catch {
    throw new Error(
      "Microsandbox requires readable and writable /dev/kvm on Linux. Enable KVM and add this user to the kvm group.",
    );
  }
  return {
    provider: "microsandbox",
    message: "Linux KVM detected; Microsandbox will start on demand.",
  };
}

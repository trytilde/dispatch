// Opens the ssh tunnel that carries the remote development stack — emulator
// screen over VNC, Metro, and adb — to this workstation's loopback.
import { spawn } from "node:child_process";
import arg from "arg";
import { loadHosts, resolveHost } from "../hosts.js";
import { connectionHints, tunnelArguments, type TunnelOptions } from "../tunnel.js";
import { repositoryRoot } from "../workspace.js";

export async function runConnect(argv: readonly string[]): Promise<number> {
  const options = arg(
    {
      "--print": Boolean,
      "--no-vnc": Boolean,
      "--no-desktop": Boolean,
      "--no-metro": Boolean,
      "--no-adb": Boolean,
    },
    { argv: [...argv] },
  );
  const [name] = options._;
  if (!name) {
    console.error(
      "Usage: openbot connect <host> [--print] [--no-vnc] [--no-desktop] [--no-metro] [--no-adb]",
    );
    return 1;
  }
  const host = resolveHost(name, loadHosts(repositoryRoot()));
  const tunnel: TunnelOptions = {
    vnc: !options["--no-vnc"],
    desktop: !options["--no-desktop"],
    metro: !options["--no-metro"],
    adb: !options["--no-adb"],
  };
  const sshArguments = tunnelArguments(host, tunnel);

  for (const hint of connectionHints(host, tunnel)) console.log(hint);
  console.log(`tunnel: ssh ${sshArguments.join(" ")}`);
  if (options["--print"]) return 0;

  console.log("holding tunnel open; Ctrl-C to close");
  const child = spawn("ssh", sshArguments, { stdio: "inherit" });
  return await new Promise<number>((resolvePromise) => {
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}

// Builds the ssh tunnel that makes a remote development host feel local.
// Everything on the remote binds loopback; the tunnel is the only path in.
import { defaultPorts, type DevHost } from "./hosts.js";

export interface TunnelOptions {
  vnc?: boolean;
  metro?: boolean;
  adb?: boolean;
}

export function tunnelArguments(host: DevHost, options: TunnelOptions = {}): string[] {
  const forwards: string[] = [];
  const forward = (port: number) => forwards.push("-L", `${port}:127.0.0.1:${port}`);
  if (options.vnc !== false) forward(host.vncPort ?? defaultPorts.vnc);
  if (options.metro !== false) forward(host.metroPort ?? defaultPorts.metro);
  if (options.adb !== false) forward(host.adbPort ?? defaultPorts.adb);
  return ["-N", ...forwards, host.ssh];
}

export function connectionHints(host: DevHost, options: TunnelOptions = {}): string[] {
  const hints: string[] = [];
  if (options.vnc !== false)
    hints.push(
      `screen: open vnc://localhost:${host.vncPort ?? defaultPorts.vnc}` +
        (host.platform === "mac" ? " (macOS Screen Sharing on the remote)" : ""),
    );
  if (options.metro !== false)
    hints.push(`metro:  http://localhost:${host.metroPort ?? defaultPorts.metro}`);
  if (options.adb !== false)
    hints.push(`adb:    adb connect localhost:${host.adbPort ?? defaultPorts.adb}`);
  return hints;
}

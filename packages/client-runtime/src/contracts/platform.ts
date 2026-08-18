import type { DesktopAuthBridge } from "./auth.js";

export interface DesktopClientBridge extends DesktopAuthBridge {
  platform: "mac" | "linux";
  controlOrigin: string;
  openExternal(url: string): Promise<void>;
}

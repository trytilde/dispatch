import type { DesktopClientBridge } from "@tryopenbot/client-runtime/contracts/platform";

declare global {
  interface Window {
    openbotDesktop?: DesktopClientBridge;
  }
}

export {};

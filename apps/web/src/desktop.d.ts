import type { DesktopClientBridge } from "@trytilde/dispatch-client-runtime/contracts/platform";

declare global {
  interface Window {
    dispatchDesktop?: DesktopClientBridge;
  }
}

export {};

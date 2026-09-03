import { contextBridge, ipcRenderer } from "electron";
import type { DesktopClientBridge } from "@trytilde/dispatch-client-runtime/contracts/platform";

const bridge = {
  platform: process.platform === "darwin" ? "mac" : "linux",
  controlOrigin: process.env.CONTROL_ORIGIN ?? "",
  async openExternal(value: string): Promise<void> {
    await ipcRenderer.invoke("dispatch:open-external", value);
  },
  authStatus: () => ipcRenderer.invoke("dispatch:auth-status"),
  signIn: () => ipcRenderer.invoke("dispatch:sign-in"),
  signOut: () => ipcRenderer.invoke("dispatch:sign-out"),
} as const satisfies DesktopClientBridge;

contextBridge.exposeInMainWorld("dispatchDesktop", bridge);

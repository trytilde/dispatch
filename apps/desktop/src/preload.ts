import { contextBridge, ipcRenderer } from "electron";

const bridge = {
  platform: process.platform === "darwin" ? "mac" : "linux",
  controlOrigin: process.env.OPENBOT_CONTROL_ORIGIN ?? "",
  async openExternal(value: string): Promise<void> {
    await ipcRenderer.invoke("openbot:open-external", value);
  },
} as const;

contextBridge.exposeInMainWorld("openbotDesktop", bridge);

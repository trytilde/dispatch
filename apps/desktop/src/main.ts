import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { startRendererServer, type RendererServer } from "./local-server.js";

if (process.platform === "win32")
  throw new Error("OpenBot Desktop currently supports macOS and Linux");

let window: BrowserWindow | undefined;
let rendererServer: RendererServer | undefined;

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1480,
    height: 930,
    minWidth: 900,
    minHeight: 640,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#fafafb",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const current = window?.webContents.getURL();
    if (current && new URL(url).origin !== new URL(current).origin) event.preventDefault();
  });

  const developmentUrl = process.env.DESKTOP_DEV_URL;
  if (developmentUrl) await window.loadURL(developmentUrl);
  else {
    rendererServer ??= await startRendererServer(
      join(process.resourcesPath, "web"),
      process.env.CONTROL_ORIGIN || "http://127.0.0.1:4100",
    );
    await window.loadURL(rendererServer.origin);
  }
}

async function main(): Promise<void> {
  ipcMain.handle("openbot:open-external", async (_event, value: unknown) => {
    if (typeof value !== "string") throw new Error("A URL is required");
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new Error("Only web links may be opened externally");
    await shell.openExternal(url.toString());
  });

  await app.whenReady();
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => {
    void rendererServer?.close();
  });
}

void main().catch((error: unknown) => {
  console.error("OpenBot Desktop failed to start", error);
  app.quit();
});

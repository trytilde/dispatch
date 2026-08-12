interface Window {
  openbotDesktop?: {
    platform: "mac" | "linux";
    controlOrigin: string;
    openExternal(url: string): Promise<void>;
  };
}

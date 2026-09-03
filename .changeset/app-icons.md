---
"@trytilde/dispatch-desktop": minor
"@trytilde/dispatch-web": minor
---

Carry the Dispatch mark across every client. Electron takes `apps/desktop/build/icon.png` as a rounded 1024px artwork, which electron-builder renders into the macOS `.icns` and the Linux icon set, replacing the unrelated placeholder mark it shipped with. The web app gains a favicon of the same drawing.

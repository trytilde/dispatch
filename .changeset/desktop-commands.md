---
"@trytilde/cli": minor
---

Add `tilde desktop dev` and `tilde desktop package`, and make the Electron shell runnable on a display-less host. Desktop renders to its own virtual screen on display `:2` with loopback VNC on 5901, separate from the Android emulator's `:1` and 5900 so both run at once; `tilde connect` forwards both screens, and `tilde remote <host> desktop` and `desktop-package` run them on a configured host. Also builds unbuilt workspace dependencies before starting Expo, so a fresh clone no longer fails Metro bundling with `Unable to resolve "@trytilde/dispatch-client-runtime"` when its `dist` is missing.

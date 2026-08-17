---
name: run-expo
description: Build, run, and inspect the OpenBot Expo client in apps/mobile, including the headless Android emulator on a display-less Linux host and access from a remote workstation. Use for mobile bundle checks, dev-client runs, emulator screenshots, and mobile evidence in a PR.
---

# Run Expo

`apps/mobile` is an Expo and React Native client using continuous native generation. `android/` and `ios/` are generated build output, are gitignored, and are never committed or hand-edited — change `app.json`, config plugins, or dependencies instead and let prebuild regenerate them.

Note the topology this repository is developed on: the workstation is a Mac, the build host is a display-less remote Linux box, and iOS simulators cannot run on Linux. Android is the only emulator target on that host.

## Choose The Narrowest Check

1. Bundle-level correctness, and the fastest gate: `pnpm --filter @tryopenbot/mobile build`. This runs `expo export --platform all` and fails on a platform-unsafe import such as DOM, Node, or Electron reaching `packages/client-runtime`. Run it for every mobile change.
2. Focused tests: `pnpm --filter @tryopenbot/mobile test`.
3. Types and lint: `pnpm --filter @tryopenbot/mobile check`.
4. Running app on an emulator or device: only when the acceptance condition is visual or interactive.

Do not run an emulator to prove something the export already proves.

## Toolchain

Every `@tryopenbot/mobile` script runs through `scripts/expo.mjs`, which resolves the toolchain in `scripts/toolchain.mjs` before spawning the Expo CLI. No `export PATH=...` prefix is needed, and none belongs in a command you hand to someone. If you find yourself writing one, fix `toolchain.mjs` instead.

What it resolves, and why each mattered:

- `ANDROID_SDK_ROOT` and `ANDROID_HOME`, defaulting to `/root/Android/sdk`, plus `platform-tools`, `emulator`, and `cmdline-tools/latest/bin` on `PATH`.
- A real Node binary, taken from `process.execPath`. Gradle spawns `node` while evaluating settings, and a version-manager shim or an expired `fnm` multishell directory fails there with `A problem occurred starting process 'command 'node''`.

The SDK itself must already have `platform-tools`, `emulator`, `platforms;android-36`, `build-tools;36.0.0`, and a `system-images;android-36;google_apis;x86_64` image. The host also needs a full JDK, `Xvfb`, `x11vnc`, and the emulator's shared libraries, including `libpulse0`.

Gradle needs a JDK, not a JRE. A JRE-only install fails with `Toolchain installation ... does not provide the required capabilities: [JAVA_COMPILER]` when a native module such as `react-native-svg` requests a Java toolchain; confirm with `javac -version`, not `java -version`.

A running Gradle daemon caches the environment it started with, so after changing the toolchain, restart it:

```bash
cd apps/mobile/android && ./gradlew --stop
```

Hardware acceleration requires `/dev/kvm`. Without it the emulator is too slow to be useful; run the export check instead and say the emulator was unavailable.

## Start The Emulator

```bash
pnpm --filter @tryopenbot/mobile emulator
```

`apps/mobile/scripts/android-emulator.mjs` starts `Xvfb` on `:1`, boots the `openbot` AVD with the software rasterizer, waits for `sys.boot_completed`, and exposes the virtual screen through `x11vnc` on `127.0.0.1:5900`. It is idempotent: rerunning it reuses whatever is already up.

Create the AVD once if it is missing:

```bash
avdmanager create avd -n openbot -k "system-images;android-36;google_apis;x86_64" -d pixel_7
```

## Build And Install The Dev Client

```bash
pnpm --filter @tryopenbot/mobile android
```

This prebuilds `android/`, assembles the debug APK, installs it on the running emulator, and starts Metro on port 8081. It takes several minutes on a cold Gradle cache.

It then does not exit: Metro stays in the foreground. Do not wait for the command to finish, and do not pipe it through `tail`, which buffers until an EOF that never comes. Judge completion from the device and the bundler instead:

```bash
adb shell dumpsys package dev.openbot.mobile | grep lastUpdateTime
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/status
```

If a build looks stuck, check whether Gradle is actually working — CPU on the daemon, a running compiler process, recent writes under `android/` — rather than polling `pgrep -f assembleDebug`, which also matches the shell that contains that string in its own command line.

Once the dev client is installed, later iterations only need Metro:

```bash
pnpm --filter @tryopenbot/mobile dev
```

Rebuild with `android` again only when a native module is added or `app.json` changes; a Metro reload cannot pick those up.

If you invoke the Expo CLI directly instead of through a package script, note two traps: run it from `apps/mobile`, because from `apps/mobile/android` it fails with `Command "expo" not found`, and do not pass `--device emulator-5554`, because Expo matches AVD names rather than adb serials and the serial fails with `Could not find device with name`.

## Reach It From A Remote Workstation

The emulator's adb ports and the VNC port bind to loopback. Metro does not: `expo start` and `expo run:android` bind port 8081 on all interfaces by default, so on a public-facing host either keep a firewall in front of 8081 or pass `--host localhost` — `expo run:android` installs an `adb reverse` mapping, so the emulator still reaches a loopback-bound Metro.

Forward what you need over SSH from the workstation rather than exposing anything. Never open a host firewall port for the emulator, VNC, or Metro.

```bash
ssh -N -L 5900:127.0.0.1:5900 -L 8081:127.0.0.1:8081 -L 5554:127.0.0.1:5554 -L 5555:127.0.0.1:5555 <host>
```

- Screen: open `vnc://localhost:5900` on macOS, which uses the built-in Screen Sharing client and needs no install. The `x11vnc` instance runs with `-nopw`, so its only protection is the loopback bind plus the tunnel. Do not remove `-localhost`.
- Metro: `http://localhost:8081` for the bundler status and logs.
- adb: `adb connect localhost:5555` on the workstation drives the emulator locally, which also enables `scrcpy` for a smoother screen than VNC. This is optional and needs `adb` on the Mac.

The emulator reaches a control service running on the build host at `http://10.0.2.2:<port>`, which is the emulator's alias for the host loopback. `127.0.0.1` inside the guest is the guest itself. For the first-launch service picker, enter the `10.0.2.2` form, and note that plain HTTP is accepted only for loopback development.

## Inspect And Capture

```bash
adb logcat -s ReactNativeJS:V
adb exec-out screencap -p > /tmp/openbot-mobile.png
adb shell input keyevent KEYCODE_BACK
adb shell input tap <x> <y>
```

`adb shell input keyevent 82` opens the React Native dev menu rather than acting on the app; dismiss it with `KEYCODE_BACK`.

Check both appearances, because every surface must resolve in light and dark:

```bash
adb shell cmd uimode night yes
adb shell am force-stop dev.openbot.mobile
adb shell monkey -p dev.openbot.mobile -c android.intent.category.LAUNCHER 1
```

A running app does not always repaint when the OS scheme changes, so force-stop and relaunch before judging dark mode, and restore with `cmd uimode night no` afterwards.

Store screenshots and recordings outside the repository. Never capture or paste a screen showing a real access token, setup code, or `.env` content.

## Adding UI Components

`apps/mobile` uses BNA UI. Add a component from `apps/mobile`:

```bash
pnpm dlx bna-ui add button
pnpm dlx bna-ui list
pnpm dlx bna-ui add button --dry-run
```

The CLI copies source into `src/components/ui`, hooks into `src/hooks`, tokens into `src/theme`, and installs npm dependencies. It requires the `@/*` alias in `tsconfig.json` to point at `./src/*` and refuses to run without it. When a copied component pulls in a native module — `react-native-reanimated`, `react-native-svg`, `expo-haptics` — the dev client must be rebuilt with `expo run:android`; a Metro reload is not enough.

Read colors through `useColor` and never hardcode a value, so every surface resolves in light and dark.

## Known Gaps

- The Android build runs edge-to-edge (`edgeToEdgeEnabled=true` in `android/gradle.properties`), so `adjustResize` does not shrink the window and the keyboard overlays content. Every screen with an input needs the `AvoidKeyboard` spacer; do not assume Android handles it.
- A running app may not repaint when the OS light/dark setting changes. Relaunch before judging appearance.
- iOS cannot be built or run on the Linux host. iOS coverage is limited to `expo export`, which validates the bundle only. Any iOS-specific claim requires a Mac with Xcode; say so instead of implying iOS was exercised.
- Real OAuth against a deployed service needs `openbot://auth/callback` registered as a redirect URI.

## Reporting

State which client was exercised, on what target, and with which command. Name every client and platform not exercised. A web screenshot is never mobile evidence, and an Android run is never iOS evidence.

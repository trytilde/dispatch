# Contributing

Everything in this repository is driven by one CLI. `openbot` operates an installation —
`init`, `dev`, `deploy`, `secrets`, `env` — and carries the developer workflow: repository
gates, the Expo mobile toolchain, and remote development hosts. Prefer a CLI command over a
hand-written script or a remembered command line; see [ADR-0018](docs/adrs/0018-developer-workflow-cli.md).

Run it as `pnpm openbot <command>` inside the repository, or `openbot <command>` from a global
`npm install --global openbot`.

## Prerequisites

Required on every platform:

| Dependency | Version | Why |
| --- | --- | --- |
| Node.js | 24.x | pinned by `engines`; the CLI and every package target it |
| pnpm | 10.33.1 | pinned by `packageManager`; `corepack enable pnpm` installs it |
| Git | any recent | worktrees and fork workflow |
| GitHub CLI (`gh`) | any recent | `openbot init` verifies authenticated access; PR workflow |

Needed only for the surfaces you touch:

| Surface | Dependency | Notes |
| --- | --- | --- |
| Mobile, Android | JDK **17 or 21** | the Android Gradle Plugin does not support newer majors; `javac -version`, not `java -version`, because a JRE fails mid-build |
| Mobile, Android | Android SDK, NDK, CMake | provisioned by `openbot mobile setup`; the system image matches your CPU, `arm64-v8a` on Apple Silicon and `x86_64` elsewhere, and the NDK matches the version React Native pins |
| Mobile, iOS | Xcode **16.1 or newer** + command line tools, an iOS 15.1+ simulator runtime, CocoaPods | macOS only. React Native 0.86 enforces the Xcode minimum inside `pod install`, which fails with `Please upgrade XCode`; `mobile doctor` reads that minimum from the installed React Native and checks it up front |
| Headless Android emulator | `/dev/kvm`, Xvfb, x11vnc | Linux only; without KVM the emulator is too slow to use |
| Browser end-to-end | Playwright browsers | `pnpm exec playwright install chromium` |
| Local Computer, deployment | Microsandbox, SOPS, age | see [docs/sandbox.md](docs/sandbox.md) and [docs/configuration.md](docs/configuration.md) |

Confirm the mobile toolchain at any time — it prints one line per check and names the remedy:

```bash
pnpm openbot mobile doctor
```

## Setup on Linux

```bash
# Node 24 and pnpm
curl -fsSL https://fnm.vercel.app/install | bash && exec "$SHELL" && fnm install 24 && fnm use 24
corepack enable pnpm

# repository
gh repo clone trytilde/openbot && cd openbot
pnpm install
pnpm openbot check
```

For mobile work, add the JDK and the emulator's system libraries, then let the CLI provision
the SDK. System packages need root, so the CLI reports them instead of installing them:

```bash
sudo apt-get install -y openjdk-21-jdk-headless xvfb x11vnc libpulse0 \
  libnss3 libxcursor1 libxrandr2 libxi6 libxtst6 libgl1 libglx-mesa0 libegl1 libasound2t64 libc++1
pnpm openbot mobile setup
pnpm openbot mobile avd
pnpm openbot mobile doctor
```

A Linux host without a display runs the emulator headless behind Xvfb with x11vnc bound to
loopback. Reach it from a workstation with `pnpm openbot connect -- <host>`; see
[.agents/skills/run-expo/SKILL.md](.agents/skills/run-expo/SKILL.md).

## Setup on macOS

```bash
# Node 24 and pnpm
brew install fnm && exec "$SHELL" && fnm install 24 && fnm use 24
corepack enable pnpm

# repository
gh repo clone trytilde/openbot && cd openbot
pnpm install
pnpm openbot check
```

For mobile work:

```bash
# Android: JDK 21 specifically — a bare `brew install openjdk` gives an unsupported major
brew install openjdk@21
sudo ln -sfn /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk \
  /Library/Java/JavaVirtualMachines/openjdk-21.jdk

# iOS — Xcode 16.1 or newer, from the App Store or developer.apple.com
xcode-select --install    # skip if Xcode is already installed
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
brew install cocoapods

pnpm openbot mobile setup
pnpm openbot mobile avd
pnpm openbot mobile doctor
```

`mobile doctor` warns rather than fails when the JDK major is unsupported, because iOS work
does not need Gradle. It fails on an Xcode below the React Native minimum, because
`pod install` will refuse regardless. The emulator opens a real window on macOS, so Xvfb and
x11vnc are not used and not required.

A Gradle failure reading `Execution failed for task ':react-native-worklets:configureCMakeDebug'`
with `WARNING: A restricted method in java.lang.System has been called` is the unsupported JDK,
not a broken checkout: Java 24 and newer restrict the native-access calls that React Native's
CMake configuration makes. Install `openjdk@21`, point `JAVA_HOME` at it, and rebuild. Nothing
in the message names the JDK, which is why `mobile doctor` warns about the major version.

If the simulator refuses to boot with `launchd failed to respond` or
`Failed to start launchd_sim`, that is a simulator-host problem rather than a repository one.
Clear it with `xcrun simctl shutdown all && killall -9 Simulator`, and reboot if it
persists.

## Working on a change

```bash
pnpm openbot check                     # contracts, types, lint, package tests
pnpm openbot build                     # every package, plus artifact verification
pnpm openbot test                      # repository tests
pnpm openbot e2e                       # browser Playwright suite
pnpm openbot desktop package           # Electron packaging
pnpm openbot mobile expo start --dev-client
pnpm --filter <package> test           # narrowest useful check while iterating
```

Start with the narrowest check that covers your change and broaden by risk. Run `e2e` when
browser behavior changed and `desktop package` when packaging, preload, or bundled resources
changed. Never claim a check you did not run.

Work on a focused branch and preserve unrelated fork changes.

## Boundaries

Provider contracts belong in `core.ts` or `core/` inside their domain provider package;
implementations belong beside them. Fork-specific integrations live in
`configuration/providers/` when `configuration/index.ts` selects them explicitly. Agent
prompts and execution belong in the primary `configuration/agent/` tree or one of its
`subagents/<id>/`, not the server router.

Shared client behavior belongs in `packages/client-runtime` before any client renders it; a
capability added to one of the web, mobile, or desktop clients requires an explicit decision
about the other two, per [ADR-0017](docs/adrs/0017-shared-client-runtime-and-expo-mobile.md).

Never commit `.env`, deployment state, generated credentials, or machine-specific paths.
Development host names and addresses belong in fork-owned `configuration/dev-hosts.json`,
which stays untracked upstream.

## Changing an external dependency

If your change adds, removes, or bumps a tool a contributor must install — a JDK major, an
Android package, an Xcode requirement, a system library, a Node or pnpm version — update the
prerequisite tables and the setup section above in the same PR, and extend
`openbot mobile doctor` so the requirement is verifiable rather than merely documented. The
`create-pr` skill gates this.

## Fork contributions and release notes

When contributing from a fork, separate reusable core changes from private configuration.
`.agents/skills/upstream-pr` documents the repository workflow for coding agents.

Owner-visible behavior and package API changes require a file under `.changeset/`. Every
workspace package is in one fixed version group; never change package versions or generated
changelogs independently. Use `pnpm changeset` or follow `.agents/skills/add-changeset`.

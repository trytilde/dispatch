import type { ExpoConfig } from "expo/config";

// Store identity for the official OpenBot app, published only from trytilde/openbot.
//
// A fork inherits this file, so every value a fork must not reuse is overridable through
// the environment. Setting OPENBOT_EAS_PROJECT_ID to a fork's own EAS project is what
// makes `openbot mobile release` willing to run there; see ADR-0027.
const officialEasProjectId = "ace1107b-b007-451a-8e50-2b571c40593e";
// Tilde publishes the app; OpenBot is the product. The identifier is therefore reverse-DNS
// of the publisher's domain, not the product's, and matches the Expo account that owns the
// store listings. Changing it after a first store submission is effectively impossible.
const officialOwner = "trytilde";
const officialBundleIdentifier = "ai.trytilde.openbot";

export const officialStoreIdentity = {
  easProjectId: officialEasProjectId,
  owner: officialOwner,
  bundleIdentifier: officialBundleIdentifier,
} as const;

// A GitHub Actions workflow substitutes an empty string for an unset `vars.*`, and an
// empty override must fall through to the official value rather than blanking it.
const override = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value === "" ? undefined : value;
};

const easProjectId = override("OPENBOT_EAS_PROJECT_ID") ?? officialEasProjectId;
const owner = override("OPENBOT_EXPO_OWNER") ?? officialOwner;
const bundleIdentifier = override("OPENBOT_APP_ID") ?? officialBundleIdentifier;

const config: ExpoConfig = {
  name: override("OPENBOT_APP_NAME") ?? "OpenBot",
  slug: override("OPENBOT_APP_SLUG") ?? "openbot",
  version: "0.1.0",
  orientation: "portrait",
  scheme: override("OPENBOT_APP_SCHEME") ?? "openbot",
  platforms: ["ios", "android"],
  userInterfaceStyle: "automatic",
  owner,
  // The launcher mark is an agent avatar, the same drawing the app renders for its agents,
  // on Tilde's electric blue. iOS takes the opaque square; Android takes a transparent
  // foreground over adaptiveIcon.backgroundColor. apps/desktop/build/icon.png carries the
  // same mark for Electron on macOS and Linux.
  icon: "./assets/icon.png",
  ios: {
    supportsTablet: true,
    bundleIdentifier,
    infoPlist: {
      // The app uses only standard HTTPS and OAuth, which are exempt encryption under the
      // US export rules, so declaring this up front avoids an App Store Connect prompt on
      // every submission.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: bundleIdentifier,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0038AE",
    },
  },
  plugins: ["expo-secure-store", "expo-image"],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    eas: { projectId: easProjectId },
  },
};

export default config;

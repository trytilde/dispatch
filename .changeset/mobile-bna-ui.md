---
"@tryopenbot/mobile": minor
---

Adopt BNA UI as the Expo client's React Native component library. Mobile screens now render themed components copied into `apps/mobile/src/components/ui`, read every color through `useColor` against the shared light and dark token sets, persist the appearance choice through `expo-secure-store`, and follow safe-area insets.

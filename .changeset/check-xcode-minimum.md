---
"openbot": patch
---

Check the Xcode version in `openbot mobile doctor` on macOS, reading the minimum from the installed React Native's CocoaPods helpers so it cannot drift from what `pod install` enforces. React Native 0.86 requires Xcode 16.1; below that, an iOS build fails partway through `pod install` with `Please upgrade XCode` rather than at the toolchain check. Passthrough command failures — `mobile expo`, `mobile logs`, the repository gates — also stop printing the run-log crash notice, because the child process has already reported the error.

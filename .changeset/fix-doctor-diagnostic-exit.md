---
"@trytilde/cli": patch
---

Report `tilde mobile doctor` failures as diagnostics rather than crashes. A missing tool no longer prints `Tilde exited unsuccessfully` with a run-log path; the command keeps its non-zero exit code but owns its explanation. Doctor also gains a warning level, warns when the JDK major version is outside the Android Gradle Plugin's supported 17 and 21, names `tilde mobile setup` as the remedy on each failing Android tool check, and checks for CocoaPods on macOS.

---
"openbot": patch
---

Select the Android emulator system image by host CPU: `arm64-v8a` on Apple Silicon and `x86_64` elsewhere. `openbot mobile setup` and `openbot mobile avd` previously hardcoded `x86_64`, which has no hardware acceleration path on an Apple Silicon Mac and produces an unusable emulator.

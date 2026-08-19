---
"openbot": patch
---

Provision the NDK and CMake in `openbot mobile setup`, reading the NDK version React Native pins in its `gradle/libs.versions.toml` rather than restating it, and check the NDK in `openbot mobile doctor`. The Android Gradle Plugin downloads both partway through a build otherwise, and a mismatch surfaces as a failed `configureCMakeDebug` task that names neither the NDK nor the cause.

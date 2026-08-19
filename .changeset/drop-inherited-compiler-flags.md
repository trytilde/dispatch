---
"openbot": patch
---

Drop inherited compiler search paths before spawning a native build. A global `CPPFLAGS` pointing at Homebrew LLVM makes clang find an incompatible C standard library, so an iOS build fails inside the SDK's own modulemap with `found_incompatible_headers__check_search_paths` and a cascade of `could not build module 'Foundation'` that names neither the variable nor the shell. `openbot` now removes `CPPFLAGS`, `CFLAGS`, `CXXFLAGS`, `LDFLAGS`, `CPATH`, and the include-path variables for its own builds and reports that it did; `openbot mobile doctor` warns when a shell carries them. Set `OPENBOT_KEEP_COMPILER_FLAGS=1` to keep them.

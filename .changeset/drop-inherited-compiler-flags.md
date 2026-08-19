---
"openbot": patch
---

Report compiler search paths that break Xcode module builds in `openbot mobile doctor`. A global `CPPFLAGS` pointing at Homebrew LLVM makes clang find an incompatible C standard library, so an iOS build fails inside the SDK's own modulemap with `found_incompatible_headers__check_search_paths` and a cascade of `could not build module 'Foundation'` that names neither the variable nor the shell. Doctor now names them; it does not change them, because the developer's environment is theirs to own.

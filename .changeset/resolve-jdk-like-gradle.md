---
"openbot": patch
---

Resolve the JDK in `openbot mobile doctor` the way Gradle does: `JAVA_HOME` first, `PATH` only as a fallback, with the source named in the output. On a machine with several JDKs installed — a linked Homebrew `openjdk` shadowing a keg-only `openjdk@21`, for instance — the previous check reported the compiler on `PATH` while Gradle built against a different one, so a correctly configured host could still be told its JDK was unsupported. Doctor now also notes when `JAVA_HOME` and `PATH` disagree.

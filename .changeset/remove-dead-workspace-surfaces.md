---
"@tryopenbot/ui": minor
"@tryopenbot/web": minor
---

Remove the unreachable conversation outline and background tasks panels, and route the web authentication gate through the shared client runtime instead of its own session fetch. `AsyncTasksPanel`, `ConversationOutlinePanel`, and their types are no longer exported from `@tryopenbot/ui`. The gate now bootstraps the runtime, which also fixes the runtime never being initialized, and the onboarding no longer persists a result nothing read.

# Provider plugins

`configuration/providers/` is reserved for fork-owned provider plugins. Runtime discovery and selection are intentionally unwired until a UX and control API require them.

Provider interfaces belong to their domain core packages. Reusable implementations belong in the matching domain provider package; fork-specific implementations stay here.

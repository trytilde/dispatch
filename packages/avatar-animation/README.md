# @tryopenbot/avatar-animation

Framework-independent avatar descriptors, deterministic look selection, hosted
asset URLs, and spring animation math shared by OpenBot and Tilde clients.

Avatar artwork is versioned at
`https://trytilde.ai/avatar-assets/v1/manifest.json`. Consumers persist only
the descriptor IDs, never copied image data or arbitrary asset URLs.

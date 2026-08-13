# Custom providers

This directory is reserved for fork-owned provider implementations. Export a
concrete implementation here, then import and instantiate it explicitly in
`configuration/index.ts` under the appropriate `providers` domain key. OpenBot
does not discover providers by ID or select them through a built-in registry.

Provider modules are trusted application code. Keep credentials in the
configured environment provider; never commit values here.

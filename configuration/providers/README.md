# Custom providers

This directory is reserved for fork-owned provider plugins. The configured
runtime provider is currently selected from the built-in provider registry;
custom provider discovery remains unwired while the UX and control API are designed.

Provider modules are trusted application code. Keep credentials in the
configured environment provider; never commit values here.

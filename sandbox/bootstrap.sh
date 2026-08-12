#!/usr/bin/env bash
set -euo pipefail

# Runs after sandbox/assets is copied into /workspace on every sandbox start.
# Keep this script idempotent.
mkdir -p /workspace

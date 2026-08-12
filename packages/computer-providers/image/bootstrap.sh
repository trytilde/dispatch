#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_VERSION=2026-08-12.1
CUA_DRIVER_VERSION=0.19.3
CHROME_VERSION_AMD64=151.0.7922.137-1
CHROME_SHA256_AMD64=e6dabf044cf9cd0279cfe86efa431682c18bfc06d06339ce055aaa87ae871727
MARKER=/opt/openbot/.computer-image-version

export DEBIAN_FRONTEND=noninteractive
mkdir -p /opt/openbot /workspace /root/.vnc

if [[ -f "$MARKER" ]] && [[ "$(cat "$MARKER")" == "$BOOTSTRAP_VERSION" ]]; then
  exit 0
fi

apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl dbus-x11 fonts-liberation imagemagick jq nodejs \
  novnc openbox procps tigervnc-standalone-server websockify x11-utils xdotool xterm

architecture="$(dpkg --print-architecture)"
if [[ "$architecture" == "amd64" ]]; then
  chrome_deb=/tmp/google-chrome.deb
  curl -fsSL "https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_${CHROME_VERSION_AMD64}_amd64.deb" -o "$chrome_deb"
  echo "$CHROME_SHA256_AMD64  $chrome_deb" | sha256sum -c -
  apt-get install -y "$chrome_deb"
  rm -f "$chrome_deb"
else
  apt-get install -y chromium
fi

curl -fsSL https://cua.ai/driver/install.sh -o /tmp/cua-driver-install.sh
if ! CUA_DRIVER_RS_VERSION="$CUA_DRIVER_VERSION" \
    CUA_DRIVER_RS_INSTALL_DIR=/usr/local/bin \
    CUA_DRIVER_RS_NO_MODIFY_PATH=1 \
    bash /tmp/cua-driver-install.sh --no-modify-path; then
  cua-driver --version >/dev/null
fi
rm -f /tmp/cua-driver-install.sh
cua-driver telemetry disable >/dev/null 2>&1 || true
cua_source="$(readlink -f "$(command -v cua-driver)")"
install -m 0755 "$cua_source" /usr/local/bin/openbot-cua-driver
ln -sfn openbot-cua-driver /usr/local/bin/cua-driver

printf '%s' "$BOOTSTRAP_VERSION" > "$MARKER"
apt-get clean
rm -rf /var/lib/apt/lists/*

export const DESKTOP_BOOTSTRAP_VERSION = "2026-08-12.3";
export const CUA_DRIVER_VERSION = "0.19.3";
export const CHROME_VERSION_AMD64 = "151.0.7922.137-1";
export const CHROME_SHA256_AMD64 = "e6dabf044cf9cd0279cfe86efa431682c18bfc06d06339ce055aaa87ae871727";

export const desktopBootstrapScript = String.raw`#!/usr/bin/env bash
set -euo pipefail

BOOTSTRAP_VERSION="${DESKTOP_BOOTSTRAP_VERSION}"
CUA_DRIVER_VERSION="${CUA_DRIVER_VERSION}"
CHROME_VERSION_AMD64="${CHROME_VERSION_AMD64}"
CHROME_SHA256_AMD64="${CHROME_SHA256_AMD64}"
MARKER=/opt/openbot/.desktop-bootstrap-version

export DEBIAN_FRONTEND=noninteractive
mkdir -p /opt/openbot /workspace /root/.vnc

if [[ ! -f "$MARKER" ]] || [[ "$(cat "$MARKER")" != "$BOOTSTRAP_VERSION" ]]; then
  apt-get update
  apt-get install -y --no-install-recommends \
    ca-certificates curl dbus-x11 fonts-liberation imagemagick jq nodejs \
    novnc openbox procps tigervnc-standalone-server websockify x11-utils xdotool xterm

  architecture="$(dpkg --print-architecture)"
  if [[ "$architecture" == "amd64" ]]; then
    chrome_deb=/tmp/google-chrome.deb
    curl -fsSL "https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_$CHROME_VERSION_AMD64"_amd64.deb -o "$chrome_deb"
    echo "$CHROME_SHA256_AMD64  $chrome_deb" | sha256sum -c -
    apt-get install -y "$chrome_deb"
    rm -f "$chrome_deb"
  else
    # Google does not publish Chrome for Linux arm64. Debian Chromium is the
    # compatible first-class browser for Apple Silicon Microsandbox guests.
    apt-get install -y chromium
  fi

  curl -fsSL https://cua.ai/driver/install.sh -o /tmp/cua-driver-install.sh
  if ! CUA_DRIVER_RS_VERSION="$CUA_DRIVER_VERSION" \
      CUA_DRIVER_RS_INSTALL_DIR=/usr/local/bin \
      CUA_DRIVER_RS_NO_MODIFY_PATH=1 \
      bash /tmp/cua-driver-install.sh --no-modify-path; then
    # Some minimal microVMs do not expose /dev/fd. Cua's installer can fail
    # in its nonessential post-install helper after atomically installing the
    # pinned binary, so accept that case only when the binary verifies itself.
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
fi

install -m 0755 /.msb/scripts/start-openbot-desktop /usr/local/bin/start-openbot-desktop 2>/dev/null || true
`;

export const desktopStartScript = String.raw`#!/usr/bin/env bash
set -euo pipefail

if [[ -z "$(printenv DISPLAY 2>/dev/null || true)" ]]; then export DISPLAY=:1; fi
if [[ -z "$(printenv XDG_RUNTIME_DIR 2>/dev/null || true)" ]]; then export XDG_RUNTIME_DIR=/tmp/openbot-runtime; fi
if [[ -z "$(printenv OPENBOT_DESKTOP_GEOMETRY 2>/dev/null || true)" ]]; then export OPENBOT_DESKTOP_GEOMETRY=1440x900; fi
if [[ -z "$(printenv CUA_DRIVER_SOCKET 2>/dev/null || true)" ]]; then export CUA_DRIVER_SOCKET=/tmp/openbot-cua-driver.sock; fi
if [[ -z "$(printenv OPENBOT_DESKTOP_CAPABILITY 2>/dev/null || true)" ]]; then
  echo 'OPENBOT_DESKTOP_CAPABILITY is required' >&2
  exit 1
fi
mkdir -p "$XDG_RUNTIME_DIR" /workspace/.chrome /workspace/.openbot
chmod 0700 "$XDG_RUNTIME_DIR"

# Vercel's onResume hook may be observed by more than one stateless control
# request for the same running VM. Only one launcher may own the desktop
# processes: a second Cua daemon unlinks the first daemon's live socket before
# it fails to bind. Record both boot identity and PID so a lock snapshotted
# from an older VM can be recovered safely.
START_LOCK=/tmp/openbot-desktop-start.lock
START_OWNER="$START_LOCK/owner"
CURRENT_BOOT="$(cat /proc/sys/kernel/random/boot_id)"
lock_acquired=false
for _ in 1 2; do
  if mkdir "$START_LOCK" 2>/dev/null; then
    printf '%s %s\n' "$CURRENT_BOOT" "$$" > "$START_OWNER"
    lock_acquired=true
    break
  fi
  locked_boot=''
  locked_pid=''
  if read -r locked_boot locked_pid < "$START_OWNER" 2>/dev/null \
      && [[ "$locked_boot" == "$CURRENT_BOOT" ]] \
      && kill -0 "$locked_pid" 2>/dev/null; then
    exit 0
  fi
  rm -f "$START_OWNER"
  rmdir "$START_LOCK" 2>/dev/null || true
done
[[ "$lock_acquired" == true ]] || exit 0
cleanup_start_lock() {
  locked_boot=''
  locked_pid=''
  if read -r locked_boot locked_pid < "$START_OWNER" 2>/dev/null \
      && [[ "$locked_boot" == "$CURRENT_BOOT" ]] \
      && [[ "$locked_pid" == "$$" ]]; then
    rm -f "$START_OWNER"
    rmdir "$START_LOCK" 2>/dev/null || true
  fi
}
trap cleanup_start_lock EXIT

pkill -f 'Xvnc :1' >/dev/null 2>&1 || true
pkill -f 'websockify.*6080' >/dev/null 2>&1 || true

Xvnc :1 -geometry "$OPENBOT_DESKTOP_GEOMETRY" -depth 24 \
  -SecurityTypes None -localhost no >/var/log/openbot-xvnc.log 2>&1 &

for _ in $(seq 1 60); do
  xdpyinfo -display :1 >/dev/null 2>&1 && break
  sleep 0.25
done
xdpyinfo -display :1 >/dev/null 2>&1

dbus-launch --exit-with-session openbox-session >/var/log/openbot-openbox.log 2>&1 &

browser=google-chrome-stable
command -v "$browser" >/dev/null 2>&1 || browser=chromium
"$browser" --no-sandbox --disable-dev-shm-usage --disable-gpu \
  --user-data-dir=/workspace/.chrome --start-maximized about:blank \
  >/var/log/openbot-browser.log 2>&1 &

printf '%s: localhost:5901\n' "$OPENBOT_DESKTOP_CAPABILITY" > /opt/openbot/novnc.tokens
chmod 0600 /opt/openbot/novnc.tokens
websockify --web=/usr/share/novnc --token-plugin TokenFile \
  --token-source /opt/openbot/novnc.tokens 0.0.0.0:6080 \
  >/var/log/openbot-novnc.log 2>&1 &

CUA_EXECUTABLE=/usr/local/bin/openbot-cua-driver
if [[ ! -x "$CUA_EXECUTABLE" ]]; then
  CUA_SOURCE="$(readlink -f "$(command -v cua-driver)")"
  install -m 0755 "$CUA_SOURCE" "$CUA_EXECUTABLE"
fi
ln -sfn openbot-cua-driver /usr/local/bin/cua-driver
if [[ "$(id -u)" == 0 ]] && getent passwd 1000 >/dev/null 2>&1; then
  CUA_USER="$(id -nu 1000)"
  CUA_GROUP="$(id -gn 1000)"
  CUA_HOME="$(getent passwd 1000 | cut -d: -f6)"
  CUA_RUNTIME_DIR="/tmp/openbot-cua-runtime-1000"
  install -d -o "$CUA_USER" -g "$CUA_GROUP" -m 0700 "$CUA_RUNTIME_DIR"
  runuser -u "$CUA_USER" -- env \
    DISPLAY="$DISPLAY" HOME="$CUA_HOME" XDG_RUNTIME_DIR="$CUA_RUNTIME_DIR" \
    "$CUA_EXECUTABLE" serve --socket "$CUA_DRIVER_SOCKET" --dangerously-bypass-approvals \
    >/var/log/openbot-cua-driver.log 2>&1 &
else
  "$CUA_EXECUTABLE" serve --socket "$CUA_DRIVER_SOCKET" --dangerously-bypass-approvals \
    >/var/log/openbot-cua-driver.log 2>&1 &
fi
for _ in $(seq 1 60); do
  if [[ -S "$CUA_DRIVER_SOCKET" ]]; then
    chmod 0666 "$CUA_DRIVER_SOCKET"
    break
  fi
  sleep 0.25
done

if [[ -f /opt/openbot/box-host.mjs ]] && command -v node >/dev/null 2>&1; then
  node /opt/openbot/box-host.mjs >/var/log/openbot-box-host.log 2>&1 &
fi

wait -n
`;

#!/usr/bin/env bash
set -euo pipefail

: "${OPENBOT_COMPUTER_CAPABILITY:?OPENBOT_COMPUTER_CAPABILITY is required}"
: "${OPENBOT_VNC_CAPABILITY:?OPENBOT_VNC_CAPABILITY is required}"
export DISPLAY="${DISPLAY:-:1}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/openbot-runtime}"
export OPENBOT_COMPUTER_GEOMETRY="${OPENBOT_COMPUTER_GEOMETRY:-1440x900}"
export CUA_DRIVER_SOCKET="${CUA_DRIVER_SOCKET:-/tmp/openbot-cua-driver.sock}"

mkdir -p "$XDG_RUNTIME_DIR" /workspace/.chrome /workspace/.openbot
chmod 0700 "$XDG_RUNTIME_DIR"

start_lock=/tmp/openbot-computer-start.lock
owner_file="$start_lock/owner"
current_boot="$(cat /proc/sys/kernel/random/boot_id)"
for _ in $(seq 1 20); do
  if mkdir "$start_lock" 2>/dev/null; then
    printf '%s %s\n' "$current_boot" "$$" > "$owner_file"
    break
  fi
  locked_boot=''
  locked_pid=''
  if read -r locked_boot locked_pid < "$owner_file" 2>/dev/null \
      && [[ "$locked_boot" == "$current_boot" ]] \
      && kill -0 "$locked_pid" 2>/dev/null; then
    exit 0
  fi
  rm -f "$owner_file"
  rmdir "$start_lock" 2>/dev/null || true
  sleep 0.05
done

cleanup_lock() {
  rm -f "$owner_file"
  rmdir "$start_lock" 2>/dev/null || true
}
trap cleanup_lock EXIT

pkill -f 'Xvnc :1' >/dev/null 2>&1 || true
pkill -f 'websockify.*6080' >/dev/null 2>&1 || true

Xvnc :1 -geometry "$OPENBOT_COMPUTER_GEOMETRY" -depth 24 \
  -SecurityTypes None -localhost yes >/var/log/openbot-xvnc.log 2>&1 &

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

printf '%s: localhost:5901\n' "$OPENBOT_VNC_CAPABILITY" > /opt/openbot/novnc.tokens
chmod 0600 /opt/openbot/novnc.tokens
websockify --web=/usr/share/novnc --token-plugin TokenFile \
  --token-source /opt/openbot/novnc.tokens 0.0.0.0:6080 \
  >/var/log/openbot-novnc.log 2>&1 &

/usr/local/bin/openbot-cua-driver serve --socket "$CUA_DRIVER_SOCKET" --dangerously-bypass-approvals \
  >/var/log/openbot-cua-driver.log 2>&1 &

node /opt/openbot/computer-service.mjs >/var/log/openbot-computer-service.log 2>&1 &

wait -n

#!/usr/bin/env bash
# Runs an app at login as a systemd user service, so https://<hostname> is always there without starting anything
# first. No root needed.
#
#   bash node_modules/@organon/core/scripts/install-service.sh <app root>
#
# The service runs the checkout given. release.ts runs it from the release copy, with <PREFIX>_DATA_DIR and
# <PREFIX>_STATE_DIR pointing back at the working checkout's data/ and .<name>/, so the code that serves is a fixed
# release while the data stays where it always was. Safe to run again: it rewrites the unit and restarts the service.
#
# To undo: systemctl --user disable --now <name>.service && rm ~/.config/systemd/user/<name>.service
# From Galen's scripts/install-service.sh.
set -euo pipefail

SCRIPTS=$(cd "$(dirname "$0")" && pwd)
APP_ROOT=$(cd "${1:?Usage: install-service.sh <app root>}" && pwd)
source "$SCRIPTS/app-json.sh"
NODE=$(command -v node)
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$APP_NAME.service"
mkdir -p "$UNIT_DIR"

# Pass the data and state folders on to the service when they are set (release.ts sets them).
EXTRA_ENV=""
for var in "${APP_PREFIX}_DATA_DIR" "${APP_PREFIX}_STATE_DIR"; do
  if [[ -n "${!var:-}" ]]; then EXTRA_ENV+="Environment=$var=${!var}"$'\n'; fi
done

# Node keeps the compiled server here, so a restart starts about a third faster. Emptied on every install (each
# release), so it never fills with entries for code that no longer runs.
state_var="${APP_PREFIX}_STATE_DIR"
CACHE="${!state_var:-$APP_ROOT/.$APP_NAME}/compile-cache"
rm -rf "$CACHE"
mkdir -p -m 700 "$CACHE"

cat > "$UNIT_DIR/$UNIT" <<UNITFILE
[Unit]
Description=$APP_TITLE (https://$APP_HOSTNAME)

[Service]
WorkingDirectory=$APP_ROOT
ExecStart=$NODE $APP_ROOT/server/index.ts
Restart=on-failure
RestartSec=2
# Agent CLIs live in ~/.local/bin; a service doesn't get the login shell's PATH.
Environment=PATH=$HOME/.local/bin:$(dirname "$NODE"):/usr/local/bin:/usr/bin:/bin
Environment=NODE_COMPILE_CACHE=$CACHE
${EXTRA_ENV}
[Install]
WantedBy=default.target
UNITFILE

# Hand over from a server started by hand or by the bridge, if one is running and the service isn't yet.
if ! systemctl --user is-enabled --quiet "$UNIT"; then
  # Only a pid that still runs a server/index.ts: a pid file left by a crash may name some other process by now.
  "$NODE" -e "const fs=require('fs');const p=Number(fs.readFileSync(process.argv[1],'utf8'));if(fs.readFileSync('/proc/'+p+'/cmdline','utf8').includes('server/index.ts'))process.kill(p,'SIGTERM')" \
    "${!state_var:-$APP_ROOT/.$APP_NAME}/server-$APP_PORT.pid" 2>/dev/null || true
  sleep 1
fi

systemctl --user daemon-reload
systemctl --user enable "$UNIT"
systemctl --user restart "$UNIT"
sleep 1
echo "$UNIT: $(systemctl --user is-active "$UNIT"), running $APP_ROOT"

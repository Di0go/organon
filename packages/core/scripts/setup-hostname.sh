#!/usr/bin/env bash
# Gives an app its clean URL, https://<hostname>, from its app.json. As root, once (safe to run again):
#   1. /etc/hosts maps <hostname> to the app's own loopback address (127.0.0.8x).
#   2. /etc/<name>.nft redirects <loopback>:80 to the app on 127.0.0.1:<live port>, and :443 to its HTTPS port.
#   3. <name>-nome.service loads that rule at boot.
#   4. The app's certificate authority (from tls.sh, limited to <hostname>) goes into the system trust store
#      (p11-kit), which Firefox and Chromium read; then .<name>/tls/installed tells the server to move http to https.
# Each app has its own loopback address and its own nft table, so two apps' rules never meet.
#
# Run tls.sh first (as yourself), then:
#   pkexec bash <app root>/node_modules/@organon/core/scripts/setup-hostname.sh <app root>
#   ... --print   says what it would write, changes nothing, needs no root (the core's tests run it)
#
# To undo: systemctl disable --now <name>-nome.service, delete /etc/<name>.nft and the unit, remove the <hostname>
# lines from /etc/hosts, trust anchor --remove .<name>/tls/ca.crt, and delete .<name>/tls.
# From Galen's scripts/setup-hostname.sh.
set -euo pipefail

SCRIPTS=$(cd "$(dirname "$0")" && pwd)
APP_ROOT=$(cd "${1:?Usage: setup-hostname.sh <app root> [--print]}" && pwd)
PRINT=${2:-}
source "$SCRIPTS/app-json.sh"
NAME=$APP_HOSTNAME
TLS="$APP_ROOT/.$APP_NAME/tls"
TABLE=${APP_NAME//-/_}

NFT="#!/usr/bin/nft -f
# $APP_TITLE: http(s)://$NAME -> 127.0.0.1:$APP_PORT (http) and :$APP_TLS_PORT (https)
destroy table ip $TABLE
table ip $TABLE {
  chain saida {
    type nat hook output priority -100; policy accept;
    ip daddr $APP_LOOPBACK tcp dport 80 redirect to :$APP_PORT
    ip daddr $APP_LOOPBACK tcp dport 443 redirect to :$APP_TLS_PORT
  }
}"
UNIT="[Unit]
Description=$APP_TITLE: $NAME:80/443 para 127.0.0.1:$APP_PORT/$APP_TLS_PORT
After=nftables.service
PartOf=nftables.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/nft -f /etc/$APP_NAME.nft
ExecStop=/usr/bin/nft delete table ip $TABLE

[Install]
WantedBy=multi-user.target"
HOSTS="# $APP_TITLE ($APP_ROOT): reencaminhado para 127.0.0.1:$APP_PORT
$APP_LOOPBACK $NAME"

if [[ "$PRINT" == "--print" ]]; then
  printf '/etc/hosts gets:\n%s\n\n/etc/%s.nft:\n%s\n\n/etc/systemd/system/%s-nome.service:\n%s\n\ntrusted: %s\n' \
    "$HOSTS" "$APP_NAME" "$NFT" "$APP_NAME" "$UNIT" "$TLS/ca.crt"
  exit 0
fi

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: pkexec bash $0 $APP_ROOT" >&2
  exit 1
fi

# Another line already giving this loopback address to another name would mix two apps' traffic: stop.
if grep -E "^\s*${APP_LOOPBACK//./\\.}\s" /etc/hosts | grep -vqE "\s$NAME(\s|$)"; then
  echo "/etc/hosts already gives $APP_LOOPBACK to another name; pick another loopback in app.json." >&2
  exit 1
fi

# $TLS belongs to the user, so anything there could change between a check and its use. Root reads each file once,
# into a private copy, and checks and uses only that copy; the one file it writes there, it writes as the user.
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
OWNER=$(stat -c %U "$APP_ROOT")
snapshot() { install -m 600 -o root -g root "$1" "$WORK/$(basename "$1")" && echo "$WORK/$(basename "$1")"; }

# 1. Hosts entry (only if missing).
if ! grep -qE "^[^#]*\s${NAME//./\\.}(\s|$)" /etc/hosts; then
  [[ -f "/etc/hosts.bak-$APP_NAME" ]] || cp /etc/hosts "/etc/hosts.bak-$APP_NAME"
  printf '\n%s\n' "$HOSTS" >> /etc/hosts
  echo "Added $NAME to /etc/hosts"
else
  echo "$NAME already in /etc/hosts"
fi

# 2 and 3. The redirect rule and the unit that loads it at boot.
printf '%s\n' "$NFT" > "/etc/$APP_NAME.nft"
printf '%s\n' "$UNIT" > "/etc/systemd/system/$APP_NAME-nome.service"
systemctl daemon-reload
systemctl enable "$APP_NAME-nome.service"
systemctl restart "$APP_NAME-nome.service"
echo "$APP_NAME-nome.service: $(systemctl is-active "$APP_NAME-nome.service")"

# 4. Trust the app's certificate authority, but only one that cannot sign anything other than $NAME.
if [[ ! -f "$TLS/ca.crt" ]]; then
  echo "No certificate yet: run 'bash $SCRIPTS/tls.sh $APP_ROOT' as yourself, then this again." >&2
  exit 1
fi
CA=$(snapshot "$TLS/ca.crt")
PERMITTED=$(openssl x509 -in "$CA" -noout -ext nameConstraints 2>/dev/null \
  | sed -n '/Permitted:/,/Excluded:/{/DNS:\|IP:\|email:\|URI:\|DirName:/p}' | tr -d ' ')
CRITICAL=$(openssl x509 -in "$CA" -noout -ext nameConstraints 2>/dev/null | grep -c 'Name Constraints: critical' || true)
if [[ "$PERMITTED" != "DNS:$NAME" || "$CRITICAL" != 1 ]]; then
  echo "$TLS/ca.crt is not limited to $NAME: not trusting it. Run tls.sh first." >&2
  exit 1
fi
trust anchor --remove "$CA" 2>/dev/null || true
trust anchor --store "$CA"
runuser -u "$OWNER" -- touch "$TLS/installed"
echo "Trusted. Restart $APP_TITLE (pnpm app restart) and open https://$NAME"

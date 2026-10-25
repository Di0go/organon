#!/usr/bin/env bash
# Makes the certificate for https://<hostname>, as the user (no root), in the app's state folder (.<name>/tls).
#
# The app gets its own certificate authority, and that authority carries nameConstraints, so it can only ever sign
# <hostname>, even if its key leaves this folder. Browsers trust it once setup-hostname.sh has added it to the
# system trust store (p11-kit).
#
#   bash node_modules/@organon/core/scripts/tls.sh <app root>
#
# Safe to run again: it keeps the authority (unless it was made for another name) and issues a fresh server
# certificate. Restart the app after. From Galen's scripts/tls.sh.
set -euo pipefail

SCRIPTS=$(cd "$(dirname "$0")" && pwd)
APP_ROOT=$(cd "${1:?Usage: tls.sh <app root>}" && pwd)
source "$SCRIPTS/app-json.sh"
state_var="${APP_PREFIX}_STATE_DIR"
tls_var="${APP_PREFIX}_TLS_DIR"
NAME=$APP_HOSTNAME
TLS="${!tls_var:-${!state_var:-$APP_ROOT/.$APP_NAME}/tls}"
mkdir -p "$TLS"
chmod 700 "$TLS"
cd "$TLS"

# The names an authority may sign for, one per line, exactly as openssl prints them.
permitted() {
  openssl x509 -in "$1" -noout -ext nameConstraints 2>/dev/null | sed -n '/Permitted:/,/Excluded:/{/DNS:\|IP:\|email:\|URI:\|DirName:/p}' | tr -d ' '
}

# An authority made for anything but $NAME alone is never used: it is made again.
if [[ -f ca.crt ]] && [[ "$(permitted ca.crt)" != "DNS:$NAME" ]]; then
  rm -f ca.crt ca.key ca.srl installed
fi

# The authority, made once: it may sign only certificates for $NAME, and nothing below it may sign at all.
if [[ ! -f ca.key ]]; then
  openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -keyout ca.key -out ca.crt \
    -subj "/CN=$APP_TITLE CA ($NAME only)" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "nameConstraints=critical,permitted;DNS:$NAME" 2>/dev/null
fi

# A fresh server certificate for $NAME, signed by the authority, then a check that it verifies.
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=$NAME" 2>/dev/null
cat > server.ext <<EXT
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:$NAME
EXT
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 825 -out server.crt -extfile server.ext 2>/dev/null
rm -f server.csr server.ext
chmod 600 ca.key server.key
openssl verify -CAfile ca.crt server.crt
echo "Certificate in $TLS. Browsers trust it after: pkexec bash $SCRIPTS/setup-hostname.sh $APP_ROOT"

#!/usr/bin/env bash
# Sourced by the core's other scripts: reads the app's app.json (at $APP_ROOT) into shell variables, with node, the one
# JSON reader every app machine has. APP_NAME, APP_TITLE, APP_HOSTNAME, APP_LOOPBACK, APP_PORT (live), APP_TLS_PORT.
NODE_BIN=${NODE_BIN:-$(command -v node || echo /usr/bin/node)}
eval "$("$NODE_BIN" -e '
  const j = JSON.parse(require("fs").readFileSync(process.argv[1] + "/app.json", "utf8"));
  const ok = (v, re) => { if (typeof v !== "string" || !re.test(v)) { console.error("app.json: bad value " + JSON.stringify(v)); process.exit(1); } return v; };
  const port = (p) => { if (!Number.isInteger(p) || p < 1024 || p > 65535) { console.error("app.json: bad port " + p); process.exit(1); } return p; };
  console.log([
    "APP_NAME=" + ok(j.name, /^[a-z][a-z0-9-]*$/),
    "APP_TITLE=\x27" + ok(j.title, /^[\w .-]+$/) + "\x27",
    "APP_HOSTNAME=" + ok(j.hostname, /^[a-z0-9-]+\.test$/),
    "APP_LOOPBACK=" + ok(j.loopback, /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/),
    "APP_PORT=" + port(j.ports.live),
    "APP_TLS_PORT=" + port(j.ports.tls),
  ].join("\n"));
' "$APP_ROOT")"
APP_PREFIX=$(echo "$APP_NAME" | tr 'a-z-' 'A-Z_')

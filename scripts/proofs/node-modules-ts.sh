#!/usr/bin/env bash
# Node strips types from a .ts file, but not under node_modules; through a symlink from outside, it does.
set -u
D=$(mktemp -d); trap 'rm -rf "$D"' EXIT
mkdir -p "$D/node_modules/lib" "$D/src"
echo 'export const x: number = 1;' > "$D/node_modules/lib/index.ts"
echo '{"name":"lib","type":"module","exports":"./index.ts"}' > "$D/node_modules/lib/package.json"
echo 'export const y: number = 2;' > "$D/src/index.ts"
echo '{"name":"lib2","type":"module","exports":"./index.ts"}' > "$D/src/package.json"
ln -s ../src "$D/node_modules/lib2"
echo '{"type":"module"}' > "$D/package.json"
echo 'import { x } from "lib"; console.log("inside node_modules:", x);' > "$D/a.ts"
echo 'import { y } from "lib2"; console.log("symlink from outside:", y);' > "$D/b.ts"
(cd "$D" && node a.ts 2>&1 | grep -o 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING' | head -1; node b.ts)

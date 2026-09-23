#!/bin/sh
# corruption.sh — REAL failure-mode probe for the QA chaos-corruption cell.
#
# WHY: sdk-typescript has no runtime state store (no *.db the tree references),
# so the generic chaos-corruption cell used to pick an unrelated *.db leftover,
# truncate it, and grade "OK" from a MODULE_NOT_FOUND toolchain refusal — a
# vacuous verdict that asserted nothing about SDK behavior (SDKTS-QA-H3-SDK-
# TYPESCRIPT-FOREMAN-7). This probe replaces that logic for this repo: it
# exercises a REAL SDK failure mode — a harness handler that THROWS.
#
# THE CONTRACT UNDER TEST (docs/integration.md in get-h3/h3, DF-H3-27):
#   createH3Router catches a thrown harness handler and returns HTTP 200 with a
#   synthesized end decision {decision:"end", end:{reason:"error"}} — the
#   documented masking contract. A panic never leaks to the wire as a 500.
#
# Exit-code contract (see README.md in this directory):
#   0 = contracted behavior observed (masking works as documented)
#   1 = SDK misbehavior (contract violated)
#   2 = environment gap, probe skipped (node/dist missing and unbuildable)
# Self-contained: uses only the repo's own dist/ + /tmp. Touches no board/state.
set -u

PROBE_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # <repo>/.qa
REPO_DIR="$(cd "$PROBE_DIR/.." && pwd)"

# ── locate the interpreter ──────────────────────────────────────────
if command -v node >/dev/null 2>&1; then
  NODE="$(command -v node)"
elif [ -x "$HOME/tools/node/bin/node" ]; then
  NODE="$HOME/tools/node/bin/node"
else
  echo "environment gap: no node interpreter on PATH and no ~/tools/node"
  exit 2
fi

# ── two FREE ports (echo harness + throwing harness), OS-assigned ──
# Fixed ports collide on shared hosts (EADDRINUSE observed on :9191) and a
# foreign squatter on the port would answer the health poll with someone
# else's server. Node's listen(0) picks genuinely free ephemeral ports.
FREE_PORTS="$("$NODE" -e '
const net = require("net");
const ports = [];
let pending = 2;
const pick = () => {
  const srv = net.createServer();
  srv.listen(0, "127.0.0.1", () => {
    ports.push(srv.address().port);
    srv.close(() => { if (--pending === 0) console.log(ports.join(" ")); });
  });
};
pick(); pick();
' 2>/dev/null)"
ECHO_PORT="$(printf '%s' "$FREE_PORTS" | awk '{print $1}')"
THROW_PORT="$(printf '%s' "$FREE_PORTS" | awk '{print $2}')"
[ -n "$ECHO_PORT" ] && [ -n "$THROW_PORT" ] || {
  echo "environment gap: could not allocate free local ports"
  exit 2
}

# ── the compiled example harness (dist/examples/echo.js) ────────────
ECHO_JS="$REPO_DIR/dist/examples/echo.js"
if [ ! -f "$ECHO_JS" ]; then
  echo "dist/ missing — building via npm run build (this is the repo's own tsc build)"
  if (cd "$REPO_DIR" && npm run build >/tmp/h3qa-probe-build.log 2>&1); then :; else
    echo "environment gap: dist/ missing and npm run build failed"
    tail -3 /tmp/h3qa-probe-build.log 2>/dev/null
    exit 2
  fi
fi
[ -f "$ECHO_JS" ] || { echo "environment gap: dist/examples/echo.js still absent after build"; exit 2; }

# ── start the example harness on a free port ────────────────────────
(cd "$REPO_DIR" && PORT="$ECHO_PORT" "$NODE" "$ECHO_JS" >/tmp/h3qa-probe-echo.log 2>&1
) &
ECHO_PID=$!
cleanup() { kill $ECHO_PID ${THROW_PID:-} 2>/dev/null; wait $ECHO_PID ${THROW_PID:-} 2>/dev/null; rm -f "$PROBE_DIR/chaos-probes/.tmp-throwing-harness.mjs"; }
trap cleanup EXIT INT TERM

# poll for readiness (10s × 0.5s)
READY=0
i=0
while [ "$i" -lt 20 ]; do
  C="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$ECHO_PORT/v1/health" 2>/dev/null)"
  [ "$C" = "200" ] && { READY=1; break; }
  sleep 0.5
  i=$((i + 1))
done
if [ "$READY" != 1 ]; then
  echo "environment gap: example harness never answered /v1/health on :$ECHO_PORT"
  tail -3 /tmp/h3qa-probe-echo.log 2>/dev/null
  exit 2
fi

# ── a tiny ESM harness whose onProcess THROWS ───────────────────────
# It imports the compiled SDK from the repo's own dist/ (no npm install of
# @get-h3/h3-harness-sdk needed — the repo IS the package). The file MUST live
# under the repo tree (NOT /tmp): node resolves bare specifiers (`hono`) and
# the relative `./dist/index.js` against the FILE's directory, never the cwd.
cat > "$PROBE_DIR/chaos-probes/.tmp-throwing-harness.mjs" <<'EOF'
import { Hono } from "hono";
import { createH3Router } from "../../dist/index.js";
import { serve } from "@hono/node-server";

const throwingHarness = {
  async onProcess() {
    throw new Error("probe: handler exploded");
  },
  async onResult() {
    return {
      decision: "end",
      decision_id: "probe-result-id",
      history: [],
      end: { reason: "task_complete" },
    };
  },
  health() {
    return {
      status: "ok",
      version: "0.1.0",
      transport: "rest",
      protocol_version: "1.0",
      capabilities: ["text", "end"],
    };
  },
};

const app = new Hono();
app.route("/", createH3Router(throwingHarness));
serve({ fetch: app.fetch, port: Number(process.env.PORT) }, (info) => {
  console.log(`throwing harness on :${info.port}`);
});
EOF

(cd "$REPO_DIR" && PORT="$THROW_PORT" "$NODE" "$PROBE_DIR/chaos-probes/.tmp-throwing-harness.mjs" \
      >/tmp/h3qa-probe-throw.log 2>&1
) &
THROW_PID=$!

READY2=0
i=0
while [ "$i" -lt 20 ]; do
  C="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$THROW_PORT/v1/health" 2>/dev/null)"
  [ "$C" = "200" ] && { READY2=1; break; }
  sleep 0.5
  i=$((i + 1))
done
if [ "$READY2" != 1 ]; then
  echo "environment gap: throwing-harness probe server never came up on :$THROW_PORT"
  tail -3 /tmp/h3qa-probe-throw.log 2>/dev/null
  exit 2
fi

# ── hit /v1/process on the THROWING harness and grade the contract ──
BODY='{"session_id":"probe-corrupt-1","message":{"content":"hello"},"identity":{"platform":"probe","chat_id":"c1"},"context":{"config":{},"session_state":{}}}'
HTTP_CODE="$(curl -s -o /tmp/h3qa-probe-body.json -w '%{http_code}' \
  -X POST -H 'Content-Type: application/json' -d "$BODY" \
  "http://127.0.0.1:$THROW_PORT/v1/process")"
REASON="$("$NODE" -e 'try{const b=JSON.parse(require("fs").readFileSync("/tmp/h3qa-probe-body.json","utf8"));console.log((b.decision==="end"&&b.end&&b.end.reason)||"NO-END-REASON")}catch(e){console.log("UNPARSEABLE-BODY")}' 2>/dev/null)"
echo "observed: POST /v1/process on a THROWN handler -> HTTP $HTTP_CODE, end.reason=$REASON"

if [ "$HTTP_CODE" = "200" ] && [ "$REASON" = "error" ]; then
  echo "PASS: masking contract honored — handler throw synthesized HTTP 200 end(reason=error)"
  exit 0
elif [ "$HTTP_CODE" = "500" ]; then
  echo "FAIL: SDK misbehavior — a thrown harness handler leaked a 500 instead of the documented masked end(error) 200"
  cat /tmp/h3qa-probe-body.json 2>/dev/null
  exit 1
else
  echo "FAIL: SDK misbehavior — HTTP $HTTP_CODE / reason=$REASON does not match the masked end(error) 200 contract"
  cat /tmp/h3qa-probe-body.json 2>/dev/null
  exit 1
fi
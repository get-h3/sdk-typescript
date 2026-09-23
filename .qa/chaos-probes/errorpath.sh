#!/bin/sh
# errorpath.sh — REAL failure-mode probe for the QA chaos-errorpath cell.
#
# WHY: the generic chaos-errorpath cell runs the project's BIN with missing
# config. For sdk-typescript, BIN detection yields bare `node src/index.js`
# (the file does not exist — the SDK is a library) and the probe graded "OK:
# clean error (rc=1)" off a MODULE_NOT_FOUND toolchain refusal — vacuous,
# asserting nothing about SDK behavior (SDKTS-QA-H3-SDK-TYPESCRIPT-FOREMAN-7).
# This probe replaces that logic for this repo: it exercises the SDK's REAL
# error paths.
#
# CONTRACTS UNDER TEST (src/harness.ts + README "Errors" section):
#   1. An invalid decision payload from a harness (violates DecisionSchema) is
#      rejected with a controlled errorResponse — HTTP 500, error.code
#      INVALID_DECISION, message carrying the "Invalid decision from harness"
#      signature (GAP-033; README: "A harness returning a malformed Decision
#      ... yields 500 with error code INVALID_DECISION"). The router defends
#      the wire, not the caller's bug — and SURVIVES the rejection.
#   2. A malformed REQUEST body (violates ProcessRequestSchema) is rejected
#      with a 400-class errorResponse ("Invalid request").
# Both are clean, controlled rejections — never a panic or uncaught crash.
#
# Exit-code contract (see README.md in this directory):
#   0 = contracted behavior observed (both rejections are clean)
#   1 = SDK misbehavior (a contract was violated)
#   2 = environment gap, probe skipped (node/dist missing and unbuildable)
# Self-contained: uses only the repo's own dist/ + /tmp. Touches no board/state.
set -u

PROBE_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # <repo>/.qa
REPO_DIR="$(cd "$PROBE_DIR/.." && pwd)"

if command -v node >/dev/null 2>&1; then
  NODE="$(command -v node)"
elif [ -x "$HOME/tools/node/bin/node" ]; then
  NODE="$HOME/tools/node/bin/node"
else
  echo "environment gap: no node interpreter on PATH and no ~/tools/node"
  exit 2
fi

# ── two FREE ports (echo harness + invalid-decision harness) ────────
# Fixed ports collide on shared hosts (EADDRINUSE observed on :9191) and a
# foreign squatter would answer the health poll with someone else's server.
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
INV_PORT="$(printf '%s' "$FREE_PORTS" | awk '{print $2}')"
[ -n "$ECHO_PORT" ] && [ -n "$INV_PORT" ] || {
  echo "environment gap: could not allocate free local ports"
  exit 2
}

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

RC=0

# ── PATH 1: invalid decision payload from the harness ───────────────
# A harness whose onProcess returns something DecisionSchema rejects. The
# router must answer a controlled "Invalid decision from harness" rejection,
# NOT crash and NOT pass the malformed decision through. The file MUST live
# under the repo tree (NOT /tmp): node resolves bare specifiers (`hono`) and
# the relative `../../dist/index.js` against the FILE's directory.
cat > "$PROBE_DIR/chaos-probes/.tmp-invalid-decision.mjs" <<'EOF'
import { Hono } from "hono";
import { createH3Router } from "../../dist/index.js";
import { serve } from "@hono/node-server";

const badHarness = {
  async onProcess() {
    // Violates DecisionSchema: no "decision" discriminator, no payload body.
    return { hello: "not a decision" };
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
app.route("/", createH3Router(badHarness));
serve({ fetch: app.fetch, port: Number(process.env.PORT) }, (info) => {
  console.log(`invalid-decision harness on :${info.port}`);
});
EOF

(cd "$REPO_DIR" && PORT="$INV_PORT" "$NODE" "$PROBE_DIR/chaos-probes/.tmp-invalid-decision.mjs" \
      >/tmp/h3qa-probe-invalidd.log 2>&1
) &
INV_PID=$!
cleanup() { kill $INV_PID ${ECHO_PID2:-} 2>/dev/null; wait $INV_PID ${ECHO_PID2:-} 2>/dev/null; rm -f "$PROBE_DIR/chaos-probes/.tmp-invalid-decision.mjs"; }
trap cleanup EXIT INT TERM

READY=0
i=0
while [ "$i" -lt 20 ]; do
  C="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$INV_PORT/v1/health" 2>/dev/null)"
  [ "$C" = "200" ] && { READY=1; break; }
  sleep 0.5
  i=$((i + 1))
done
if [ "$READY" != 1 ]; then
  echo "environment gap: invalid-decision probe server never came up on :$INV_PORT"
  tail -3 /tmp/h3qa-probe-invalidd.log 2>/dev/null
  exit 2
fi

BODY='{"session_id":"probe-err-1","message":{"content":"hello"},"identity":{"platform":"probe","chat_id":"c1"},"context":{"config":{},"session_state":{}}}'
HTTP_CODE="$(curl -s -o /tmp/h3qa-probe-invalid-body.json -w '%{http_code}' \
  -X POST -H 'Content-Type: application/json' -d "$BODY" \
  "http://127.0.0.1:$INV_PORT/v1/process")"
MSG="$("$NODE" -e 'try{const b=JSON.parse(require("fs").readFileSync("/tmp/h3qa-probe-invalid-body.json","utf8"));console.log(b.error&&b.error.code?b.error.code:"NO-ERROR-CODE");console.log(b.error&&b.error.message?b.error.message:"NO-ERROR-MSG")}catch(e){console.log("UNPARSEABLE-BODY");console.log("UNPARSEABLE-BODY")}' 2>/dev/null)"
ERR_CODE="$(printf '%s' "$MSG" | sed -n '1p')"
ERR_MSG="$(printf '%s' "$MSG" | sed -n '2p')"
echo "observed: POST /v1/process with an INVALID DECISION payload -> HTTP $HTTP_CODE, code=$ERR_CODE, msg=\"$ERR_MSG\""

case "$HTTP_CODE" in
  500) : ;;
  *) echo "FAIL: SDK misbehavior — an invalid harness decision was not rejected with the documented HTTP 500 INVALID_DECISION (got HTTP $HTTP_CODE)"; cat /tmp/h3qa-probe-invalid-body.json 2>/dev/null; RC=1 ;;
esac
case "$ERR_CODE" in
  "INVALID_DECISION") : ;;
  *) echo "FAIL: SDK misbehavior — the invalid-decision rejection does not carry error.code=INVALID_DECISION (got: $ERR_CODE)"; RC=1 ;;
esac
case "$ERR_MSG" in
  "Invalid decision from harness"*) : ;;
  *) echo "FAIL: SDK misbehavior — the invalid-decision rejection message does not carry the 'Invalid decision from harness' signature (got: $ERR_MSG)"; RC=1 ;;
esac
# The router must SURVIVE the rejection — a follow-up request still answers.
ALIVE_CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$INV_PORT/v1/health" 2>/dev/null)"
case "$ALIVE_CODE" in
  200) echo "observed: router SURVIVED the invalid-decision rejection (health -> 200 after the 500)" ;;
  *) echo "FAIL: SDK misbehavior — router did not survive the invalid-decision rejection (follow-up health -> $ALIVE_CODE)"; RC=1 ;;
esac

# ── PATH 2: malformed request body against the VALID example harness ─
(cd "$REPO_DIR" && PORT="$ECHO_PORT" "$NODE" "$ECHO_JS" >/tmp/h3qa-probe-echo2.log 2>&1
) &
ECHO_PID2=$!
j=0
while [ "$j" -lt 20 ]; do
  C="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$ECHO_PORT/v1/health" 2>/dev/null)"
  [ "$C" = "200" ] && break
  sleep 0.5
  j=$((j + 1))
done

if curl -s -o /dev/null "http://127.0.0.1:$ECHO_PORT/v1/health" 2>/dev/null; then
  BAD_CODE="$(curl -s -o /tmp/h3qa-probe-badreq-body.json -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' -d '{"nonsense":true}' \
    "http://127.0.0.1:$ECHO_PORT/v1/process")"
  echo "observed: POST /v1/process with a MALFORMED REQUEST body -> HTTP $BAD_CODE"
  case "$BAD_CODE" in
    400|422) echo "PASS: malformed request rejected with a clean 400-class error" ;;
    *) echo "FAIL: SDK misbehavior — a malformed request body was not rejected with a 400-class error (HTTP $BAD_CODE)"; cat /tmp/h3qa-probe-badreq-body.json 2>/dev/null; RC=1 ;;
  esac
else
  echo "environment gap: could not reach the echo harness on :$ECHO_PORT — malformed-request leg skipped"
fi

if [ "$RC" -eq 0 ]; then
  echo "PASS: both error paths are clean controlled rejections (no crash, no panic)"
fi
exit "$RC"
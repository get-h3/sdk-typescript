# Dogfood Integration — h3-sdk-typescript (2026-09-19)

Verdict: ✅ SHIPPABLE. Third consecutive real-use run; this one re-verified the
GAP-050..053 fixes live and completed the bunker install leg that was SKIPPED on
09-06 (disk-full).

## Promise
"npm install github:get-h3/sdk-typescript → implement Harness → serve → 46/46
compliant." Verified again over HTTP (fresh consumer, port 9521), via MockHermes,
and on a fresh bunker agent (b49993ab, las-bunker-03).

## What a fresh consumer experiences (time-to-first-success ~15 min)
1. `npm install github:get-h3/sdk-typescript` — 7s, works (prepare builds dist/).
2. Implement `Harness` + `createH3Router`. Two traps hit in 2026-09-19:
   - The Quickstart example's `SessionContext` shape does not match the wire
     schema: real request is `{session_id, message: {role, content}, identity,
     context{...}}` — there is no `ctx.turn`. Battery passes only after reading
     `src/examples/echo.ts` (source read = docs gap, GAP-056).
   - tsx does NOT typecheck: a decision with the pre-GAP-033 tool shape
     (`{call_id, name, arguments}`) passes TS on import and fails at runtime with
     `500 INVALID_DECISION` (clean Zod message). Consumers without
     `strict` tsc learn the wire shape from runtime errors, not the compiler.
3. h3-test: 46/46 first full pass once the partial-turn trigger phrases from the
   README's "Partial turns" section are handled (`do not finish`, `start a
   thought`, trailing `...`).

## Lifecycle verified live (all documented behavior confirmed)
- POST /v1/process: text (finished true/false), tool_call {name, params}.
- POST /v1/result on unknown session → 404 SESSION_NOT_FOUND (GAP-051 FIXED;
  previously 200 auto-vivify).
- turn_count = 3 after process+tool_call+result round-trips (double-increment
  gone, GAP-051 fix).
- DELETE /v1/sessions/:id then GET → 404 (GAP-050 FIXED; session actually
  removed, no ghost 200).
- POST /v1/cancel with reason=user_interrupt → {cancelled:true}; session status
  flips to `cancelled`, and a later /v1/result does NOT transition it to
  `completed` (docs promise holds).
- Minimal /v1/process without `context` → 400 with precise Zod paths
  (context.config, context.session_state). README Defaults paragraph documents
  this (GAP-036 fix) — but the error message is the real teacher for new users.
- GET /v1/health under repeat load: sub-ms.
- MockHermes testbed: 3 vitest unit tests green; API is
  `sendMessage(content, sessionId)` / `sendResult(payload, ...)` / `cancel()`
  (mind the session-state footgun documented in README).

## Bunker install leg (las-bunker-03, agent b49993ab, destroyed after)
- Fresh Debian agent, node 22.23.2 preinstalled.
- `git clone https://github.com/get-h3/sdk-typescript` → HEAD 0cc31c1. OK.
- Documented install `npm ci && npm run build`: 10 seconds, zero friction.
- Delivered example serves: `node dist/examples/echo.js` (PORT env override).
- Battery against it from a scratch venv install of get-h3/shim: 46/46.
- Friction: `pip install --user get-h3/shim` on the bunker is PEP-668-blocked
  (externally-managed environment); a venv is required. The shim README's
  `pip install -e .` path does not mention this. Filed against get-h3/shim.

## Verdict
✅ SHIPPABLE — every documented entry point (GitHub install, source build,
delivered example, MockHermes) worked; both P0/P1 fixes from 09-06 hold in real
use; the clean-machine install proof that was missing on 09-06 now exists.
Remaining friction is documentation-shape (GAP-056), not functionality.

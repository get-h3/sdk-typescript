# Dogfood Integration — 2026-09-06 (h3-sdk-typescript, run #4)

**Verdict: 🟡 PROMISING-BUT-ROUGH** — the closest run to SHIPPABLE yet, held
back by one real contract bug (DELETE doesn't delete) and one consistency
break (result auto-vivifies sessions).

## Promise vs reality

- **Promise:** "npm install github:get-h3/sdk-typescript → implement
  `Harness` → wire `createH3Router` into Hono → serve → 46/46 h3-test
  compliant, with Zod-validated wire shapes and a MockHermes testbed."
- **Reality:** HOLDS. A fresh consumer (standup-assistant bot with partial
  turns, history echo, a real tool_call roundtrip, identity greeting) went
  from `npm init` to **46/46 battery, first try, 0.20s** (~10 min including
  reading docs). The router is solid on the paths the battery covers. Two
  session-lifecycle bugs live exactly where it doesn't look.

## What I built (real use, not test scripts)

`/tmp/dogfood-h3-ts-2026-09-06/standup-bot.ts` — a team standup assistant:

- greets by `identity.platform`/`user_name` (telegram/web)
- echoes `context.history` (battery: history preserved)
- partial turns: trailing `...` → `finished: false`
- one real **tool_call** decision: `status <member>` → `fetch_blockers`
  params, then `onResult` summarizes and ends the turn
- health with live `uptime_seconds` + capabilities

Verified through three independent consumers:

1. **Served over HTTP** (`@hono/node-server`, :9191) — battery 46/46, p50
   0.96ms / p95 30.9ms, then a 9-step curl lifecycle (greeting → partial →
   tool_call → result → session status → cancel → status-after-cancel →
   DELETE → GET).
2. **MockHermes in-process** — same conversation, `sendMessage` /
   `sendResult` / `cancel` with a threaded session id.
3. **Fresh `node:22-bookworm` container** (no npm cache, no checkout):
   `npm install github:get-h3/sdk-typescript` → minimal harness via
   `app.fetch` → health 200 + process 200 `decision=text`. This is the
   clean-machine install proof for this run (bunker was down, see below).

## Evidence timeline

| Step | Result |
|---|---|
| `npm install github:get-h3/sdk-typescript` (local scratch) | ✅ 6.7s, 0 vulnerabilities, `prepare` built dist/ |
| first `tsc -p` (strict, NodeNext, skipLibCheck off) | ❌→✅ 4 errors, all README-warned (see GAP-053 + GAP-038) |
| `h3-test --endpoint http://localhost:9191` | ✅ **46/46, 0.20s** (first try) |
| curl lifecycle (with required `config:{}`) | ✅ 9/9 steps behaved as documented |
| DELETE-then-GET | ❌ **GET still 200 — session never removed** (GAP-050) |
| result to never-created session | ❌ **200, no error** — other 4 endpoints 404 (GAP-051) |
| `identity` without `chat_id` | ❌ 400, error path-pins `["identity","chat_id"]` (GAP-052) |
| fresh container smoke | ✅ install→health→process all green |

## Findings (filed as board tasks this run)

1. **GAP-050 (P0)** — `DELETE /v1/sessions/:id` returns
   `{"terminated":true}` but never removes the session; GET afterwards
   returns 200 with the full payload, and a second DELETE re-fires
   `onSessionTerminate`. Router source: the DELETE handler never calls
   `sessions.delete()`. The 46-test battery never does GET-after-DELETE —
   this is the "all tests green, contract broken" L3 pattern again.
2. **GAP-051 (P1)** — `POST /v1/result` on a never-created session returns
   200 + Decision (the handler's `if (existing)` guard can't distinguish
   "never created" from "exists"), while process/cancel/GET/DELETE all 404.
   Documented 404-consistency holds for everything except result. Also:
   SDK-side `turn_count` increments twice per tool_call roundtrip (verified
   live: 4 after 3 process + 1 result).
3. **GAP-052 (P2)** — `identity.chat_id` is required on the wire
   (400 without it, path-pinned error) but the README never lists it as
   required; only `user_name`/`user_id` defaults are documented.
4. **GAP-053 (P2)** — the TS `Decision` type requires `history: []` even
   though the runtime Zod schema defaults it to `[]` (`z.array(...).default([])`)
   — every Decision literal in every harness carries boilerplate the schema
   doesn't need. Type and schema should agree (or the README should say why).

## Ephemeral-bunker install leg — SKIPPED (host disk full)

- `bunker3` (100.69.3.13) reachable, bunkerd **active**, Docker 26.1.5 —
  but `bunker spawn --ttl 2h` **failed: "No space left on device"** while
  untarring rootless docker.
- Host root filesystem is **100% full** (221G, 0 available). `/home` holds
  **269 stale `bunker-*` agent users** (only 570M total — stale users are
  NOT the space hog); docker 1.3G, logs 2.7G, /tmp 16G. The remaining ~190G
  needs root-level forensics on the box — out of scope for a dogfood run
  (no destructive cleanup on a shared fleet host).
- No half-spawned agent was left behind (`bunker list` empty before and
  after; newest /home entry predates my spawn).
- **Fallback executed:** fresh `node:22-bookworm` Docker container on the
  control host as the clean-machine install proof (install → smoke, above).
- Trigger for infra follow-up: `SKIPPED-install-bunker — spawn failed:
  tar: No space left on device (host / at 100%, 221G)`.

## Artifacts left in the repo

- `docs/dogfood/2026-09-06-integration.md` (this file)
- `docs/dogfood/diagnostics.md` — 2026-09-06 section appended
- `skills/h3-sdk-typescript-usage/SKILL.md` — v1.3.0 (stale GAP-033/037
  claims corrected; GAP-050..053 pitfalls added)
- Board: GAP-050..053 rows + `task_created` events (323–326), parity checked
- `.coding-hermes/dogfood-log.md` — run #4 entry

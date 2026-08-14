# Dogfood Integration Report — 2026-08-14

**Project:** `@get-h3/h3-harness-sdk` (get-h3/sdk-typescript)
**Verdict:** 🟡 PROMISING-BUT-ROUGH (close to SHIPPABLE — happy path proven, two real traps remain)
**Run type:** Library consumer — fresh project in `/tmp/dogfood-h3-ts-2026-08-14`, installed via the documented
GitHub route, built a from-scratch **tool-calling calculator harness**, served it, ran the full HTTP lifecycle,
MockHermes, and the official `h3-test` battery (44/44).

## The promise (null hypothesis)

> `npm install github:get-h3/sdk-typescript` → implement the `Harness` interface → `createH3Router()` →
> serve on :9191 → **44/44 h3-test compliant**. (npm route once published — GAP-001.)

**Reality: the promise HOLDS.** Install worked first try (7s), the Quickstart pattern compiled and ran, and a
harness I wrote from scratch (not the repo's echo) passed 44/44 in 0.23s. This is a big step up from the
2026-08-04 run (where every install route failed and the Quickstart was copy-paste broken).

## What I built (the working consumer)

A **calculator assistant**: `calc 2+3*4` → `tool_call` decision (calculator tool) → tool result via `/v1/result`
→ final text `2+3*4 = 14`. Plus partial-turn handling (`finished:false` on "start a thought..."/trailing "...")
so the battery's `process_text_finished_false` region passes. Full source mirrored in the repo skill:
`skills/h3-sdk-typescript-usage/SKILL.md`.

## Install — what actually works (2026-08-14)

| Path | Result |
|---|---|
| `npm install @get-h3/h3-harness-sdk` | ❌ E404 — still not published (GAP-001, open; README now carries the caveat) |
| `npm install github:get-h3/sdk-typescript` | ✅ **WORKS — 7.4s**, `prepare` script builds `dist/`; all 40 exports load (GAP-002 fixed) |
| local checkout install | ✅ (same as before) |
| `npm pack` | ✅ clean tarball: `dist/` + README + LICENSE — publishable when creds exist |

## Time-to-first-success

**~8 minutes** (install 7s → harness ~5 min → MockHermes pass → serve → battery 44/44). Friction count: **6**
(all documented as GAP-033..038). Compare 2026-08-04: ~25 min with 3 blocking install/quickstart failures.

## Verified working (evidence)

- `GET /v1/health` → `{status:ok, version, transport, protocol_version, capabilities}` ✅
- `POST /v1/process` full flow → `tool_call {name:'calculator', params:{expression}}` ✅
- `POST /v1/result` → `text {content:'2+3*4 = 14', finished:true}` ✅
- `POST /v1/cancel` on real session → `{session_id, cancelled:true}` ✅
- `GET /v1/sessions/:id` → full SessionResponse (turn_count, current_decision_type...) ✅
- Invalid JSON → 400 `INVALID_REQUEST` with readable message ✅
- `MockHermes`: sendMessage → sendResult → cancel, one sessionId threaded ✅
- `h3-test`: **44/44 PASSED**, 0.23s, p50 1.02ms ✅

## The two traps (what a new user WILL hit)

### Trap 1 — the repo's own integration doc teaches a shape the SDK rejects (GAP-034)
`docs/dogfood/2026-08-04-integration.md` shows `tool_call: { tool_name, arguments, call_id }`. Current
`ToolCallSchema` is `{ name, params, reasoning? }` (changed in `b75e01a`, and the battery checks `tc['name']`).
- **TS consumer:** compile error `'tool_name' does not exist in type '{ name: string; params: ... }'` — the types
  save you, but the doc misleads.
- **JS/tsx consumer:** runs, returns a tool_call with no `name` → real Hermes cannot execute it. **Silently.**
  Because...

### Trap 2 — the router never validates decisions (GAP-033)
`DecisionSchema` is imported in `src/harness.ts` but only re-exported — there is **no `safeParse` on
`onProcess`/`onResult` output**. Verified: the old-shape harness above got HTTP 200 with its malformed tool_call
passed through verbatim. The README-documented `INVALID_DECISION` error code is **unreachable**. A harness that
returns garbage decisions gets a green battery (the tool_call battery tests are optional) and breaks in real use.

### Trap 3 — required-vs-defaulted request fields (GAP-036)
README says "Defaults: ... config.max_iterations = 100; session_state counters = 0" — but `identity`, `context`,
`context.config` and `context.session_state` are **required objects**. A minimal body (as the Defaults sentence
implies is OK) → 400 with a wall of raw Zod JSON. The battery always sends `config:{}`/`session_state:{}`, which
is why tests never caught it.

## Errors hit during the run (and the fix)

| Error | Cause | Fix |
|---|---|---|
| `400 INVALID_REQUEST: expected object at context.config / context.session_state` | omitted required objects | send `"config":{}, "session_state":{}` (GAP-036 to clarify README) |
| TS `'tool_name' does not exist in type '{name, params}'` | followed stale 08-04 doc | use `{name, params}` (GAP-034 to fix the doc) |
| `Cannot find name 'node:http'/'Buffer'` | tsc consumer missing `@types/node` | `npm i -D @types/node` (GAP-038 to document) |
| `SESSION_NOT_FOUND` on cancel after failed process | process 400'd, session never created | expected behavior; confusing only because of GAP-036 |

## Priority order for the maintainer (if you had 1 hour)

1. **GAP-033 (P0):** validate decisions in the router — 20 min, closes the silent-corruption hole.
2. **GAP-034 (P1):** fix the 08-04 integration doc + skill references — 10 min, stops teaching the old shape.
3. **GAP-035 (P1):** add a `tool_call` decision example to README Wire Shapes — 10 min, the missing reference.
4. **GAP-036 (P1):** clarify the Defaults paragraph — 5 min.
5. GAP-037/038 (P2) — session-DELETE semantics, @types/node note.

# Dogfood Integration Report — 2026-08-22

**Project:** `@get-h3/h3-harness-sdk` (get-h3/sdk-typescript)
**Verdict:** 🟢 SHIPPABLE — all three traps from the 2026-08-14 run (GAP-033/034/036) are CLOSED and proven live; the happy path is fully green. Remaining blocker is distribution-only (GAP-001 npm publish).
**Run type:** Library consumer — fresh project in `/tmp/dogfood-h3-ts-2026-08-22`, installed via the documented GitHub route, built a from-scratch **tool-calling calculator harness**, served it, ran the full HTTP lifecycle, MockHermes, and the official `h3-test` battery (44/44).

## The promise (null hypothesis)

> `npm install github:get-h3/sdk-typescript` → implement the `Harness` interface → `createH3Router()` →
> serve on :9191 → **44/44 h3-test compliant**. (npm route once published — GAP-001.)

**Reality: the promise HOLDS, cleanly.** Install worked first try (7.5s), the `prepare` script built `dist/`, all 40 exports load, the from-scratch calculator harness passed the full lifecycle AND the battery 44/44 in 0.18s. The three traps that made the last report "PROMISING-BUT-ROUGH" are all fixed in the shipped package — each verified live against the GitHub-installed build (details below). This is the first post-fix record; it supersedes the 2026-08-14 verdict.

## What I built (the working consumer)

A **calculator assistant**: `calc 2+3*4` → `tool_call {name:'calculator', params:{expression}}` → tool result via `/v1/result` → final text `2+3*4 = 14`. Plus partial-turn handling (`finished:false` on "start a thought..."/trailing "...") so the battery's `process_text_finished_false` region passes. The expression evaluator is a from-scratch recursive-descent parser (digits, `+ - * / ( )` only — no `eval`). Full sources: `/tmp/dogfood-h3-ts-2026-08-22/{harness,server,stale-harness,mockhermes-check}.mjs`.

## Install — what actually works (2026-08-22)

| Path | Result |
|---|---|
| `npm install @get-h3/h3-harness-sdk` | ❌ E404 — still not published (GAP-001, open; README carries the caveat) |
| `npm install github:get-h3/sdk-typescript` | ✅ **WORKS — 7.45s**, `prepare` builds `dist/`; all 40 exports load; `dist/examples/echo.js` imports cleanly |
| local checkout install | ✅ (same as before) |

Installed package: `version 0.1.0`, `main: dist/index.js`, `type: module` (ESM-only, as documented).

## Time-to-first-success

**~5 minutes** (install 7.5s → harness ~3 min → lifecycle + MockHermes → serve → battery 44/44). Friction count: **0** product defects hit (one consumer-side stumble: `MockHermes` takes the harness in its constructor — documented in its docstring, not a defect). Compare 2026-08-14: ~8 min / 6 frictions; 2026-08-04: ~25 min / 3 blocking install failures.

## Verified working (evidence checklist — every line is a command I ran)

- `npm install github:get-h3/sdk-typescript hono @hono/node-server` → 7.454s, `found 0 vulnerabilities` ✅
- 40 exports load from `@get-h3/h3-harness-sdk` (incl. `createH3Router`, `MockHermes`, all Zod schemas) ✅
- `GET /v1/health` → `{status:ok, version:0.1.0, transport:rest, protocol_version:1.0, capabilities:[text,tool_call,end]}` ✅
- `POST /v1/process` full flow → `tool_call {name:'calculator', params:{expression:'2+3*4'}}` ✅ (correct GAP-034 shape)
- `POST /v1/result` → `text {content:'2+3*4 = 14', finished:true}` ✅
- `GET /v1/sessions/:id` → full `SessionResponse` (`turn_count:1`, `current_decision_type:tool_call`, `status:active`) ✅
- `POST /v1/cancel` on real session → `{session_id, cancelled:true}` ✅
- Invalid JSON → 400 `INVALID_REQUEST` with readable message ✅
- `MockHermes`: `sendMessage` → `sendResult` → `cancel`; harness observed the SAME `session_id` on both process and result calls — one sessionId threaded ✅
- `h3-test`: **44/44 PASSED**, exit 0, 0.18s, p50 0.92ms / p95 23.88ms ✅

## Trap closeouts (the 2026-08-14 blockers — all closed, proven live)

### GAP-033 — CLOSED: router now validates decisions (`safeParse` → 500 `INVALID_DECISION`)

The installed `dist/harness.js` runs `DecisionSchema.safeParse()` on both `onProcess` (line 76) and `onResult` (line 113) output and returns `errorResponse(..., 500, ..., "INVALID_DECISION")` on failure. **Live proof:** I served a second harness (`stale-harness.mjs` on :9192) that returns the OBSOLETE pre-fix shape (`tool_name`/`arguments`/`call_id` — exactly what the 08-04 doc taught):

```
$ curl -X POST :9192/v1/process -d '{...old-shape harness...}'
HTTP 500
{"error":{"code":"INVALID_DECISION","message":"Invalid decision from harness: tool_call.name: Invalid input: expected string, received undefined; tool_call.params: Invalid input: expected record, received undefined"}}
```

Previously (08-14): same harness got **HTTP 200 with the malformed tool_call passed through verbatim** — the silent-corruption hole is gone. Bonus: the error message names the exact broken fields.

### GAP-034 — CLOSED: docs teach the correct `ToolCall` shape `{name, params, reasoning?}`

- README "Wire Shapes" now shows `tool_call: { "name": "read_file", "params": {...}, "reasoning": "..." }` — no `tool_name`/`arguments`/`call_id` anywhere.
- Installed `ToolCallSchema` = `{name (req), params (req), reasoning (opt)}` — matches the doc.
- The battery enforces it: `test_battery.py` `test_3_2_decision_tool_call_valid_name` fails with `"tool_call decision missing 'name'"` when `tc['name']` is absent.
- **Live proof:** my harness used `{name:'calculator', params:{expression}}` and passed 44/44; the 08-04-doc shape was rejected by the router (see GAP-033's 500 — the exact error a JS consumer gets today instead of a silent pass-through).

### GAP-036 — CLOSED: README Defaults paragraph now matches reality

- README now states (process section): "`identity`, `context`, `context.config` and `context.session_state` are **required objects**. In other words: **config and session_state are required** — omitting them (or `identity`/`context` themselves) returns `400`. Only their inner fields default: `message.role` = `"user"`; `identity.user_name`/`user_id` = `"unknown"`; `context.history`/`tools`/`models` = `[]`; `config.max_iterations` = `100`, `config.timeout_seconds` = `60`; `session_state` counters = `0`."
- **Live proof:** minimal body `{session_id, message}` → **HTTP 400 `INVALID_REQUEST`** listing exactly the two missing required objects (`identity`, `context`) with readable Zod detail — no more "wall of raw Zod JSON" and no contradiction with the docs.

## Errors hit during the run

| Error | Cause | Status |
|---|---|---|
| `HTTP 500 INVALID_DECISION` on :9192 | harness deliberately returned the obsolete tool_call shape | **EXPECTED** — this IS the GAP-033 fix (was 200 pass-through on 08-14) |
| `HTTP 400 INVALID_REQUEST: expected object at identity / context` on minimal body | omitted required objects | **EXPECTED** — documented behavior per the clarified README (GAP-036) |
| `TypeError: Cannot read properties of undefined (reading 'onProcess')` in my MockHermes script | consumer error — `MockHermes` constructor takes the harness (`new MockHermes(myHarness)`) | consumer-side, documented in the testbed docstring; not a product defect |

No unexpected errors. No SDK source changes were needed or made.

## Priority notes for the maintainer

1. **GAP-001 (P0, the only open blocker to SHIPPABLE-as-published):** publish to npm — the GitHub route is solid, the tarball is clean, the SDK is compliant; `npm install @get-h3/h3-harness-sdk` 404s today.
2. **GAP-005 (minor DX):** consider having `MockHermes.cancel()` return `{session_id, cancelled}` for symmetry with the HTTP response — currently it returns the harness's raw `onCancel` value (`true`), which is fine but asymmetric.
3. No new gaps found. The 08-14 friction list (GAP-033..038) is fully resolved; battery exit code 0 with 44/44 across all 6 categories.

## Verdict evidence

- **Works:** yes — install → harness → full lifecycle → 44/44 compliance, all from a fresh consumer project via the documented GitHub route.
- **Useful:** yes — H3 compliance is a real, testable gate; MockHermes testbed works; structured errors name the exact broken field.
- **Usable:** yes for a fresh user via the GitHub route — Quickstart pattern compiles/runs as documented, wire shapes in the README match the schemas, required-vs-defaulted fields are explicit. Time-to-first-success ~5 min, zero product friction.
- **Trustworthy:** yes — 44/44 battery, 40/40 exports, strict Zod validation on requests AND decisions (GAP-033), fast (p50 0.92ms).

# Diagnostic Trail — H3 SDK TypeScript (dogfood 2026-08-04)

> **Historical (2026-08-04):** point-in-time dogfood record — every test and
> battery count cited below (vitest and h3-test alike) was correct when written
> and is **not live status**. The canonical counts this repo enforces live in
> `scripts/test-count.txt`, checked by `scripts/check-test-count.sh`.

*How the SDK is built, why it's shaped that way, the errors found along the way (mine and the project's), and the right way to do things. This is the record that lets anyone later answer "does this actually work?" from the repo — not from test colors.*

## Architecture (how it's built)

```
src/
├── protocol.ts     # Zod schemas + TS types — GENERATED from get-h3/protocol JSON Schema
│                   #   (scripts/generate-schemas.ts, prettier-normalized, byte-idempotent)
├── harness.ts      # Harness interface + Hono router (6 endpoints, Zod-validated)
├── middleware.ts   # requestLogger + addMiddleware (500 → H3 ErrorResponse on exceptions)
├── testbed.ts      # MockHermes — in-process harness driver for unit tests
├── index.ts        # public API re-exports (schemas, types, router, middleware, testbed)
└── examples/       # minimal.ts (bare) + echo.ts (battery-passing reference)
dist/               # tsc build — GITIGNORED (the root cause of GAP-002)
```

Design: thin, dependency-light (hono + zod only). Protocol types come from the OpenAPI source of truth in `get-h3/protocol` via a generator; `protocol.ts` is the generated artifact. The router validates every request with Zod and returns structured `ErrorResponse` JSON. The test battery (`h3-test` from `get-h3/shim`) is the real gate — 46 tests across health/process/decisions/results/errors/stress.

## The errors I hit (2026-08-04) — and the right way

### 1. npm 404 — the package is not published (GAP-001)
```
$ npm install @get-h3/h3-harness-sdk
npm error 404 Not Found - GET https://registry.npmjs.org/@get-h3%2fh3-harness-sdk
```
**Why:** the SDK was never `npm publish`ed. The README's badge and install command assume it was.
**Right way:** publish the package (or change the README to from-source instructions until then).

### 2. Git install ships a broken package (GAP-002)
```
$ npm install github:get-h3/sdk-typescript   # installs OK
$ node -e "import('@get-h3/h3-harness-sdk')"
Error: Cannot find package '.../node_modules/@get-h3/h3-harness-sdk/dist/index.js'
```
**Why:** `.gitignore` excludes `dist/`, and `package.json` has no `prepare` script, so npm's git install clones source-without-build while `main`/`types` point at `dist/`. The local checkout works only because a previous build left `dist/` on disk (untracked).
**Right way:** `"prepare": "npm run build"` in package.json — npm then builds on git/file/tarball install. Verify with `npm pack --dry-run` before any release.

### 3. Quickstart imports a type-only export as a value (GAP-003)
```
SyntaxError: The requested module '@get-h3/h3-harness-sdk' does not provide an export named 'DecisionType'
```
**Why:** `protocol.ts` defines `export type DecisionType = z.infer<typeof DecisionTypeSchema>` — a compile-time type only. The README Quickstart uses `DecisionType.TEXT` at runtime. The README's own "Minimal Harness" example uses string literals and works — the two examples contradict each other.
**Right way:** either export runtime enum objects (`export const DecisionType = { TEXT: 'text', ... }` derived from the zod enums) so `DecisionType.TEXT` typechecks and runs, or rewrite the Quickstart with literals. Then make CI run the README quickstart as a smoke test so this class of drift can't recur.

### 4. Wire shapes undocumented; validation errors mislabeled (GAP-004)
```
POST /v1/process  {"session_id":"s","message":{...}}
→ 400 {"error":{"code":"INTERNAL_ERROR","message":"Invalid request: [... identity expected object ... context expected object ...]"}}
```
**Why:** validation is strict and the error messages are excellent (they taught me the schema), but the README documents endpoints without bodies, and a *client* validation failure is labeled `INTERNAL_ERROR` (a 500-class name) on a 400 response.
**Right way:** document the request/response shapes in the README API reference (the exact bodies are in this repo's `docs/dogfood/2026-08-04-integration.md`); map Zod failures to a client-error code (`INVALID_REQUEST`) while keeping the detailed message.

### 5. MockHermes drops session state (GAP-005)
```
const mock = new MockHermes(harness);
await mock.sendMessage('read /etc/hostname');   // session_id = random A
await mock.sendResult({...});                    // session_id = random B → harness state miss → wrong decision
```
**Why:** `sendMessage`/`sendResult` default `sessionId ?? crypto.randomUUID()` — fresh ID per call. Fine for stateless harnesses; silently wrong for session-stateful ones. The README shows only one-arg calls.
**Right way:** document the `sessionId` parameter and show a two-call example threading one session id (worked: `sendMessage(msg, 'sess-1')` + `sendResult(payload, 'sess-1')`).

### 6. Battery failure from following the README (GAP-006)
```
process_text_finished_false: Expected finished=false, got True   → 42/43
```
**Why:** my first harness echoed with `finished: true` always — exactly what the README's Minimal Harness does. The battery expects a text decision with `finished: false` when the turn continues. The passing pattern lives only in `src/examples/echo.ts` (trigger words: "do not finish", "start a thought", trailing "...", "incomplete", "partial").
**Right way:** treat `src/examples/echo.ts` as the compliance reference; document `finished` semantics in the README.

## Verified-good (don't touch)

- Zod validation + structured error responses: strict, fast, actionable.
- Router wiring: `app.route('/', createH3Router(harness))` — one line, six endpoints, correct.
- `h3-test` battery: my consumer harness and the repo's echo example both pass 43/43 (0.22s, p50 ~1.1ms).
- Unit suite: 134/134 in ~350ms; coverage 94.6% (per board records; spot-checked the suite run).
- Middleware: `addMiddleware(app)` before routes; exceptions → 500 H3 ErrorResponse (per source + tests).
- Board/foreman hygiene: scheduler registration healthy (Enabled, CooldownS=900, NamespaceID=coding-hermes, no zombie ticks observed in this run).

## Project's own history (from board records)

- Ticks 1–56: full build-out (SPEC, DOC, TEST, CI, E2E 43/43, generator + fidelity, zod/vitest/types upgrades, coverage). Idle from ~tick #7 onward at 43200s cooldown, 50 consecutive idle ticks claimed at #56.
- Tick #57: board migrated to DuckDB v2.1 (`tasks.md` → `tasks.md.bak`).
- Ticks 58–63: idle audits, all gates green — while the distribution + docs gaps above went unnoticed because nothing ever *installed and used the SDK from outside the repo*. The 43/43 E2E ran against the SDK's own examples (in-repo), which is exactly the blind spot this dogfood run targeted: **in-repo green ≠ installable, usable, documented**.

## The right way to verify this project

1. Clone fresh → `npm ci && npm run build` → `npm pack` → install the tarball into a scratch consumer.
2. Write a harness, serve on :9191, run `h3-test --endpoint http://localhost:9191` — must be 43/43.
3. Exercise the session lifecycle (process → result → cancel → sessions GET/DELETE).
4. Run the README Quickstart verbatim — it must import and run (currently fails, GAP-003).

---

# 2026-08-14 — Second dogfood run: validation hole, stale teaching artifact, requiredness drift

## How the router actually works (read this before touching harness.ts)

`createH3Router(harness)` wires 6 endpoints. **Request** bodies are validated with Zod
(`ProcessRequestSchema.parse` etc. → 400 `INVALID_REQUEST` on failure), but **outgoing decisions are NOT
validated**: `DecisionSchema` is imported in `src/harness.ts` but only re-exported (L255). The GAP-009/010 fix
(`be52c5e`, "close DecisionSchema z.any() hole") validated the *schema definition* and added type-export tests —
it never wired `safeParse` into the router. Consequence (reproduced live): a harness returning
`tool_call: {tool_name, arguments, call_id}` gets HTTP 200 with the garbage shape passed through verbatim.
`INVALID_DECISION` (README errors table) is unreachable dead documentation. Battery tool_call tests are
*optional* (pass when the harness returns another decision type), so a broken-shape harness still goes 45/45
green. **This is the exact "all tests green, reality broken" pattern** the dogfood loop exists to catch.

## Why the shape changed under everyone's feet

`git log --follow src/protocol.ts`:
- `9cf142f` (initial): `ToolCallSchema` had `tool_name`/`arguments`/`call_id` (pre-GAP-009/010 world; decisions
  unvalidated so anything sailed through).
- `b75e01a` (P5-05 generator fidelity): reconciled with get-h3/protocol → `{name, params, reasoning?}`.
- `be52c5e`: hardened schemas + type-export runtime tests.

The 2026-08-04 dogfood doc was written against the *old* shape and was never revisited when the protocol
regenerated (`.schemas-changed` marker exists in the repo root — a signal that went unacted). The README never
got a `tool_call` decision example, so the stale doc remained the only in-repo example. Root cause pattern:
**schema regeneration happened, docs and teaching artifacts were not swept** — exactly what GAP-034/035 fix.

## Requiredness drift (README vs reality)

`ContextSchema.config` and `.session_state` have NO `.default()` — required objects. The battery's
`_blank_context()` always sends `"config": {}, "session_state": {}`, so the battery can never catch a user who
omits them. README's "Defaults:" paragraph lists inner-field defaults, which reads as "you may omit these" →
minimal bodies 400 with a raw Zod wall. Docs should say: objects required, fields default.

## 2026-09-06 run (#4) — where the battery doesn't look

Third follow-up dogfood run. The 08-14 fixes all held: GitHub install 6.7s,
quickstart patterns compile clean under strict tsc, GAP-033 decision
validation is live (INVALID_REQUEST errors are path-pinned and precise —
they name `["identity","chat_id"]` and `["context","config"]` exactly),
GAP-037's DELETE-unknown-404 is verified live, and a **custom** harness
(standup bot: partial turns + history echo + real tool_call roundtrip +
identity greeting) passed the battery **46/46 first try** (the battery has
grown 44→45→46; README still says 45 in one spot).

The new bugs live one step past what the battery exercises:

1. **DELETE never deletes (GAP-050, P0).** The router's DELETE handler
   checks `sessions.has()`, awaits `onSessionTerminate`, returns
   `{terminated:true}` — and never calls `sessions.delete(sessionId)`. So
   the session survives forever: GET afterwards returns the full payload
   (200), and a second DELETE re-fires `onSessionTerminate`. Exactly the
   L3 gap: the battery has no GET-after-DELETE test, so 46/46 passes with
   a broken contract. The 08-14 "DELETE unknown → 404" fix (GAP-037) was
   real — but it only made the unknown-id path consistent; the happy path
   is the broken one.
2. **Result auto-vivifies sessions (GAP-051, P1).** The result handler
   guards state updates with `if (existing)` — a truthiness check that
   cannot distinguish "never created" from "exists" (values are plain
   objects). Result on an unknown session returns 200 while every other
   session endpoint 404s. Also verified: SDK-side turn_count increments
   twice per tool_call roundtrip (process + result).
3. **chat_id required but undocumented (GAP-052, P2).** My hand-built
   client (built from the README prose, not the example) 400'd on missing
   `identity.chat_id`; the error message itself is excellent (path-pinned).
4. **history required in TS type, defaulted in schema (GAP-053, P2).**
   `DecisionSchema` has `history: z.array(...).default([])` but the
   inferred TS type makes it mandatory — pure boilerplate every harness
   carries.

Right-way additions for this run: **test session lifecycle past the
battery** (DELETE→GET must 404; result-to-unknown must be deliberate), and
when building a client from docs, expect one 400 roundtrip — then read the
error, which reliably names the offending path.

Infra note: the ephemeral-bunker install leg SKIPPED — bunker3 spawn
failed with `tar: No space left on device` (host root at 100%, 221G; 269
stale agent users but /home is only 570M, so the space hog needs root
forensics). Clean-machine install proof was done via a fresh
node:22-bookworm container instead (install → smoke OK).

## Errors hit during this run (each = a GAP task)

1. `400 INVALID_REQUEST: expected object at context.config / context.session_state` — omitted required objects → GAP-036.
2. TS compile `'tool_name' does not exist in type '{name, params}'` — followed the 08-04 doc → GAP-034.
3. Old-shape harness ran fine under tsx (no typecheck) and the router returned it 200 — the silent hole → GAP-033.
4. `DELETE /v1/sessions/<unknown>` → 200 `{terminated:true}` vs GET/cancel 404 → GAP-037.
5. tsc consumer: `Cannot find name 'node:http'/'Buffer'` from @hono/node-server types without @types/node → GAP-038.

## The right way (updated 2026-08-14)

1. Fresh consumer → `npm install github:get-h3/sdk-typescript` (works, 7s) → implement Harness with
   `tool_call: {name, params}` (NOT the 08-04 doc's shape) → serve on :9191 → `h3-test` must be 45/45.
2. Always send `identity` + `context` with `config:{}` and `session_state:{}` present.
3. If you want runtime decision guarantees before GAP-033 lands, `.parse()` your decisions with the exported
   Zod schemas in the harness.
4. Sweep `docs/dogfood/*` and the usage SKILL.md whenever `protocol.ts` regenerates (watch `.schemas-changed`).

## 2026-09-19 run (#5) — fixes verified live, bunker install leg closed

**Where:** fresh consumer harness (standup bot) on the control host + ephemeral
bunker agent b49993ab on las-bunker-03 (first successful bunker leg — 09-06 was
skipped on host disk-full). Battery 46/46 in both places; suite 172/172.

**GAP-050..053 verification (real use, not test suite):**
- GAP-050: DELETE removed the session — GET after DELETE is 404, no ghost.
- GAP-051: result on never-created session → 404 SESSION_NOT_FOUND; turn_count
  counts a tool_call roundtrip once (3 for process+toolcall+result, was 2×).
- GAP-052/053: identity defaults honored (chat_id required on the wire is now
  README'd); Decision no longer demands `history` at the type level.

**New lesson (filed as GAP-056):** the Quickstart's `SessionContext` shape is
not the wire shape — the request is `{session_id, message:{role,content},
identity, context}` and there is no `ctx.turn`; `ctx.turn?.text?.content`
evaluates to `undefined` silently under tsx, so the harness "works" but echoes
nothing. I fixed my own consumer only after reading `src/examples/echo.ts`.
A Quickstart that matches the wire schema (or is executed in CI) prevents this.

**Consumer trap that is now SAFE:** a decision in the pre-GAP-033 shape
(`{call_id, name, arguments}`) gets `500 INVALID_DECISION` with Zod issues
instead of a silent 200. This is the fix working — the old dogfood notes call
it the "silent hole". tsx consumers still won't see it at compile time, but the
runtime error names the exact path (`tool_call.params`).

**Install leg (bunker, fresh Debian agent):**
- clone github:get-h3/sdk-typescript → `npm ci && npm run build` = 10s.
- `node dist/examples/echo.js` serves; battery 46/46 against it (via a scratch
  venv shim install).
- PEP-668 friction (shim side): `pip install --user` is blocked on
  externally-managed Debian; docs don't mention a venv. Filed to get-h3/shim.

**The right way (updated 2026-09-19):** same as the 08-14 list, plus:
the request body's `message` lives at `req.message.content` (never `ctx.turn`);
`context.config` and `context.session_state` are required objects (empty dicts
fail schema — see `_blank_context` in the battery for the minimal valid body).

## 2026-09-19 — run #6 (same-day recheck)

**Why a re-run the same day:** the scheduler re-picked the lane ~5h after run
#5 blessed `4807207`. Treated as an independent verification pass rather than a
repeat: fresh /tmp consumer, fresh bunker agent, fresh clone — nothing carried
over from the morning run except the docs.

**What was re-proven at `4807207` (= origin/main, pushed):**
- GitHub install 11s into a scratch consumer; compiled examples ship (the
  `./examples/*` export map earns its keep — `dist/examples/echo.js` runs
  without any repo source).
- Battery 46/46 on a custom stateful harness (partial turns, tool_call branch,
  per-session counting); 45/46 for the verbatim Quickstart — the one miss is
  the documented partial-turn limitation, not a regression.
- 10-step HTTP lifecycle green; the two historical P0s (GAP-050 ghost
  sessions, GAP-051 auto-vivify) stay fixed under real requests.
- Suite 172/172 in the canonical layout; 129 passed / 43 skipped on a fresh
  clone — the skips are the *documented* sibling-checkout tests
  (`get-h3/protocol` absent), and the runner says so in its output. Not a
  failure, but it means "green suite" on a fresh clone is a weaker claim than
  "green suite in the canonical tree" — quote the right number.
- Bunker leg (agent 2b8421b6): clone@4807207 → install 10s → echo smoke →
  battery 46/46 via venv shim → destroyed cleanly.

**New lessons:**
1. **Run #5's GAP-056 premise correction holds under live probing:** the
   Quickstart ignores the request entirely (two different messages, identical
   reply). The gap is "Quickstart doesn't teach the ProcessRequest wire
   shape", not "reads a field that doesn't exist" — the PM cycle had it right.
2. **Skill-file drift is the residue after READMEs get fixed:** the usage
   skill lacked `GET /v1/health` in its route list and the result-vs-session
   semantics — both fixed in-run (SKILL.md v1.4.1). Lesson: after any wire
   change, sweep the *skill* too, not just README; the skill is what the next
   agent actually loads.
3. **`cancelled` is terminal** (result after cancel = 200 but the session
   stays `cancelled` forever) and `onCancel`'s boolean return is undocumented
   — filed GAP-060 (P3) for the README API reference.
4. **Board durability:** the sibling-injected GAP-058 row sat uncommitted in
   the worktree for ~2h; per fleet law it was committed by this run. A board
   row that only exists in the working tree survives sibling deploys by luck.

**The right way for a quick re-verification pass (what run #6 actually did,
~50 min end-to-end):** /tmp consumer + GitHub install → serve Quickstart
verbatim (premise checks are cheap) → serve custom harness → battery → 10-step
lifecycle curl script → fresh clone + suite → bunker agent for install proof.
Skip nothing silent: if the bunker leg can't run, the report carries the
SKIPPED row.

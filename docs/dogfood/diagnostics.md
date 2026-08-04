# Diagnostic Trail — H3 SDK TypeScript (dogfood 2026-08-04)

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

Design: thin, dependency-light (hono + zod only). Protocol types come from the OpenAPI source of truth in `get-h3/protocol` via a generator; `protocol.ts` is the generated artifact. The router validates every request with Zod and returns structured `ErrorResponse` JSON. The test battery (`h3-test` from `get-h3/shim`) is the real gate — 43 tests across health/process/decisions/results/errors/stress.

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

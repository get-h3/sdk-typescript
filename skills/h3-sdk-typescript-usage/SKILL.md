---
name: h3-sdk-typescript-usage
description: >-
  How to USE the H3 TypeScript SDK (@get-h3/h3-harness-sdk) for real: install
  paths that work, the Harness interface contract, wire shapes, the h3-test
  compliance gate, and pitfalls that break fresh users. Load this before
  writing or reviewing any harness code, README changes, or distribution work
  in this repo.
version: 1.3.0
category: software-development
---

# H3 SDK TypeScript — Real Usage Guide

What this project is: a TypeScript SDK for building **H3-compliant agent
harnesses** — an agent system that acts as the "brain" for Hermes via the H3
(brain-swap) protocol. You implement a `Harness`, mount a Hono router, and
your harness is instantly testable against the official compliance battery.

## Entry points & commands

- Library: `@get-h3/h3-harness-sdk` (still NOT on npm as of 2026-09-06 — GAP-001 open; install from GitHub or source, see Install)
- Router: `createH3Router(harness)` → Hono router, 6 endpoints
- Testbed: `MockHermes` for unit-testing harnesses without Hermes
- Build: `npm ci && npm run build` (tsc → `dist/`, gitignored)
- Test: `npm test` (vitest) · `npm run lint` (tsc --noEmit)
- Compliance: `h3-test --endpoint http://localhost:9191` (46 tests as of 2026-09-06, from `get-h3/shim`)

## Install — the working paths (re-verified 2026-09-06)

| Path | Works? |
|---|---|
| `npm install @get-h3/h3-harness-sdk` | ❌ 404 — not published (GAP-001, still open) |
| `npm install github:get-h3/sdk-typescript` | ✅ works — the `prepare` script builds `dist/` on install (GAP-002 fixed) |
| local checkout: `npm ci && npm run build`, then `npm install /path/to/checkout` | ✅ use when hacking on the SDK itself |

## The Harness contract (what you implement)

```typescript
interface Harness {
  onProcess(req: ProcessRequest): Promise<Decision>;   // new user message → first Decision
  onResult(req: ResultRequest): Promise<Decision>;     // tool/LLM result → next Decision
  onCancel?(req: CancelRequest): Promise<boolean>;     // user interrupt
  onSessionTerminate?(sessionId: string): Promise<void>;
  health(): HealthResponse;                            // { status, version, transport, protocol_version, capabilities }
}
```

**Pitfall (GAP-003):** `DecisionType` is TYPE-ONLY (`export type DecisionType = z.infer<...>`).
Do NOT write `DecisionType.TEXT` — use string literals: `'tool_call' | 'llm_call' | 'text' | 'wait' | 'delegate' | 'end'`.
The README Quickstart and the Minimal Harness example both use literals correctly — follow them.

## Wire shapes (documented in README § API Reference → Wire Shapes; quick reference here)

- `POST /v1/process` body: `{ session_id, message: {role, content}, identity: {platform, chat_id, user_id?}, context: {config, session_state} }`
  **`identity`, `context`, `context.config`, `context.session_state` are REQUIRED objects** (verified 2026-08-14,
  re-verified 2026-09-06: omitting them → 400 `INVALID_REQUEST` with a raw Zod error wall). Inner fields default
  (`config.max_iterations` = 100 etc.), the parent objects do NOT. Send `"config": {}` / `"session_state": {}` at minimum.
  **`identity.chat_id` is a required string** even though only `user_name`/`user_id` are listed as defaulted —
  omit it → 400, path-pinned error `["identity","chat_id"]` (GAP-052).
- **Decision wire shape (the tool_call example README lacks — GAP-035):**
  ```json
  { "decision": "tool_call", "decision_id": "<uuid>", "history": [],
    "tool_call": { "name": "calculator", "params": { "expression": "2+3*4" } } }
  ```
  `ToolCallSchema` is `{ name: string, params: Record<string,unknown>, reasoning? }`. **NOT** `tool_name` /
  `arguments` / `call_id` — that old shape (taught by docs/dogfood/2026-08-04-integration.md, GAP-034) fails TS
  compile and is silently passed through unvalidated at runtime (GAP-033).
- `POST /v1/result` body: `{ session_id, decision_id, result: { type, tool_name?, data?, duration_ms?, success } }` — **singular `result`**, NOT `results`
- `POST /v1/cancel` body: `{ session_id, reason: 'user_interrupt'|'timeout'|'system' }` — 404 if session unknown
- `GET /v1/sessions/:id` — 404 `SESSION_NOT_FOUND` if unknown
- **`DELETE /v1/sessions/:id` does NOT delete (GAP-050, P0, verified 2026-09-06):** it returns
  `{terminated:true}` 200 but the session survives — GET afterwards returns 200 with the full payload and a
  second DELETE re-fires `onSessionTerminate`. The handler never calls `sessions.delete()`. Don't rely on
  DELETE to free memory or make the id unknown; treat sessions as immortal until GAP-050 lands.
- **`POST /v1/result` auto-vivifies unknown sessions (GAP-051):** result to a never-created session returns
  200 + a Decision, while process/cancel/GET/DELETE all 404 on unknown ids. Also SDK-side `turn_count`
  increments twice per tool_call roundtrip (process + result) — don't use it as "user turns".

Validation failures → HTTP 400 with `code: "INVALID_REQUEST"` and a detailed
structured error (the message lists every missing field **with its exact
path** — `["identity","chat_id"]`, `["context","config"]` — read it, it's the
de-facto docs). Harness exceptions → 200 with an `end` decision
(`reason:"error"`). A malformed Decision from the harness → 500
`INVALID_DECISION` (GAP-033 fixed 2026-08-14; verified in router source
2026-09-06 — `DecisionSchema.safeParse` guards both `/v1/process` and
`/v1/result`).

## Passing the compliance battery (the real gate)

`h3-test --endpoint http://localhost:9191` — must be fully green before release (46/46 as of 2026-09-06;
the battery grows over time — 43→44→45→46 — so check `h3-test --version` output rather than trusting
counts baked into older docs).

1. Text decisions need correct `finished`: `finished:false` for continuing turns. A harness that always returns `finished:true` fails `process_text_finished_false` (GAP-006). Reference logic in `src/examples/echo.ts` (triggers: "do not finish", "start a thought", trailing "...", "incomplete", "partial").
2. `src/examples/echo.ts` is the battery-passing reference. `minimal.ts`/README MinimalHarness are NOT battery-passing on their own.
3. The battery is fast (0.2s) — run it in CI or before every release.
4. **The battery does NOT cover everything (2026-09-06 lesson):** it has no GET-after-DELETE test, which is
   exactly where GAP-050 (DELETE never deletes) hid behind a 46/46 green. When you touch session lifecycle,
   add your own curl checks: DELETE→GET must 404, result-to-unknown-session must be deliberate.

## MockHermes (unit-testing)

```typescript
const mock = new MockHermes(myHarness);
const d = await mock.sendMessage('read /etc/hostname', 'sess-1'); // ← pass a sessionId!
const n = await mock.sendResult({ type: 'tool_result', tool_name: 'read_file', data: {...}, success: true }, 'sess-1');
await mock.cancel('sess-1');
```
**Pitfall (GAP-005):** without an explicit sessionId each call gets a random ID — session-stateful harnesses silently lose state. Always thread one sessionId.

## Serving

```javascript
import { serve } from '@hono/node-server';
serve({ fetch: app.fetch, port: 9191 }, (i) => console.log(`:${i.port}`));
```

## Common pitfalls (quick list)

1. npm install 404 → GitHub-install or local-checkout install (GAP-001, still open)
2. `DecisionType.TOOL_CALL` → SyntaxError; use literals (GAP-003)
3. `req.results` doesn't exist → `req.result` (the wire shape is documented, but the singular form still trips people)
4. MockHermes random session IDs → thread one sessionId (GAP-005)
5. `finished:true` always → fails battery; copy echo.ts logic (GAP-006)
6. `tool_call` decisions use `{name, params}` — NOT `{tool_name, arguments}` (GAP-034; since GAP-033 was fixed 2026-08-14, malformed decisions now get 500 INVALID_DECISION instead of silently passing)
7. Omit `identity`/`context`/`config`/`session_state` → 400; send `"config":{},"session_state":{}` (GAP-036)
8. tsc consumers need `@types/node` for `@hono/node-server` serve() types (GAP-038; tsx users fine)
9. `DELETE /v1/sessions/:id` doesn't actually delete — GET still 200 afterwards (GAP-050, P0)
10. result to a never-created session returns 200, not 404 (GAP-051); `turn_count` counts tool_call roundtrips twice
11. `identity.chat_id` is required — omit → 400 `["identity","chat_id"]` (GAP-052)
12. The TS `Decision` type requires `history: []` in every decision literal even though the runtime schema defaults it to `[]` (GAP-053)

## Diagnostics

See `docs/dogfood/diagnostics.md` for the build history, error trail, and the
right verification flow (fresh clone → build → pack → scratch consumer →
battery → lifecycle).

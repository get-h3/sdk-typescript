---
name: h3-sdk-typescript-usage
description: >-
  How to USE the H3 TypeScript SDK (@get-h3/h3-harness-sdk) for real: install
  paths that work, the Harness interface contract, wire shapes, the h3-test
  compliance gate, and pitfalls that break fresh users. Load this before
  writing or reviewing any harness code, README changes, or distribution work
  in this repo.
version: 1.2.0
category: software-development
---

# H3 SDK TypeScript — Real Usage Guide

What this project is: a TypeScript SDK for building **H3-compliant agent
harnesses** — an agent system that acts as the "brain" for Hermes via the H3
(brain-swap) protocol. You implement a `Harness`, mount a Hono router, and
your harness is instantly testable against the official compliance battery.

## Entry points & commands

- Library: `@get-h3/h3-harness-sdk` (still NOT on npm as of 2026-08-11 — GAP-001 open; install from GitHub or source, see Install)
- Router: `createH3Router(harness)` → Hono router, 6 endpoints
- Testbed: `MockHermes` for unit-testing harnesses without Hermes
- Build: `npm ci && npm run build` (tsc → `dist/`, gitignored)
- Test: `npm test` (vitest, 144 tests) · `npm run lint` (tsc --noEmit)
- Compliance: `h3-test --endpoint http://localhost:9191` (44 tests, from `get-h3/shim`)

## Install — the working paths (verified 2026-08-14)

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
  **`identity`, `context`, `context.config`, `context.session_state` are REQUIRED objects** (verified 2026-08-14:
  omitting them → 400 `INVALID_REQUEST` with a raw Zod error wall). Inner fields default (`config.max_iterations`
  = 100 etc.), the parent objects do NOT. Send `"config": {}` / `"session_state": {}` at minimum.
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
- `GET /v1/sessions/:id` — 404 `SESSION_NOT_FOUND` if unknown. `DELETE` currently returns
  `{terminated:true}` 200 even for unknown sessions (GAP-037 — treat as idempotent).

Validation failures → HTTP 400 with `code: "INVALID_REQUEST"` and a detailed
structured error (the message lists every missing field — read it, it's the
de-facto docs). Server-side failures → HTTP 500, code `INTERNAL_ERROR`.
(The 400→`INVALID_REQUEST` mapping landed in GAP-014.)

**⚠️ Decision validation hole (GAP-033):** the router does NOT validate decisions returned by `onProcess` /
`onResult` — `INVALID_DECISION` is documented but unreachable. Garbage decision shapes pass through with 200.
TS users are protected by the types; JS/tsx users are not. Build decisions from the exported Zod schemas
(`DecisionSchema.parse(...)`) in your harness if you want runtime guarantees until GAP-033 lands.

## Passing the compliance battery (the real gate)

`h3-test --endpoint http://localhost:9191` — must be 44/44 before release.

1. Text decisions need correct `finished`: `finished:false` for continuing turns. A harness that always returns `finished:true` fails `process_text_finished_false` (GAP-006). Reference logic in `src/examples/echo.ts` (triggers: "do not finish", "start a thought", trailing "...", "incomplete", "partial").
2. `src/examples/echo.ts` is the battery-passing reference (44/44 verified). `minimal.ts`/README MinimalHarness are NOT battery-passing on their own.
3. The battery is fast (0.2s) — run it in CI or before every release.

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
6. `tool_call` decisions use `{name, params}` — NOT `{tool_name, arguments}` (GAP-034; old shape passes through unvalidated, GAP-033)
7. Omit `identity`/`context`/`config`/`session_state` → 400; send `"config":{},"session_state":{}` (GAP-036)
8. tsc consumers need `@types/node` for `@hono/node-server` serve() types (GAP-038; tsx users fine)

## Diagnostics

See `docs/dogfood/diagnostics.md` for the build history, error trail, and the
right verification flow (fresh clone → build → pack → scratch consumer →
battery → lifecycle).

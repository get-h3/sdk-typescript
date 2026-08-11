---
name: h3-sdk-typescript-usage
description: >-
  How to USE the H3 TypeScript SDK (@get-h3/h3-harness-sdk) for real: install
  paths that work, the Harness interface contract, wire shapes, the h3-test
  compliance gate, and pitfalls that break fresh users. Load this before
  writing or reviewing any harness code, README changes, or distribution work
  in this repo.
version: 1.0.0
category: software-development
---

# H3 SDK TypeScript — Real Usage Guide

What this project is: a TypeScript SDK for building **H3-compliant agent
harnesses** — an agent system that acts as the "brain" for Hermes via the H3
(brain-swap) protocol. You implement a `Harness`, mount a Hono router, and
your harness is instantly testable against the official compliance battery.

## Entry points & commands

- Library: `@get-h3/h3-harness-sdk` (NOT on npm as of 2026-08-04 — see Install)
- Router: `createH3Router(harness)` → Hono router, 6 endpoints
- Testbed: `MockHermes` for unit-testing harnesses without Hermes
- Build: `npm ci && npm run build` (tsc → `dist/`, gitignored)
- Test: `npm test` (vitest, 134 tests) · `npm run lint` (tsc --noEmit)
- Compliance: `h3-test --endpoint http://localhost:9191` (43 tests, from `get-h3/shim`)

## Install — the working paths (2026-08-04)

| Path | Works? |
|---|---|
| `npm install @get-h3/h3-harness-sdk` | ❌ 404 — not published (GAP-001) |
| `npm install github:get-h3/sdk-typescript` | ❌ installs but no `dist/` — no prepare script (GAP-002) |
| local checkout: `npm ci && npm run build`, then `npm install /path/to/checkout` | ✅ the only working path |

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
The README Quickstart is broken on this; the Minimal Harness example is correct.

## Wire shapes (undocumented in README — GAP-004)

- `POST /v1/process` body: `{ session_id, message: {role, content}, identity: {platform, chat_id, user_id?}, context: {config, session_state} }`
- `POST /v1/result` body: `{ session_id, decision_id, result: { type, tool_name?, data?, duration_ms?, success } }` — **singular `result`**, NOT `results`
- `POST /v1/cancel` body: `{ session_id, reason: 'user_interrupt'|'timeout'|'system' }`
- `GET|DELETE /v1/sessions/:id`

Validation failures → HTTP 400 with a detailed structured error (the message lists every missing field — read it, it's the de-facto docs). Note: the code says `INTERNAL_ERROR` even on 400s (mislabel, GAP-004).

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

1. npm install 404 → local-checkout install (GAP-001)
2. git-install has no dist/ → build locally (GAP-002)
3. `DecisionType.TOOL_CALL` → SyntaxError; use literals (GAP-003)
4. `req.results` doesn't exist → `req.result` (GAP-004)
5. MockHermes random session IDs → thread one sessionId (GAP-005)
6. `finished:true` always → fails battery; copy echo.ts logic (GAP-006)

## Diagnostics

See `docs/dogfood/diagnostics.md` for the build history, error trail, and the
right verification flow (fresh clone → build → pack → scratch consumer →
battery → lifecycle).

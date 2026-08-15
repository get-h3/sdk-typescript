# Dogfood Integration Report — 2026-08-04

**Project:** `@get-h3/h3-harness-sdk` (get-h3/sdk-typescript)
**Verdict:** 🟡 PROMISING-BUT-ROUGH
**Run type:** Library consumer — a real harness built from scratch in `/tmp/dogfood-h3-sdk-typescript`, served over HTTP, verified with the official `h3-test` compliance battery (44 tests).

## The promise

> "TypeScript SDK for building H3-compliant agent harnesses. Works with Node, Bun, Deno." — README
> `npm install @get-h3/h3-harness-sdk` → implement the `Harness` interface → `createH3Router()` → H3-compliant.

**Reality:** the SDK core delivers on the promise (a from-scratch harness passed 44/44 compliance in ~15 min of work) — but the **distribution story is broken**: the npm install command 404s and the git-install path ships an unimportable package. A real user cannot get the code by any documented route today.

## What I built (the working consumer)

A "file-reader agent" harness: user says `read <path>` → harness returns a `tool_call` decision → Hermes executes → result comes back via `/v1/result` → harness composes the final text. Full source: `/tmp/dogfood-h3-sdk-typescript/harness.mjs` (mirrored below as the pattern to copy).

## Install paths — what actually works (2026-08-04)

| Path | Result |
|---|---|
| `npm install @get-h3/h3-harness-sdk` | ❌ **E404** — package not in npm registry (README headline command) |
| `npm install github:get-h3/sdk-typescript` | ⚠️ installs, but **unimportable**: `dist/` is gitignored, no `prepare` script → `main` → missing `dist/index.js` |
| `npm install /path/to/local/checkout` | ✅ works (local checkout has a built `dist/`) — **the only working path today** |

**Working recipe (until GAP-001/GAP-002 are fixed):**

```bash
git clone https://github.com/get-h3/sdk-typescript
cd sdk-typescript && npm ci && npm run build   # dist/ is gitignored — must build locally
mkdir /tmp/my-harness && cd /tmp/my-harness
npm init -y
npm install /path/to/sdk-typescript hono @hono/node-server
```

## The harness (works, 44/44)

> **Shape update (2026-08-14):** the `tool_call` wire shape below was updated.
> The obsolete `tool_name`,
> `arguments`, and `call_id` keys were replaced by `name` and `params`
> (matching `ToolCallSchema` in `src/protocol.ts` since b75e01a). The old shape
> no longer compiles against the typed SDK and is rejected at runtime by the
> router with `500 INVALID_DECISION` (GAP-033). Battery count corrected 43 → 44
> (GAP-034).

```javascript
// harness.mjs — tool-calling H3 harness (Node 22+, ESM)
// NOTE: DecisionType is TYPE-ONLY in v0.1.0 — use string literals ('tool_call', 'text', 'end'),
// not DecisionType.TOOL_CALL (see the README Quickstart for the string-literal pattern).
import { Hono } from 'hono';
import { createH3Router } from '@get-h3/h3-harness-sdk';

class FileReaderHarness {
  constructor() { this.sessions = new Map(); }

  async onProcess(req) {
    const content = req.message?.content ?? '';
    if (content.startsWith('read ')) {
      const path = content.slice(5).trim();
      this.sessions.set(req.session_id, { path, step: 'awaiting_tool' });
      return {
        decision: 'tool_call',
        decision_id: crypto.randomUUID(),
        tool_call: { name: 'read_file', params: { path } },
      };
    }
    // finished:false for partial-style messages — required by h3-test process_text_finished_false
    const lower = content.toLowerCase();
    const isPartial = lower.includes('do not finish') || lower.includes('start a thought') ||
                      content.endsWith('...') || lower.includes('incomplete') || lower.includes('partial');
    return { decision: 'text', decision_id: crypto.randomUUID(),
             text: { content: `Echo: ${content}`, finished: !isPartial } };
  }

  async onResult(req) {
    const state = this.sessions.get(req.session_id) ?? { step: 'done' };
    // WIRE SHAPE: the field is singular `result` (ResultRequestSchema), NOT `results`
    const result = req.result;
    if (state.step === 'awaiting_tool' && result) {
      return { decision: 'text', decision_id: crypto.randomUUID(),
               text: { content: `File ${state.path} contains: ${result.data?.content}`, finished: true } };
    }
    return { decision: 'end', decision_id: crypto.randomUUID(), end: { reason: 'task_complete' } };
  }

  async onCancel() { return true; }
  async onSessionTerminate(sessionId) { this.sessions.delete(sessionId); }

  health() {
    return { status: 'ok', version: '0.1.0', transport: 'rest', protocol_version: '1.0',
             capabilities: ['text', 'tool_call', 'end'] };
  }
}

const app = new Hono();
app.route('/', createH3Router(new FileReaderHarness()));
export { FileReaderHarness };
export default app;
```

```javascript
// server.mjs — serve it (h3-test's default target is :9191)
import { serve } from '@hono/node-server';
import app from './harness.mjs';
serve({ fetch: app.fetch, port: 9191 }, (i) => console.log(`listening on :${i.port}`));
```

## Wire shapes (undocumented in README — learned from Zod error messages; see GAP-004)

| Endpoint | Body |
|---|---|
| `POST /v1/process` | `{ session_id, message: { role, content }, identity: { platform, chat_id, user_id? }, context: { config, session_state } }` |
| `POST /v1/result` | `{ session_id, decision_id, result: { type: 'tool_result'\|'llm_response'\|'text_sent'\|'delegate_result'\|'wait_timeout'\|'error', tool_name?, data?, duration_ms?, success } }` — **singular `result`** |
| `POST /v1/cancel` | `{ session_id, reason: 'user_interrupt'\|'timeout'\|'system' }` (no decision_id) |
| `GET/DELETE /v1/sessions/:id` | — |

All request bodies are Zod-validated; failures return HTTP 400 with a detailed, structured error listing every missing/invalid field (great DX — but the code is `INTERNAL_ERROR` even for client errors, which is misleading).

## Verified session lifecycle (all 200s)

```
process  → { decision: 'tool_call', tool_call: { name: 'read_file', ... } }
result   → { decision: 'text', text: { content: 'File /etc/hostname contains: my-host-42', finished: true } }
cancel   → { session_id, cancelled: true }
GET/DELETE /v1/sessions/sess-003 → session status / { terminated: true }
```

## Compliance battery (the gate that matters)

| Target | Result |
|---|---|
| My consumer harness (from scratch, ~15 min) | 44/44 PASSED (0.22s, p50 1.09ms) — after adding partial-turn handling |
| SDK's own `dist/examples/echo.js` | 44/44 PASSED — the reference implementation |
| Repo unit suite (sanity) | 134/134 in 351ms |

Latency p50 ≈ 1.1–1.6ms — the router is fast.

## Errors hit & their fixes (the friction trail)

1. `npm install @get-h3/h3-harness-sdk` → `npm error 404` → use local-checkout install (GAP-001).
2. `npm install github:get-h3/sdk-typescript` → installs, then `Cannot find package '.../dist/index.js'` at import → build locally / file install (GAP-002).
3. `SyntaxError: The requested module does not provide an export named 'DecisionType'` → use string literals (GAP-003).
4. `400 INTERNAL_ERROR: Invalid request: [...identity, context missing...]` → read the error, add the fields; the error message IS the documentation today (GAP-004).
5. `process_text_finished_false: Expected finished=false, got True` → add partial-turn handling (`finished:false` on "do not finish"/"..."-style messages) — same logic as `src/examples/echo.ts` (GAP-006).
6. MockHermes: `sendMessage`/`sendResult` without sessionId generate random IDs per call → pass the same sessionId to both (GAP-005).

## What I'd fix first (1 hour of maintainer time)

1. **Publish to npm** (GAP-001, P0) — the README's first command must work.
2. **Add `"prepare": "npm run build"`** (GAP-002, P1) — fixes git/file installs in one line.
3. **Fix the Quickstart** (GAP-003, P1) — export runtime `DecisionType` or switch to literals.

## Verdict evidence

- **Works:** yes — full lifecycle + 44/44 compliance from a fresh consumer.
- **Useful:** yes — H3 compliance is a real, testable gate; MockHermes testbed is genuinely handy.
- **Usable:** no for a fresh user — every documented install route fails; the Quickstart is copy-paste broken; wire shapes undocumented. Time-to-first-success for me: ~25 min including workarounds (~5 min once GAP-001..003 land).
- **Trustworthy:** yes — 134/134 unit tests verified, 44/44 battery on two harnesses, strict validation, structured errors, fast.

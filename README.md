# @get-h3/h3-harness-sdk

TypeScript SDK for building H3-compliant agent harnesses. Works with Node, Bun, Deno.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Runtime support:** the CI matrix tests Node 20 and 22 only. Bun and Deno
> install paths are documented below and the SDK ships an ESM build
> (CommonJS consumers can use dynamic `import()` from a `require()` context),
> but neither runtime is CI-covered — Bun's `bunx vitest` runner and Deno's
> ESM/Zod resolution are unverified. See [Runtime support](#runtime-support)
> for the current status and known limitations.

## Install

> **Not yet published to the npm registry.** The command below is the intended route
> once published; until then use the GitHub or from-source routes below.

```bash
npm install @get-h3/h3-harness-sdk
```

### From GitHub (works today)

```bash
npm install github:get-h3/sdk-typescript
```

The package's `prepare` script builds `dist/` automatically on install.

### From source

```bash
git clone https://github.com/get-h3/sdk-typescript
cd sdk-typescript
npm ci && npm run build
```

### Bun

```bash
bun add github:get-h3/sdk-typescript
# once published:
bun add @get-h3/h3-harness-sdk
```

## Runtime support

| Runtime | Install                                | CI-tested      | Status                                                               |
| ------- | -------------------------------------- | -------------- | -------------------------------------------------------------------- |
| Node 20 | `npm ci`                               | ✅ (CI matrix) | Fully supported                                                      |
| Node 22 | `npm ci`                               | ✅ (CI matrix) | Fully supported                                                      |
| Bun     | `bun add github:get-h3/sdk-typescript` | ❌             | Install path documented; test runner not CI-covered                  |
| Deno    | n/a (no documented install path)       | ❌             | Not verified — ESM/Zod 4 resolution and Hono fetch adapters unproven |

**Known limitations (as of 2026-08-06):**

- The CI matrix runs Node 20/22 only — the "Works with Node, Bun, Deno"
  claim in the tagline is aspirational for Bun/Deno, not CI-proven.
- **Bun:** `bun add` installs from the GitHub route, but `bunx vitest run`
  has never been exercised in CI. Bun's module resolution differs from
  Node's (`bun` has its own resolver); the SDK's ESM build should load,
  but this is unverified.
- **Deno:** no install route exists yet (no Deno-compatible package entry).
  Deno's ESM resolution and Zod 4 compatibility are unproven — do not rely
  on Deno until a CI-covered matrix entry or a documented limitation is
  added.
- Node is the supported baseline; if you hit a Bun/Deno-specific issue,
  please file an issue with the runtime version.

## Quickstart

```typescript
import { Hono } from "hono";
import {
  createH3Router,
  type Harness,
  type Decision,
  type HealthResponse,
} from "@get-h3/h3-harness-sdk";

class MyHarness implements Harness {
  async onProcess(): Promise<Decision> {
    return {
      decision: "text",
      decision_id: crypto.randomUUID(),
      history: [],
      text: { content: "Hello from TypeScript!", finished: true },
    };
  }
  async onResult(): Promise<Decision> {
    return {
      decision: "end",
      decision_id: crypto.randomUUID(),
      history: [],
      end: { reason: "task_complete" },
    };
  }
  health(): HealthResponse {
    return {
      status: "ok",
      version: "1.0.0",
      transport: "rest",
      protocol_version: "1.0",
      capabilities: ["text", "end"],
    };
  }
}

const app = new Hono();
app.route("/", createH3Router(new MyHarness()));
export default app;
```

> **Type-only exports:** enum-like names such as `DecisionType` are exported as
> TypeScript types only (runtime validation happens via the companion Zod
> schemas, e.g. `DecisionTypeSchema`). Use the string literals shown above
> (`'text'`, `'end'`) in decision payloads — importing `DecisionType` as a
> value throws a SyntaxError at module load. See the [Echo Harness](#echo-harness)
> example and `src/examples/echo.ts` for the battery-passing pattern.

> **Compliance reference:** the Quickstart above is the minimal hello-world —
> it always returns `finished: true`, so it does NOT satisfy the h3-test
> battery's partial-turn region (`process_text_finished_false`). For a
> battery-passing harness, use [`src/examples/echo.ts`](src/examples/echo.ts)
> as the reference implementation: it demonstrates the `finished: false`
> partial-turn semantics described in
> [Partial turns — `finished: false`](#partial-turns--finished-false).

### Serving your harness

The Quickstart builds a Hono `app` but does not serve it — you need an HTTP
server to expose the router. Use `@hono/node-server` (a devDependency of the
SDK — add it to your own project's dependencies to use it), plus
`@types/node` as a devDependency (the `serve()` call types against Node's
`http` module — a tsc-based consumer fails to compile without it; tsx/Bun
consumers can skip it since they don't typecheck):

```bash
npm i @hono/node-server
npm i -D @types/node
```

```typescript
import { serve } from "@hono/node-server";

serve({ fetch: app.fetch, port: 9191 });
```

Then verify:

```bash
curl http://localhost:9191/v1/health
# {"status":"ok","version":"1.0.0","transport":"rest","protocol_version":"1.0","capabilities":["text","end"]}
```

Port `9191` is the h3-test battery's default target — see the
[Echo Harness](#echo-harness) example for the full battery-passing pattern.

## API Reference

### Harness Interface

The `Harness` interface is the core contract you implement:

```typescript
interface Harness {
  /** Called when a new user message arrives. Return the first Decision. */
  onProcess(req: ProcessRequest): Promise<Decision>;

  /** Called after Hermes executes a Decision. Return the next Decision. */
  onResult(req: ResultRequest): Promise<Decision>;

  /** Optional — called when the user interrupts. Return whether cancelled. */
  onCancel?(req: CancelRequest): Promise<boolean>;

  /** Optional — called when a session is terminated. */
  onSessionTerminate?(sessionId: string): Promise<void>;

  /** Returns health status and capabilities. */
  health(): HealthResponse;
}
```

### `createH3Router(harness)`

Creates a Hono router with all H3 endpoints wired:

| Method   | Path               | Description                                                |
| -------- | ------------------ | ---------------------------------------------------------- |
| `GET`    | `/v1/health`       | Health check — calls `harness.health()`                    |
| `POST`   | `/v1/process`      | Process a user message — calls `harness.onProcess()`       |
| `POST`   | `/v1/result`       | Return tool/LLM results — calls `harness.onResult()`       |
| `POST`   | `/v1/cancel`       | Cancel the current turn — calls `harness.onCancel()`       |
| `GET`    | `/v1/sessions/:id` | Get session status                                         |
| `DELETE` | `/v1/sessions/:id` | Terminate a session — calls `harness.onSessionTerminate()` |

All endpoints validate requests with Zod schemas and return structured error responses on failure.

### Wire Shapes

Every endpoint validates its request body against a Zod schema exported from `src/protocol.ts` (e.g. `ProcessRequestSchema`). The examples below are the exact wire shapes — field names, required/optional markers, and defaults match the schemas, so you can build a client against this reference without reading the source.

#### `POST /v1/process` — `ProcessRequest`

```json
{
  "session_id": "sess_01J2abc",
  "message": {
    "role": "user",
    "content": "Do something",
    "attachments": [
      {
        "type": "image",
        "url": "https://example.com/a.png",
        "mime_type": "image/png"
      }
    ],
    "timestamp": "2026-08-05T12:00:00Z"
  },
  "identity": {
    "platform": "telegram",
    "chat_id": "-1001234567890",
    "thread_id": "42",
    "user_name": "alice",
    "user_id": "42"
  },
  "context": {
    "history": [{ "role": "user", "content": "Previous message" }],
    "tools": [
      {
        "name": "read_file",
        "description": "Read a file",
        "parameters": { "path": { "type": "string" } }
      }
    ],
    "models": [
      {
        "name": "deepseek-v4-flash",
        "provider": "deepseek",
        "context_window": 131072
      }
    ],
    "memory": "persistent session memory",
    "skills": ["coding-hermes"],
    "config": {
      "max_iterations": 100,
      "timeout_seconds": 60,
      "temperature": 0.7
    },
    "session_state": {
      "turn_count": 2,
      "total_tool_calls": 3,
      "total_llm_calls": 2,
      "cost_so_far": 0.0012,
      "started_at": "2026-08-05T11:59:00Z"
    }
  }
}
```

`identity`, `context`, `context.config` and `context.session_state` are required objects. In other words: **config and session_state are required** — omitting them (or `identity` / `context` themselves) returns `400`. Only their inner fields default: `message.role` = `"user"`; `identity.user_name` / `user_id` = `"unknown"`; `context.history` / `tools` / `models` = `[]`; `config.max_iterations` = `100`, `config.timeout_seconds` = `60`; `session_state` counters = `0`.

Response (`200`) — a `Decision`. `history` is echoed back from `context.history`:

```json
{
  "decision": "text",
  "decision_id": "9b2e4f1a-6c3d-4e8b-9a2f-1c5d7e9b0a3f",
  "history": [{ "role": "user", "content": "Do something" }],
  "text": { "content": "Hello from TypeScript!", "finished": true }
}
```

`decision` is one of `tool_call`, `llm_call`, `text`, `wait`, `delegate`, `end`; exactly one of the matching payload keys (`tool_call`, `llm_call`, `text`, `wait`, `delegate`, `end`) is present. A `tool_call` decision (field-by-field match with `ToolCallSchema` — `name` + `params` required, `reasoning` optional):

```json
{
  "decision": "tool_call",
  "decision_id": "8f2c9d4e-1b3a-4f6e-9c7d-2e5a8b0f1c44",
  "history": [{ "role": "user", "content": "Read /etc/hostname" }],
  "tool_call": {
    "name": "read_file",
    "params": { "path": "/etc/hostname" },
    "reasoning": "The user asked to read a file"
  }
}
```

`llm_call`, `wait`, and `delegate` payloads follow the same pattern: `llm_call` takes `{ model, messages, ... }` (`LLMCallSchema`), `wait` takes `{ duration_ms, reason? }` (`WaitSchema`), `delegate` takes `{ target, input, ... }` (`DelegateSchema`).

#### `POST /v1/result` — `ResultRequest`

```json
{
  "session_id": "sess_01J2abc",
  "decision_id": "9b2e4f1a-6c3d-4e8b-9a2f-1c5d7e9b0a3f",
  "result": {
    "type": "tool_result",
    "tool_name": "read_file",
    "data": { "content": "file contents" },
    "duration_ms": 42,
    "success": true
  }
}
```

`result.type` is one of `tool_result`, `llm_response`, `text_sent`, `delegate_result`, `wait_timeout`, `error`. Response (`200`) — a `Decision` (same shape as above).

#### `POST /v1/cancel` — `CancelRequest`

```json
{
  "session_id": "sess_01J2abc",
  "reason": "user_interrupt"
}
```

`reason` is one of `user_interrupt`, `timeout`, `system`. Response (`200`):

```json
{ "session_id": "sess_01J2abc", "cancelled": true }
```

#### `GET /v1/health` — `HealthResponse`

```json
{
  "status": "ok",
  "version": "1.0.0",
  "transport": "rest",
  "protocol_version": "1.0",
  "uptime_seconds": 3600,
  "active_sessions": 2,
  "capabilities": ["tool_call", "llm_call", "text", "wait", "delegate", "end"]
}
```

`status` is one of `ok`, `degraded`, `down`; `capabilities` items are one of `tool_call`, `llm_call`, `text`, `wait`, `delegate`, `end`.

#### `GET /v1/sessions/:id` — `SessionResponse`

```json
{
  "session_id": "sess_01J2abc",
  "started_at": "2026-08-05T11:59:00Z",
  "last_active": "2026-08-05T12:00:00Z",
  "turn_count": 2,
  "status": "active",
  "current_decision_type": "text"
}
```

`status` is one of `active`, `completed`, `expired`, `cancelled`. Unknown sessions return `404` with a `SESSION_NOT_FOUND` error.

#### `DELETE /v1/sessions/:id`

Response (`200`):

```json
{ "session_id": "sess_01J2abc", "terminated": true }
```

Unknown sessions return `404` with a `SESSION_NOT_FOUND` error (consistent with `GET /v1/sessions/:id` and `POST /v1/cancel`).

#### Errors — `ErrorResponse`

Validation failures return `400` with an `ErrorResponse`:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid request: Invalid JSON body",
    "details": {}
  }
}
```

`error.code` is one of `INVALID_REQUEST`, `INVALID_DECISION`, `UNKNOWN_TOOL`, `UNKNOWN_MODEL`, `SESSION_NOT_FOUND`, `SESSION_EXPIRED`, `HARNESS_TIMEOUT`, `INTERNAL_ERROR`. Harness exceptions during `onProcess` / `onResult` are returned as `200` with an `end` decision (`reason: "error"`) rather than an HTTP error.

### Middleware

```typescript
import { addMiddleware, requestLogger } from "@get-h3/h3-harness-sdk";

// Option 1: add logging middleware to an existing Hono app
addMiddleware(app);

// Option 2: use the raw middleware directly
app.use("*", requestLogger);
```

`requestLogger` logs each request with method, path, status, and duration in ms.
On exceptions, it catches the error and returns a 500 JSON response in H3 `ErrorResponse` format.

**Important:** Call `addMiddleware()` BEFORE adding routes — middleware order matters.

### Protocol Types

All H3 v1 protocol types are exported with matching Zod schemas:

| Category      | Exports                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Enums**     | `DecisionType`, `EndReason`, `CancelReason`, `ResultType`, `SessionStatus`, `ErrorCode`, `HealthStatus`, `AttachmentType`, `MessageRole`, `Capability` |
| **Common**    | `Attachment`, `Message`, `Identity`, `HistoryEntry`, `Tool`, `Model`, `SessionState`, `Config`, `Context`                                              |
| **Decisions** | `ToolCall`, `LLMMessage`, `LLMCall`, `TextResponse`, `Wait`, `Delegate`, `End`                                                                         |
| **Requests**  | `ProcessRequest`, `ResultPayload`, `ResultRequest`, `CancelRequest`                                                                                    |
| **Responses** | `HealthResponse`, `ErrorDetail`, `ErrorResponse`, `SessionResponse`                                                                                    |
| **Top-level** | `Decision`                                                                                                                                             |

Each type has a companion Zod schema (e.g., `ProcessRequestSchema`) for runtime validation.

### Testbed — `MockHermes`

For unit testing harnesses without a running Hermes Core:

```typescript
import { MockHermes } from "@get-h3/h3-harness-sdk";

const mock = new MockHermes(myHarness);

// Send a user message → get the harness's Decision
const decision = await mock.sendMessage("Do something");

// Send a tool result back → get the next Decision
const next = await mock.sendResult({
  type: "tool_result",
  tool_name: "read_file",
  data: { content: "file contents" },
  duration_ms: 42,
  success: true,
});

// Cancel the current turn
const cancelled = await mock.cancel();
```

**⚠️ Session state footgun:** `sendMessage`, `sendResult`, and `cancel` accept an
optional `sessionId` — if you omit it, a **fresh random UUID is generated for
every call**. Harnesses that keep state keyed on `session_id` (via
`context.session_state`) would silently see a NEW session on each call, losing
their state and producing wrong decisions.

**Thread the same session id across the calls of one conversation:**

```typescript
const sessionId = crypto.randomUUID();

// Turn 1 — the harness records session_state for `sessionId`
const decision = await mock.sendMessage("Do something", sessionId);

// Turn 2 — same session id → the harness sees the state from turn 1
const next = await mock.sendResult(
  {
    type: "tool_result",
    tool_name: "read_file",
    data: { content: "file contents" },
    duration_ms: 42,
    success: true,
  },
  sessionId,
);

// Cancel — same session id, so the harness resolves the right session
const cancelled = await mock.cancel(sessionId);
```

`sendResult` also takes an optional third argument `decisionId` (omitted above —
a UUID is auto-generated then, which is fine unless the harness matches on
`decision_id`).

## Examples

### Minimal Harness

The smallest possible harness — a single `finished: true` text response per
turn. Minimal by design: it does **not** handle partial turns, so it is not
battery-complete on its own (see [Echo Harness](#echo-harness)).

```typescript
import { Hono } from "hono";
import {
  createH3Router,
  type Harness,
  type Decision,
  type HealthResponse,
} from "@get-h3/h3-harness-sdk";

class MinimalHarness implements Harness {
  async onProcess(): Promise<Decision> {
    return {
      decision: "text",
      decision_id: crypto.randomUUID(),
      history: [],
      text: { content: "Hello from TypeScript!", finished: true },
    };
  }
  async onResult(): Promise<Decision> {
    return {
      decision: "end",
      decision_id: crypto.randomUUID(),
      history: [],
      end: { reason: "task_complete" },
    };
  }
  health(): HealthResponse {
    return {
      status: "ok",
      version: "0.1.0",
      transport: "rest",
      protocol_version: "1.0",
      capabilities: ["text", "end"],
    };
  }
}

const app = new Hono();
app.route("/", createH3Router(new MinimalHarness()));
export default app;
```

### Partial turns — `finished: false`

`text.finished` tells the shim whether this decision completes the turn:

- `finished: true` — final response. The shim delivers the text and the turn ends.
- `finished: false` — partial response. The harness signals it still has work
  (a thought in progress, tool calls pending); the session continues with
  another `onProcess` call.

A harness that always returns `finished: true` fails the h3-test
`process_text_finished_false` region: the battery sends messages such as
`"start a thought..."`, `"do not finish"`, or text ending in `"..."` and expects
a `finished: false` text decision. Mark a turn partial whenever the response is
not the user-visible final answer — e.g. while the model is "thinking" across
multiple `onProcess` calls.

See the [Echo Harness](#echo-harness) example for the exact pattern.

### Echo Harness

The **compliance reference** for the h3-test battery (44/44): it implements
partial-turn handling, so `text.finished` is `false` when the user's message
indicates the thought is not complete:

```typescript
class EchoHarness implements Harness {
  async onProcess(req: ProcessRequest): Promise<Decision> {
    const content = req.message.content.toLowerCase();
    const isPartial =
      content.includes("do not finish") ||
      content.includes("start a thought") ||
      content.endsWith("...") ||
      content.includes("incomplete") ||
      content.includes("partial");
    return {
      decision: "text",
      decision_id: crypto.randomUUID(),
      text: {
        content: `You said: ${req.message.content}`,
        finished: !isPartial,
      },
    };
  }
  // ... onResult + health same as MinimalHarness
}
```

Full source in [`src/examples/`](src/examples/). Verify compliance live:

```bash
npx tsx src/examples/echo.ts &
h3-test --endpoint http://localhost:9191
```

## Development

```bash
# Install dependencies
npm ci

# Build
npm run build        # tsc

# Type check
npm run lint         # tsc --noEmit

# Run tests
npm test             # vitest run

# Format
npm run fmt          # prettier --write 'src/**/*.ts'
```

### Quality Gates

- **GitReins** quality gate mandatory for all commits
- Must pass `h3-test` from `get-h3/shim` before release

## Package Structure

```
src/
├── protocol.ts       # Zod schemas + TypeScript types (v1 JSON Schema)
├── harness.ts        # Harness interface + Hono router (6 endpoints)
├── middleware.ts      # Request logging + error handling
├── testbed.ts        # MockHermes for vitest/jest
├── index.ts          # Public API exports
└── examples/
    ├── minimal.ts    # Bare minimum harness example
    └── echo.ts       # Echo harness example
```

## License

MIT

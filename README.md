# @get-h3/h3-harness-sdk

TypeScript SDK for building H3-compliant agent harnesses. Works with Node, Bun, Deno.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

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

## Quickstart

```typescript
import { Hono } from 'hono';
import { createH3Router, type Harness, type Decision } from '@get-h3/h3-harness-sdk';

class MyHarness implements Harness {
  async onProcess(): Promise<Decision> {
    return {
      decision: 'text',
      decision_id: crypto.randomUUID(),
      text: { content: 'Hello from TypeScript!', finished: true },
    };
  }
  async onResult(): Promise<Decision> {
    return { decision: 'end', decision_id: crypto.randomUUID(), end: { reason: 'task_complete' } };
  }
  health() {
    return { status: 'ok', version: '1.0.0', transport: 'rest', protocol_version: '1.0', capabilities: ['text', 'end'] };
  }
}

const app = new Hono();
app.route('/', createH3Router(new MyHarness()));
export default app;
```

> **Type-only exports:** enum-like names such as `DecisionType` are exported as
> TypeScript types only (runtime validation happens via the companion Zod
> schemas, e.g. `DecisionTypeSchema`). Use the string literals shown above
> (`'text'`, `'end'`) in decision payloads — importing `DecisionType` as a
> value throws a SyntaxError at module load. See [Minimal Harness](#minimal-harness)
> and `src/examples/echo.ts` for the battery-passing pattern.

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

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/health` | Health check — calls `harness.health()` |
| `POST` | `/v1/process` | Process a user message — calls `harness.onProcess()` |
| `POST` | `/v1/result` | Return tool/LLM results — calls `harness.onResult()` |
| `POST` | `/v1/cancel` | Cancel the current turn — calls `harness.onCancel()` |
| `GET` | `/v1/sessions/:id` | Get session status |
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
      { "type": "image", "url": "https://example.com/a.png", "mime_type": "image/png" }
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
    "tools": [{ "name": "read_file", "description": "Read a file", "parameters": { "path": { "type": "string" } } }],
    "models": [{ "name": "deepseek-v4-flash", "provider": "deepseek", "context_window": 131072 }],
    "memory": "persistent session memory",
    "skills": ["coding-hermes"],
    "config": { "max_iterations": 100, "timeout_seconds": 60, "temperature": 0.7 },
    "session_state": { "turn_count": 2, "total_tool_calls": 3, "total_llm_calls": 2, "cost_so_far": 0.0012, "started_at": "2026-08-05T11:59:00Z" }
  }
}
```

Defaults: `message.role` = `"user"`; `identity.user_name` / `user_id` = `"unknown"`; `context.history` / `tools` / `models` = `[]`; `config.max_iterations` = `100`, `config.timeout_seconds` = `60`; `session_state` counters = `0`.

Response (`200`) — a `Decision`. `history` is echoed back from `context.history`:

```json
{
  "decision": "text",
  "decision_id": "9b2e4f1a-6c3d-4e8b-9a2f-1c5d7e9b0a3f",
  "history": [{ "role": "user", "content": "Do something" }],
  "text": { "content": "Hello from TypeScript!", "finished": true }
}
```

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
import { addMiddleware, requestLogger } from '@get-h3/h3-harness-sdk';

// Option 1: add logging middleware to an existing Hono app
addMiddleware(app);

// Option 2: use the raw middleware directly
app.use('*', requestLogger);
```

`requestLogger` logs each request with method, path, status, and duration in ms.
On exceptions, it catches the error and returns a 500 JSON response in H3 `ErrorResponse` format.

**Important:** Call `addMiddleware()` BEFORE adding routes — middleware order matters.

### Protocol Types

All H3 v1 protocol types are exported with matching Zod schemas:

| Category | Exports |
|----------|---------|
| **Enums** | `DecisionType`, `EndReason`, `CancelReason`, `ResultType`, `SessionStatus`, `ErrorCode`, `HealthStatus`, `AttachmentType`, `MessageRole`, `Capability` |
| **Common** | `Attachment`, `Message`, `Identity`, `HistoryEntry`, `Tool`, `Model`, `SessionState`, `Config`, `Context` |
| **Decisions** | `ToolCall`, `LLMMessage`, `LLMCall`, `TextResponse`, `Wait`, `Delegate`, `End` |
| **Requests** | `ProcessRequest`, `ResultPayload`, `ResultRequest`, `CancelRequest` |
| **Responses** | `HealthResponse`, `ErrorDetail`, `ErrorResponse`, `SessionResponse` |
| **Top-level** | `Decision` |

Each type has a companion Zod schema (e.g., `ProcessRequestSchema`) for runtime validation.

### Testbed — `MockHermes`

For unit testing harnesses without a running Hermes Core:

```typescript
import { MockHermes } from '@get-h3/h3-harness-sdk';

const mock = new MockHermes(myHarness);

// Send a user message → get the harness's Decision
const decision = await mock.sendMessage('Do something');

// Send a tool result back → get the next Decision
const next = await mock.sendResult({
  type: 'tool_result',
  tool_name: 'read_file',
  data: { content: 'file contents' },
  duration_ms: 42,
  success: true,
});

// Cancel the current turn
const cancelled = await mock.cancel();
```

## Examples

### Minimal Harness

```typescript
import { Hono } from 'hono';
import { createH3Router, type Harness, type Decision, type HealthResponse } from '@get-h3/h3-harness-sdk';

class MinimalHarness implements Harness {
  async onProcess(): Promise<Decision> {
    return {
      decision: 'text',
      decision_id: crypto.randomUUID(),
      text: { content: 'Hello from TypeScript!', finished: true },
    };
  }
  async onResult(): Promise<Decision> {
    return { decision: 'end', decision_id: crypto.randomUUID(), end: { reason: 'task_complete' } };
  }
  health(): HealthResponse {
    return { status: 'ok', version: '0.1.0', transport: 'rest', protocol_version: '1.0', capabilities: ['text', 'end'] };
  }
}

const app = new Hono();
app.route('/', createH3Router(new MinimalHarness()));
export default app;
```

### Echo Harness

```typescript
class EchoHarness implements Harness {
  async onProcess(req: ProcessRequest): Promise<Decision> {
    return {
      decision: 'text',
      decision_id: crypto.randomUUID(),
      text: { content: `You said: ${req.message.content}`, finished: true },
    };
  }
  // ... onResult + health same as MinimalHarness
}
```

Full source in [`src/examples/`](src/examples/).

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

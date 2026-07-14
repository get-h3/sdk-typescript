# @get-h3/h3-harness-sdk

TypeScript SDK for building H3-compliant agent harnesses. Works with Node, Bun, Deno.

[![npm version](https://img.shields.io/npm/v/@get-h3/h3-harness-sdk)](https://www.npmjs.com/package/@get-h3/h3-harness-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Install

```bash
npm install @get-h3/h3-harness-sdk
# or
bun add @get-h3/h3-harness-sdk
```

## Quickstart

```typescript
import { Hono } from 'hono';
import { Harness, Decision, DecisionType, createH3Router } from '@get-h3/h3-harness-sdk';

class MyHarness implements Harness {
  async onProcess(req) {
    return {
      decision: DecisionType.TEXT,
      decision_id: crypto.randomUUID(),
      text: { content: 'Hello from TypeScript!', finished: true },
    };
  }
  async onResult(req) {
    return { decision: DecisionType.END, decision_id: crypto.randomUUID(), end: { reason: 'task_complete' } };
  }
  health() {
    return { status: 'ok', version: '1.0.0', transport: 'rest', protocol_version: '1.0', capabilities: ['text', 'end'] };
  }
}

const app = new Hono();
app.route('/', createH3Router(new MyHarness()));
export default app;
```

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

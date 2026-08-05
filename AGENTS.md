# AGENTS.md — H3 SDK for TypeScript

TypeScript SDK for building H3-compliant agent harnesses. Works with Node, Bun, Deno.

## Install

```bash
npm install @get-h3/h3-harness-sdk
# or
bun add @get-h3/h3-harness-sdk
```

## Quickstart

```typescript
import { Hono } from "hono";
import {
  createH3Router,
  type Harness,
  type Decision,
} from "@get-h3/h3-harness-sdk";

class MyHarness implements Harness {
  async onProcess(): Promise<Decision> {
    return {
      decision: "text",
      decision_id: crypto.randomUUID(),
      text: { content: "Hello from TypeScript!", finished: true },
    };
  }
  async onResult(): Promise<Decision> {
    return {
      decision: "end",
      decision_id: crypto.randomUUID(),
      end: { reason: "task_complete" },
    };
  }
  health() {
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
> value throws a SyntaxError at module load. See `src/examples/echo.ts` for
> the battery-passing pattern.

## Package Structure

- `protocol.ts` — Zod schemas + TypeScript types (generated from get-h3/protocol JSON Schema)
- `harness.ts` — Harness interface + Hono router
- `testbed.ts` — MockHermes for vitest/jest

## Development

- GitReins quality gate mandatory
- Must pass `h3-test` from get-h3/shim before release

## Reference

Spec: `get-h3/h3` → `specs/04-SDK-Libraries.md`

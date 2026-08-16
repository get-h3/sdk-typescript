# AGENTS.md — H3 SDK for TypeScript

TypeScript SDK for building H3-compliant agent harnesses. Works with Node, Bun, Deno.

> **Runtime support:** the SDK is **ESM-only** — there is no CommonJS build,
> and `require()` of the package throws `ERR_REQUIRE_ESM` on Node < 20.19
> (CommonJS consumers should use dynamic `import()`). The CI matrix runs
> **Node 20/22 only** (CI-tested). The "Works with Node, Bun, Deno" tagline
> is aspirational for Bun/Deno — Bun's install path is documented but its
> test runner is not CI-covered, and Deno has no documented install path
> (ESM/Zod 4 resolution unverified). See the README "Runtime support"
> section for the full status table and limitations.

## Install

> **Not yet published to the npm registry.** The command below is the intended route
> once published; until then use the GitHub route below.

```bash
npm install @get-h3/h3-harness-sdk
# or
bun add @get-h3/h3-harness-sdk
```

### From GitHub (works today)

```bash
npm install github:get-h3/sdk-typescript
# or
bun add github:get-h3/sdk-typescript
```

The package's `prepare` script builds `dist/` automatically on install.

### From source

```bash
git clone https://github.com/get-h3/sdk-typescript
cd sdk-typescript
npm ci && npm run build
```

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
> value throws a SyntaxError at module load. See `src/examples/echo.ts` for
> the battery-passing pattern.

> **Compliance reference:** the Quickstart above is the minimal hello-world —
> it always returns `finished: true`, so it does NOT satisfy the h3-test
> battery's partial-turn region (`process_text_finished_false`). For a
> battery-passing harness, use `src/examples/echo.ts` as the reference
> implementation: it demonstrates the `finished: false` partial-turn
> semantics (mark a turn partial whenever the response is not the
> user-visible final answer). See the README's "Partial turns — finished:
> false" section for details.

## Package Structure

- `protocol.ts` — Zod schemas + TypeScript types (generated from get-h3/protocol JSON Schema)
- `harness.ts` — Harness interface + Hono router
- `testbed.ts` — MockHermes for vitest/jest

## Development

- GitReins quality gate mandatory
- Must pass `h3-test` from get-h3/shim before release

## Reference

Spec: `get-h3/h3` → `specs/04-SDK-Libraries.md`

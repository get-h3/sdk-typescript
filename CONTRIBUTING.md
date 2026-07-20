# Contributing to H3 SDK for TypeScript

TypeScript SDK for building H3-compliant agent harnesses. Implements the harness side of the H3 protocol using Zod + Hono. Works with Node, Bun, and Deno.

## Development Setup

```bash
cd sdk-typescript/
npm install
# or: bun install
```

## Package Structure

```
sdk-typescript/
├── src/
│   ├── protocol.ts     # Zod schemas + TypeScript types (generated from protocol JSON Schema)
│   ├── harness.ts      # Harness interface + Hono router
│   ├── middleware.ts    # Request logging middleware
│   ├── testbed.ts      # MockHermes for vitest/jest
│   └── index.ts        # Public exports
├── src/__tests__/
│   ├── protocol.test.ts    # 43 tests
│   ├── harness.test.ts     # 16 tests
│   ├── testbed.test.ts     # 8 tests
│   ├── middleware.test.ts  # 3 tests
│   └── index.test.ts       # 21 tests
└── examples/
    ├── echo/           # Echo harness (returns messages back)
    └── minimal/        # Bare-minimum example
```

## Before Making Changes

### Run Tests

```bash
npm test
# or: bun test
# 91 tests across 5 test files
```

### Run Type Check

```bash
npx tsc --noEmit
```

### Run the Test Battery

```bash
# Start the echo example in one terminal:
npx tsx examples/echo/index.ts

# In another terminal, run the compliance test battery:
h3-test --endpoint http://localhost:9191
# 43 compliance tests, exit code 0 = compliant
```

### Sync Protocol Types

If the upstream protocol changed:

```bash
npm run sync-protocol
```

This regenerates `src/protocol.ts` from `get-h3/protocol` schemas. Never hand-edit generated Zod schemas.

## Making Changes

### Harness Interface

- `harness.ts` defines the `Harness` interface with `onProcess`, `onResult`, and `health`
- Changes to the interface are MAJOR — they break all existing harnesses
- New optional hooks should use separate interfaces

### Hono Router

- `createH3Router()` builds a Hono router with `/v1/health`, `/v1/process`, `/v1/result`
- Must follow the H3 protocol exactly — see `get-h3/protocol/h3-protocol.yaml`
- All endpoints log METHOD /path STATUS DURATION via middleware

### Middleware

- `middleware.ts` provides `requestLogger` middleware
- Logs structured request info without leaking credentials

### Zod Schemas

- Zod schemas define both runtime validation and TypeScript types via `z.infer`
- Must match JSON Schema constraints from `get-h3/protocol/schemas/v1/`
- Use `.optional()` for protocol-optional fields
- Use `.passthrough()` to allow unknown fields without stripping them

### Testbed

- `testbed.ts` provides `MockHermes` for unit testing harness logic
- Simulates the Hermes-side of the protocol — process → execute → result loop
- Used by all test files to verify harness behavior

## Quality Gates

### Pre-Commit

```bash
npx tsc --noEmit     # Type check
npm test             # Tests (91)
npm run lint         # ESLint
```

### CI Pipeline

GitHub Actions runs on every PR:
1. Type check (`tsc --noEmit`)
2. Lint (ESLint)
3. Tests (vitest, 91 tests)
4. `h3-test --endpoint http://localhost:9191` (against echo example)

All must pass.

## Known Issues

- **process_preserves_history (QV-E2E-03):** The TS echo harness currently fails one test battery check — message history shrinks from 4 to 0 across turns. See the umbrella board at `get-h3/h3` for tracking.

## Release

```bash
git tag v1.0.0
git push origin v1.0.0
# CI publishes to npm automatically
```

## Review Checklist

- [ ] `npm test` passes (91 tests)
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] `h3-test --endpoint http://localhost:9191` passes against echo example
- [ ] New Zod fields use `.optional()` where appropriate
- [ ] Protocol changes regenerated via `npm run sync-protocol`
- [ ] No hand-edits to generated schemas

## Questions?

See the umbrella project at [get-h3/h3](https://github.com/get-h3/h3) for architecture, specs, and the cross-repo task board.

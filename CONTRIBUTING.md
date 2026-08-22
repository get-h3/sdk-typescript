# Contributing to H3 SDK for TypeScript

TypeScript SDK for building H3-compliant agent harnesses. Implements the harness side of the H3 protocol using Zod + Hono.

> **Runtime support:** the CI matrix runs **Node 20/22 only** (CI-tested). Bun's
> install path is documented but not CI-covered, and Deno has no documented
> install path — see the README "Runtime support" section for the full status
> table and limitations.

## Development Setup

```bash
cd sdk-typescript/
npm ci
# or: npm install
```

## Package Structure

```
sdk-typescript/
├── src/
│   ├── protocol.ts          # Zod schemas + TypeScript types (generated from protocol JSON Schema)
│   ├── harness.ts           # Harness interface + Hono router
│   ├── middleware.ts        # Request logging middleware
│   ├── testbed.ts           # MockHermes for vitest/jest
│   ├── index.ts             # Public exports
│   └── examples/
│       ├── echo.ts          # Battery-passing echo harness (h3-test 44/44)
│       └── minimal.ts       # Bare-minimum example
├── src/__tests__/           # 6 test files, 144 tests (harness, index, middleware,
│                            #   protocol, schema-validation, testbed)
├── scripts/
│   └── generate-schemas.ts  # Regenerates src/protocol.ts from protocol schemas
└── .github/workflows/       # CI: build-and-test + e2e-battery; protocol regeneration
```

## Before Making Changes

### Run Tests

```bash
npm test
# vitest — 144 tests across 6 test files
```

### Run Type Check

```bash
npx tsc --noEmit
```

### Format

```bash
npx prettier --check 'src/**/*.ts'
# fix: npx prettier --write 'src/**/*.ts'
```

### Run the Test Battery

The h3-test compliance battery (44 tests, exit code 0 = H3-compliant) runs
against a live harness endpoint. The compliance reference implementation is
`src/examples/echo.ts` — it implements the `finished: false` partial-turn
semantics the battery requires:

```bash
# Start the echo harness in one terminal (default port 9191):
npx tsx src/examples/echo.ts

# If :9191 is already taken, override the port with PORT:
PORT=9876 npx tsx src/examples/echo.ts

# In another terminal, run the compliance test battery:
h3-test --endpoint http://localhost:9191
# 44 compliance tests, exit code 0 = compliant
```

## Making Changes

### Harness Interface

- `harness.ts` defines the `Harness` interface with `onProcess`, `onResult`, and `health`
- Changes to the interface are MAJOR — they break all existing harnesses
- New optional hooks should use separate interfaces

### Hono Router

- `createH3Router()` builds a Hono router with `/v1/health`, `/v1/process`, `/v1/result`, `/v1/cancel`, `/v1/sessions/:id`
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

### Regenerating Protocol Types

If the upstream protocol changed, regenerate `src/protocol.ts` from the
`get-h3/protocol` schemas:

```bash
npx tsx scripts/generate-schemas.ts --protocol-dir ../protocol/schemas/v1
npx prettier --write src/protocol.ts
```

`src/protocol.ts` is generated — never hand-edit it. The regeneration workflow
runs in CI when the protocol schemas change. The generator is idempotent:
regenerate + prettier must yield zero diff on `src/protocol.ts`.

#### `.schemas-changed` sentinel lifecycle

The generator writes a gitignored sentinel file (`.schemas-changed`, repo root)
when the regenerated output differs from `src/protocol.ts`, and removes it when
the output matches. CI (`sync-protocol.yml`) runs the generator in a fresh
checkout and fails the schema-alignment check if the sentinel exists — that is
the signal that `src/protocol.ts` must be committed.

`npm run generate` clears the sentinel automatically after a successful run, so
a leftover `.schemas-changed` containing `true` after a completed regen + commit
is a stale flag, not pending work. If you invoke
`npx tsx scripts/generate-schemas.ts` directly instead (e.g. with
`--protocol-dir`), delete the sentinel yourself after committing the regenerated
`src/protocol.ts`:

```bash
rm -f .schemas-changed
```

Never commit the sentinel — it is gitignored by design and only meaningful on a
local checkout or in CI's fresh clone.

### Testbed

- `testbed.ts` provides `MockHermes` for unit testing harness logic
- Simulates the Hermes-side of the protocol — process → execute → result loop
- Used by all test files to verify harness behavior

## Quality Gates

### Pre-Commit

```bash
npx tsc --noEmit     # Type check
npm test             # Tests (141)
npx prettier --check 'src/**/*.ts'
```

### CI Pipeline

GitHub Actions runs on every push/PR to `main`:

1. `build-and-test` (Node 20/22 matrix): `tsc --noEmit`, build, dist import smoke, vitest
2. `e2e-battery` (Node 22): starts `src/examples/echo.ts` on :9191 and runs `h3-test --endpoint http://localhost:9191` — gates on 44/44

All must pass.

## Release

The package is **not yet published to the npm registry** — install via the
GitHub route (`npm install github:get-h3/sdk-typescript`) until it is. When
releasing:

```bash
npm run build
npm pack --dry-run   # verify the tarball ships dist/
git tag v1.0.0
git push origin v1.0.0
```

`npm publish` is manual (registry auth required); CI does not publish.

## Review Checklist

- [ ] `npm test` passes (144 tests)
- [ ] `npx tsc --noEmit` passes
- [ ] `npx prettier --check 'src/**/*.ts'` passes
- [ ] `h3-test --endpoint http://localhost:9191` passes 44/44 against `src/examples/echo.ts`
- [ ] New Zod fields use `.optional()` where appropriate
- [ ] Protocol changes regenerated via `scripts/generate-schemas.ts` and prettier-normalized
- [ ] No hand-edits to generated schemas

## Questions?

See the umbrella project at [get-h3/h3](https://github.com/get-h3/h3) for architecture, specs, and the cross-repo task board.

# Changelog

All notable changes to the H3 TypeScript SDK.

## [0.1.0] — 2026-07-19

### Added
- `protocol.ts`: Zod schemas + TypeScript types generated from H3 JSON Schema
- `harness.ts`: Harness interface + Hono router
- `testbed.ts`: MockHermes for vitest/jest
- Echo example harness (src/examples/echo.ts)
- Structured access logging
- Zod→JSON Schema validation via ajv
- GitReins quality gate
- Hilo code graph

### Fixed
- Zod validation errors return `INVALID_REQUEST` instead of `INTERNAL_ERROR` (GAP-014)
- `exports` field added to package.json so subpath imports resolve (GAP-016)
- h3-test compliance battery wired into CI (GAP-017)

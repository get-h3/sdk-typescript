# Changelog

All notable changes to the H3 TypeScript SDK.

## [Unreleased] — 2026-08-22

### Fixed
- Harness-returned Decisions are now validated against `DecisionSchema`; malformed decisions (old `tool_name`/`arguments`/`call_id` shape, invalid type) return `500 INVALID_DECISION` with the Zod issues instead of passing through silently (GAP-033)
- `docs/dogfood/2026-08-04-integration.md` harness example rewritten to the current `{name, params}` tool-call shape (GAP-034)
- README "Defaults" paragraph now states that `identity`, `context`, `context.config` and `context.session_state` are required objects; only inner fields default (GAP-036)
- README/AGENTS.md document the ESM-only constraint (`ERR_REQUIRE_ESM` on Node < 20.19, dynamic `import()` fallback); `package.json` exports gained an explicit `import` condition and `engines.node >= 20` (GAP-042)
- README Errors section scopes `400 INVALID_REQUEST` to request-body validation and cross-references the `500 INVALID_DECISION` decision-validation path (GAP-043)
- README/AGENTS.md compliance-reference blocks point GitHub-route consumers at the delivered example path: `import '@get-h3/h3-harness-sdk/examples/echo'` or `node_modules/@get-h3/h3-harness-sdk/dist/examples/echo.js` (GAP-044)
- README Wire Shapes gained `tool_call`/`llm_call`/`wait`/`delegate` decision response examples (GAP-035); DELETE `/v1/sessions/:id` returns `404 SESSION_NOT_FOUND` for unknown sessions (GAP-037); "Serving your harness" notes `@types/node` for tsc consumers (GAP-038)

### Dependencies — 2026-09-22 (SDKTS-DEPS-02)
- **TypeScript 5.9.3 → 7.0.2** and **vitest / `@vitest/coverage-v8` 4.1.11 → 5.0.1**, both devDependencies; `package.json` and `package-lock.json` move together. No production dependency changed (`hono`, `zod` and the `overrides` pins are untouched) and no other direct dependency moved.
- **Build config:** `tsconfig.json` now sets `"types": ["node"]`. TypeScript 7 no longer auto-includes every package under `node_modules/@types` (the default became `[]` in the 6.0 line), so the previous config failed the build with `TS2591: Cannot find name 'process'` / `'node:url'` in `src/examples/echo.ts`. Contributors who copy this tsconfig should keep that line; the published declarations already resolve their own types and are unaffected.
- **Consumer-visible emission:** `dist/protocol.d.ts` is the only emitted file that changes — TS 7 declaration emit lists Zod enum members alphabetically instead of in source order. Runtime JavaScript is byte-identical and the types are structurally identical (member order affects declaration display only, not assignability), so no consumer code change is required; downstream declaration snapshots (e.g. api-extractor baselines) may show ordering churn. The package's own `engines.node: ">=20"` is unchanged.
- **Contributor Node floor:** effectively unchanged at Node ≥ 20.19 — that was already Vite's `engines` requirement before this bump. vitest 5 declares `engines.node: ^22.12.0 || ^24.0.0 || >=26.0.0` (vitest 4 declared `^20.0.0`), so `npm ci` on Node 20.19 prints an `EBADENGINE` warning; install and suite were verified green on Node 20.19.4 and Node 22, and the CI matrix (20/22) is unchanged. Node ≥ 22.12 avoids the warning.
- Gates re-run on the new toolchain: `npm run build`, `npx tsc --noEmit`, `npm test` and `npm run verify-counts` all green, and the v8 coverage thresholds still fail the run when unmet (probed).

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

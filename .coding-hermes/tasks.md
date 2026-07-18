# Task Board — H3 SDK
## [x] INIT — Verify project structure, dependencies, and DuckBrain namespace
   - npm ci ✅ (82 packages), tsc --noEmit ✅, vitest ❌ (no test files)
   - All source files are empty stubs (comments only) — no implementation
   - DuckBrain namespace empty — no prior project memory
   - File structure uses subdirectories (protocol/index.ts) vs spec's flat files (protocol.ts)

## [x] SPEC — Full SDK implementation per spec §4 (protocol.ts, harness.ts, middleware.ts, testbed.ts, examples/)
   - Commit: `8048423` — 11 files, +858/-9, glm-5.2 @ zai-glm worker
   - [x] SPEC.1: protocol.ts — TypeScript types + Zod schemas for all H3 types (§4.2) — 310 lines, 30+ exports
   - [x] SPEC.2: harness.ts — Harness interface + Hono router (§4.3, §4.4) — 183 lines, 6 endpoints
   - [x] SPEC.3: middleware.ts — Error handling + request logging middleware — 54 lines
   - [x] SPEC.4: testbed.ts — MockHermes for vitest (§6) — 118 lines
   - [x] SPEC.5: examples/minimal.ts — bare minimum harness example — 45 lines
   - [x] SPEC.6: examples/echo.ts — echo harness example — 48 lines
   - [x] SPEC.7: index.ts — public API exports — 102 lines
   - Structure migrated from subdirectories to flat files per spec §4.1

## [x] DOC — Generate/update SDK documentation
   - Commit: `eb8fff4` — README.md (226 lines, API reference, quickstart, examples), LICENSE (MIT), package-lock.json
## [x] TEST — Test coverage for all 5 source modules (foreman-direct, 90 tests)
   - vitest.config.ts, src/__tests__/{protocol,harness,middleware,testbed,index}.test.ts
   - 90 tests across 5 files, all passing, guard PASS
## [x] CI — Verify CI pipeline health
   - Created .github/workflows/ci.yml — Node 20/22, npm ci, tsc --noEmit, vitest run
   - Pushes to main trigger CI, PR CI also configured
## [x] E2E — h3-test compliance battery (43/43 passes)
   - h3-test from get-h3/shim runs against echo harness on :9192
   - 6 Zod schema fixes: message.timestamp optional, identity defaults (user_name/user_id),
     config defaults (max_iterations/timeout_seconds), session_state.started_at optional
   - Session tracking: known sessions tracked, unknown sessions return 404
   - Context echo: process response includes context.history from incoming request
   - Echo harness: finished=false for streaming indicators ("do not finish", "...")
   - Commit: `06283ea` — 6 files, +96/-12, foreman-direct

## [x] P5-04 — Sync-protocol workflow: regenerate → test → release
- [x] Create `scripts/generate-schemas.ts` — JSON Schema → Zod TypeScript generator
  - Reads 14 schema files from get-h3/protocol/schemas/v1/
  - Generates src/protocol.ts with Zod schemas + TypeScript types
  - Handles $ref resolution (definitions + cross-file), discriminated unions
  - Extracts enums from nested properties + definitions
  - Flag file (.schemas-changed) for CI detection
- [x] Create `.github/workflows/sync-protocol.yml`
  - Triggered by `repository_dispatch` (schema-updated) or `workflow_dispatch`
  - check-schema-alignment job: regenerate → tsc --noEmit → vitest → diff check
  - release job (workflow_dispatch only): regenerate → test → commit → tag → npm publish
  - Fails with actionable message when schemas have changed, requiring manual review
- [x] Generator produces valid TypeScript (compiles clean), 91/91 tests pass with current protocol.ts
- [x] Verified: npx tsx scripts/generate-schemas.ts --protocol-dir ../protocol/schemas/v1 — OK

**Commit:** foreman-direct

**Spec ref:** S08 (Cross-Repo Release Pipeline)

## [ ] P5-05 — Generator fidelity: reconcile generate-schemas.ts output with hand-written protocol.ts
- [ ] Discovery: P5-04 generator produces different Zod output than current protocol.ts
  - 151 insertions, 139 deletions diff
  - 11 test failures when running generated output
  - Root cause: SessionState fields (turn_count, total_tool_calls, cost_so_far, history, tools, models) are treated as required by generator but had defaults in hand-written version. Also `temperature` type mismatch (float vs integer).
- [ ] Either fix generator to match current passing interpretation, OR update tests to match generator's stricter schema interpretation
- [ ] Verify: 91/91 tests pass with unified protocol.ts, generator output matches committed version

**Found:** Foreman idle tick #1 (2026-07-18)

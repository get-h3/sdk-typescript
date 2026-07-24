# H3 SDK TypeScript — Model Router Task Matrix

> **Core purpose:** TypeScript SDK for the H3 protocol — Zod schemas, Hono router harness interface, test bed (MockHermes), examples, protocol schema sync generator.
> **Language:** TypeScript | **Tests:** 91/91 pass | **Build:** tsc clean | **Status:** Production-complete, 17th+ consecutive idle tick

```
ID | Task | Pri | Cpx | Deps | Tags | Model | Reasoning | Fallback
```

## Completed

| ID | Task | Pri | Cpx | Deps | Tags | Model | Reasoning | Fallback |
|----|------|-----|-----|------|------|-------|-----------|----------|
| INIT | ✅ Verify project structure, dependencies, and DuckBrain namespace | DONE | 1 | — | infra,init | DeepSeek V4 Flash | ✅ Done | — |
| SPEC | ✅ Full SDK implementation per spec §4 — 11 files, +858/-9 (protocol.ts, harness.ts, middleware.ts, testbed.ts, examples/) | DONE | 5 | — | spec,implementation | DeepSeek V4 Pro | ✅ Done (8048423) | — |
| DOC | ✅ Generate/update SDK documentation — README.md (226 lines), LICENSE, package-lock.json | DONE | 2 | — | documentation | GPT-5.6 Terra | ✅ Done (eb8fff4) | — |
| TEST | ✅ Test coverage for all 5 source modules — 90 tests across 5 files, all passing | DONE | 3 | — | testing | Step 3.7 Flash | ✅ Done | — |
| CI | ✅ Verify CI pipeline health — GitHub Actions with Node 20/22 matrix | DONE | 2 | — | ci | DeepSeek V4 Flash | ✅ Done | — |
| E2E | ✅ h3-test compliance battery (43/43 passes) — 6 Zod schema fixes, session tracking, context echo, echo harness streaming | DONE | 4 | — | e2e,compliance | GPT-5.6 Luna | ✅ Done (06283ea) | — |
| P5-04 | ✅ Sync-protocol workflow: regenerate → test → release. JSON Schema → Zod TypeScript generator, CI pipeline with schema alignment check. | DONE | 4 | — | sync,ci,generator | DeepSeek V4 Pro | ✅ Done | — |
| P5-05 | ✅ Generator fidelity: reconcile generate-schemas.ts output with hand-written protocol.ts. Added FIELD_OVERRIDES, fixed integer/number handling, CI verified deterministic. | DONE | 3 | — | sync,generator,fidelity | DeepSeek V4 Pro | ✅ Done (18808b6) | — |
| MAINT-01 | ✅ Upgrade vitest 1.6 → 3.2.6+ to resolve critical CVSS 9.8 + kernel 7.0.0 compat | DONE | 3 | — | deps,security,upgrade | DeepSeek V4 Pro | ✅ Done (b8b4a13) — gpt-5.6-sol | — |
| MAINT-02 | ✅ Coverage reporting — @vitest/coverage-v8, thresholds 50%. Coverage: 94.59%/75%/100%/94.54%. | DONE | 2 | — | testing,coverage | DeepSeek V4 Flash | ✅ Done (cf4b8e1) | — |
| MAINT-03a | ✅ Upgrade zod 3.25→4.4 — migrate `z.string().uuid()`→`z.uuid()`, 91/91 tests pass | DONE | 2 | — | deps,zod,upgrade | DeepSeek V4 Flash | ✅ Done | — |
| MAINT-03b | ✅ Upgrade vitest + @vitest/coverage-v8 3.2.7→4.1.10 — config compatible as-is, 91/91 tests | DONE | 2 | — | deps,vitest,upgrade | DeepSeek V4 Flash | ✅ Done (868fef9) | — |
| MAINT-03c | ✅ Upgrade @types/node 20→26 — tsc --noEmit clean | DONE | 1 | — | deps,types,upgrade | DeepSeek V4 Flash | ✅ Done | — |
| MAINT-04 | ✅ Generator FIELD_OVERRIDES fix — 3 bugs: currentDefName never set, integer/number conflated, REPLACE checked after enum early-exit. Generator now byte-identical to protocol.ts, idempotent. | DONE | 4 | — | quality,generator,fix | MiniMax M3 | ✅ Done (c56f1b6) | — |

## Active — Maintenance

| ID | Task | Pri | Cpx | Deps | Tags | Model | Reasoning | Fallback |
|----|------|-----|-----|------|------|-------|-----------|----------|
| MAINT-03d | TypeScript 7.0 upgrade — DEFERRED. Go-based native compiler (`tsgo`). Risk of subtle type inference differences, declaration emit changes, ecosystem immaturity too high for stable SDK. Monitor TS 7.1+ release. | LOW | 1 | — | deps,typescript,deferred | DeepSeek V4 Flash | Simple: deferred, monitoring only | — |

## Known Issues

| ID | Task | Pri | Cpx | Deps | Tags | Model | Reasoning | Fallback |
|----|------|-----|-----|------|------|-------|-----------|----------|
| GITREINS-FALSE-NEG | GitReins guard false-negative: runs pytest on TS repo (config says `tests: enabled: false` but MCP ignores). Pre-commit hook. | LOW | 1 | — | known-issue,guard | DeepSeek V4 Flash | Simple: known issue, no action needed | — |
| COOLDOWN-REVERSION | Fleet TOML `ApplyFleetConfig` cooldown reversion — 7th+ occurrence since tick #19. API-set cooldown (43200s) overwritten to 7200s on daemon restart. | LOW | 1 | — | known-issue,scheduler | DeepSeek V4 Flash | Simple: known issue, scheduler-level fix needed | — |

## NEVER-DONE — 11-point audit

| ID | Task | Pri | Cpx | Deps | Tags | Model | Reasoning | Fallback |
|----|------|-----|-----|------|------|-------|-----------|----------|
| NEVER-DONE | 11-point audit: spec alignment, doc coverage, test gaps, package upgrades, pitfall hunt, performance audit, endpoint verification, CI/CD health, DuckBrain sync, code quality, middle-out wiring. Run every 3-4 ticks. | LOW | 3 | — | audit,quality | DeepSeek V4 Pro | Architecture-level project audit across all subsystems | GLM-5.2 |

- [ ] **E2E-001 — E2E Testing Tick (self-improving loop)** | Recurring every 5-10 ticks | — | — | Luna (browser/screenshots) or Step 3.7 Flash (CLI/API) | foreman-direct | — | —

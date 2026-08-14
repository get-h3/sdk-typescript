# Dogfood Log

## 2026-08-04 — 🟡 PROMISING-BUT-ROUGH

- **Project:** h3-sdk-typescript (get-h3/sdk-typescript)
- **Verdict:** 🟡 PROMISING-BUT-ROUGH — core SDK genuinely works (fresh consumer harness passed the 43-test h3-test battery in ~15 min), but every documented install route fails and the README Quickstart is copy-paste broken.
- **Promise:** "npm install @get-h3/h3-harness-sdk → implement Harness → H3-compliant." Reality: npm 404s; git install ships no dist/; only local-checkout install works.
- **Top 3 findings:**
  1. GAP-001 (P0): package never published to npm — `npm install @get-h3/h3-harness-sdk` → 404.
  2. GAP-002 (P1): git/file installs broken — dist/ gitignored + no `prepare` script → unimportable package.
  3. GAP-003 (P1): README Quickstart imports type-only `DecisionType` as a runtime value → SyntaxError.
  (Also GAP-004 wire-shape docs + INTERNAL_ERROR mislabel, GAP-005 MockHermes session-ID footgun, GAP-006 README example fails the battery.)
- **Time-to-first-success:** ~25 min (incl. working around install + quickstart); ~5 min once GAP-001..003 land. Latency p50 ~1.1ms; battery 0.22s.
- **Evidence:** 43/43 battery on consumer harness AND on repo's own echo example; 134/134 unit tests verified; full session lifecycle (process→result→cancel→sessions) 200s.
- **Artifacts:** docs/dogfood/2026-08-04-integration.md, docs/dogfood/diagnostics.md, skills/h3-sdk-typescript-usage/SKILL.md, board tasks GAP-001..006, events logged.

## 2026-08-14 — 🟡 PROMISING-BUT-ROUGH (close to SHIPPABLE)

- **Project:** h3-sdk-typescript (get-h3/sdk-typescript)
- **Verdict:** 🟡 PROMISING-BUT-ROUGH — every 08-04 blocker is genuinely fixed (GitHub install 7s, quickstart runs, 44/44 battery from a from-scratch consumer harness) but the repo's own 08-04 integration doc teaches an obsolete tool_call shape and the router silently passes unvalidated decisions.
- **Promise:** "npm install github:get-h3/sdk-typescript → implement Harness → serve → 44/44 compliant." Reality: HOLDS — verified end-to-end with a fresh calculator tool-call harness in /tmp/dogfood-h3-ts-2026-08-14.
- **Top 3 findings:**
  1. GAP-033 (P0): router never validates outgoing Decisions — INVALID_DECISION unreachable; malformed tool_call (old shape) passes 200.
  2. GAP-034 (P1): docs/dogfood/2026-08-04-integration.md teaches {tool_name, arguments, call_id} — TS compile fails, runtime passes garbage silently; also says 43 tests (now 44).
  3. GAP-035 (P1): README has no tool_call decision wire-shape example; GAP-036 (P1): README defaults claim vs required identity/context/config/session_state → 400.
- **Time-to-first-success:** ~8 min (install 7s, harness, MockHermes, battery 44/44 @ 0.23s). Friction count: 6 (GAP-033..038).
- **Evidence:** 44/44 battery; full lifecycle (process→result→cancel→sessions) 200s; MockHermes consumer test; old-shape harness 200-with-garbage reproduction; npm pack clean.
- **Artifacts:** docs/dogfood/2026-08-14-integration.md, diagnostics.md appended, skills/h3-sdk-typescript-usage/SKILL.md v1.2.0, board tasks GAP-033..038.

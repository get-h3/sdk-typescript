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

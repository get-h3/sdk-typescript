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
- **Verdict:** 🟡 PROMISING-BUT-ROUGH — every 08-04 blocker is genuinely fixed (GitHub install 7s, quickstart runs, 46/46 battery from a from-scratch consumer harness) but the repo's own 08-04 integration doc teaches an obsolete tool_call shape and the router silently passes unvalidated decisions.
- **Promise:** "npm install github:get-h3/sdk-typescript → implement Harness → serve → 46/46 compliant." Reality: HOLDS — verified end-to-end with a fresh calculator tool-call harness in /tmp/dogfood-h3-ts-2026-08-14.
- **Top 3 findings:**
  1. GAP-033 (P0): router never validates outgoing Decisions — INVALID_DECISION unreachable; malformed tool_call (old shape) passes 200.
  2. GAP-034 (P1): docs/dogfood/2026-08-04-integration.md teaches {tool_name, arguments, call_id} — TS compile fails, runtime passes garbage silently; also says 43 tests (now 44).
  3. GAP-035 (P1): README has no tool_call decision wire-shape example; GAP-036 (P1): README defaults claim vs required identity/context/config/session_state → 400.
- **Time-to-first-success:** ~8 min (install 7s, harness, MockHermes, battery 46/46 @ 0.23s). Friction count: 6 (GAP-033..038).
- **Evidence:** 46/46 battery; full lifecycle (process→result→cancel→sessions) 200s; MockHermes consumer test; old-shape harness 200-with-garbage reproduction; npm pack clean.
- **Artifacts:** docs/dogfood/2026-08-14-integration.md, diagnostics.md appended, skills/h3-sdk-typescript-usage/SKILL.md v1.2.0, board tasks GAP-033..038.

## 2026-09-06 — 🟡 PROMISING-BUT-ROUGH (closest to SHIPPABLE yet)

- **Project:** h3-sdk-typescript (get-h3/sdk-typescript)
- **Verdict:** 🟡 PROMISING-BUT-ROUGH — a fresh custom harness (standup bot: partial turns, history echo, real tool_call roundtrip, identity greeting) passed the battery 46/46 first try and the full lifecycle worked, but DELETE doesn't delete (GAP-050 P0) and result auto-vivifies unknown sessions (GAP-051).
- **Promise:** "npm install github:get-h3/sdk-typescript → implement Harness → serve → 46/46 compliant." Reality: HOLDS — verified over HTTP, via MockHermes, and in a fresh node:22 container.
- **Top 3 findings:**
  1. GAP-050 (P0): DELETE /v1/sessions/:id returns {terminated:true} but never removes the session — GET afterwards still 200; battery has no GET-after-DELETE test.
  2. GAP-051 (P1): POST /v1/result on a never-created session returns 200 (other session endpoints 404); turn_count increments twice per tool_call roundtrip.
  3. GAP-052 (P2): identity.chat_id required on the wire but undocumented as required; GAP-053 (P2): TS Decision type requires history:[] though the Zod schema defaults it.
- **Time-to-first-success:** ~10 min (install 6.7s → consumer → serve → 46/46 battery, 0.20s, p50 0.96ms).
- **Evidence:** 46/46 battery on custom harness; 9-step HTTP lifecycle; MockHermes in-process run; fresh node:22-bookworm container install+smoke OK; GAP-037 fix verified live (DELETE unknown → 404).
- **Bunker leg:** SKIPPED-install-bunker — bunker3 spawn failed `tar: No space left on device` (host / at 100%, 221G; bunkerd active, 269 stale agent users but /home only 570M). Fresh-container fallback used for the clean-machine proof.
- **Artifacts:** docs/dogfood/2026-09-06-integration.md, diagnostics.md 09-06 section, SKILL.md v1.3.0, board GAP-050..053 + events 323..326.

## 2026-09-19 — ✅ SHIPPABLE (run #5, dogfood lane)

- **Project:** h3-sdk-typescript (get-h3/sdk-typescript)
- **Verdict:** ✅ SHIPPABLE — every documented entry point worked in real use (GitHub install, source
  build, delivered echo example, MockHermes testbed); all four fixes from run #4 verified live; the
  bunker install leg that was SKIPPED on 09-06 (disk-full) is now complete.
- **Promise:** "npm install github:get-h3/sdk-typescript → implement Harness → serve → 46/46 compliant."
  Reality: HOLDS — re-proven on the control host AND a fresh bunker agent.
- **Top 3 findings:**
  1. GAP-056 (P2): README Quickstart onProcess shape ≠ wire shape; `ctx.turn?.text?.content` is
     silently undefined under tsx — battery green only after reading src/examples/echo.ts.
  2. GAP-050/051 verified FIXED live: DELETE removes the session (GET after = 404); result to an
     unknown session = 404; turn_count counts each roundtrip once.
  3. Install leg: fresh bunker agent, clone → npm ci && npm run build = 10s → echo example → 46/46.
     Shim side friction: `pip install --user` PEP-668-blocked on fresh Debian (venv required,
     shim docs gap — filed to get-h3/shim, not this repo).
- **Time-to-first-success:** ~15 min (install 7s → consumer → battery 46/46 after fixing my own
  partial-turn/tool_call shapes; the SDK gave precise errors at every wrong step).
- **Evidence:** 46/46 battery on custom consumer harness (0.2s, p50 1.2ms); 9-step HTTP lifecycle;
  3/3 MockHermes vitest tests; repo suite 172/172; bunker 46/46.
- **Bunker leg:** las-bunker-03 agent=b49993ab, install_seconds=10, smoke=ok, destroyed cleanly.
- **Artifacts:** docs/dogfood/2026-09-19-integration.md, diagnostics.md 2026-09-19 section,
  SKILL.md v1.4.0, board GAP-056 + GAP-057 + event 396.

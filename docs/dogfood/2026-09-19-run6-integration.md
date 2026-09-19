# Dogfood Run #6 — 2026-09-19 (same-day recheck of run #5)

**Verdict: ✅ SHIPPABLE (re-confirmed).** Same-day re-run at the commit run #5
blessed (`4807207`, = `origin/main`). Every documented entry point exercised
again in real use, from a scratch consumer outside the repo.

## Promise under test

"npm install github:get-h3/sdk-typescript → implement Harness → serve →
46/46 h3-test compliant." Reality at HEAD `4807207`: **HOLDS**, re-proven on
the control host and a fresh las-bunker-03 agent.

## Legs and numbers

| Leg | Result |
|---|---|
| GitHub install into scratch consumer `/tmp/dogfood-h3ts-run6` | 11s, 0 vulnerabilities, compiled examples ship in `dist/examples/` |
| Verbatim README Quickstart served under tsx | boots, mounts router, serves — confirms GAP-056: static reply regardless of message |
| Custom stateful harness (partial turns + tool_call + per-session count) | 46/46 battery, 0.84s, p50 4.6ms |
| 10-step HTTP lifecycle (process→tool_call→result→cancel→delete→404s) | all green; GAP-050 (DELETE→GET 404) and GAP-051 (result-unknown→404) fixes held |
| MockHermes in-process from the *installed* package | sendMessage/sendResult/cancel with explicit sessionId; harness counted 2 turns |
| Fresh clone @4807207 → `npm ci && npm run build` | 10s; vitest 129 passed / 43 skipped (skips = sibling-checkout-dependent, documented in runner output) |
| Canonical checkout vitest | 172/172 in 3.4s |
| Bunker las-bunker-03 agent `2b8421b6` | clone@4807207 → install 10s → echo smoke 200 → battery 46/46 (0.45s, venv route for shim) → destroyed cleanly (exit 0) |

## Findings

1. **GAP-056 premise CONFIRMED live** (weaker, PM-corrected form): the
   Quickstart's `onProcess()` ignores the request entirely — two different
   messages both got `"Hello from TypeScript!"`. A consumer cannot learn the
   `ProcessRequest` wire shape (`content` at `req.message.content`) from the
   Quickstart; they must read `src/examples/echo.ts`. Stays P2 pending the
   foreman's Quickstart rewrite.
2. **Skill-file completeness (self-fixed in-run, SKILL.md → v1.4.1):** the
   usage skill's endpoint list omitted `GET /v1/health` (a consumer probing
   `/health` gets a bare 404 — this reviewer did exactly that) and did not
   state the result-vs-session-existence semantics (result → never-created
   session = 404; result → cancelled-but-existing session = 200 but the
   session stays `cancelled`). README documents the health route correctly —
   the gap was skill-side only.
3. **Cancellation contract under-documented in README (GAP-060, new P3):**
   `cancelled` is a terminal status; a later `/v1/result` returns 200 but the
   session never becomes `completed`. The `onCancel` boolean return value's
   meaning is not documented anywhere. Behavior verified; docs work for the
   foreman.

## Friction count

2 (health-route 404 guess — self-inflicted + skill omission; result/cancel
status semantics absent from README). Time-to-first-success: ~12 min from
empty /tmp dir to 46/46, mirroring run #5.

## Notes for the next dogfood run

- Battery on a fresh bunker agent needs the shim via **venv**
  (`python3 -m venv && venv/bin/pip install git+https://github.com/get-h3/shim`);
  `pip install --user` is PEP-668-blocked there (shim-side docs gap, known).
- Fresh-clone vitest skips are expected without the sibling `get-h3/protocol`
  checkout; 172/172 requires the canonical layout.
- The board carries a fleet-injected load-hygiene row (GAP-058, P2) from
  task-router TR-077/TR-078 — audit-then-fix, in-repo only.

# Chaos probes — sdk-typescript

Repository-owned failure-mode probes for the QA foreman's chaos cells.
The generic cells in bunker-qa.sh pick a `*.db`/run-BIN-with-missing-config
candidate blindly; for a library SDK with no state store and no single-binary
entrypoint that produced vacuous verdicts (SDKTS-QA-H3-SDK-TYPESCRIPT-FOREMAN-7).
The generic harness hook (see bunker-qa.sh, chaos-corruption and
chaos-errorpath cells) runs these probes INSTEAD of the generic cell logic
whenever `.qa/chaos-probes/<name>.sh` exists and is executable in the repo
checkout.

## Probes

- `corruption.sh` — replaces chaos-corruption. Starts the compiled example
  harness (`dist/examples/echo.js`, built via `npm run build` if missing),
  then drives a REAL SDK failure mode: a harness handler whose `onProcess`
  throws. Asserts the documented masking contract (DF-H3-27):
  `createH3Router` catches the throw and returns HTTP 200 with a synthesized
  `{decision:"end", end:{reason:"error"}}` decision — a panic never leaks to
  the wire as a 500.
- `errorpath.sh` — replaces chaos-errorpath. Starts a harness that returns an
  INVALID decision payload (violates DecisionSchema) and asserts the router
  rejects it with the documented HTTP 500 `INVALID_DECISION`
  "Invalid decision from harness" errorResponse (GAP-033) and SURVIVES the
  rejection; then sends a malformed request body to the valid example harness
  and asserts the clean 400-class "Invalid request" rejection. Both are
  controlled rejections, never a crash.

## Exit-code contract (consumed by the bunker-qa.sh project-probe hook)

- `0` — contracted behavior observed (probe prints the observed behavior on
  stdout; the first line feeds the cell detail)
- `1` — SDK misbehavior (contract violated; the diff between observed and
  contracted behavior is printed)
- `2` — environment gap, probe skipped (no node, dist/ unbuildable, port
  never answered)

Any other exit code, or a probe that hangs, is graded by the harness hook.

## Rules the probes follow

- Self-contained: node/npx + the repo's own `dist/` + node_modules only.
- Writes only inside the repo tree (temp `.tmp-*.mjs` probe harness files,
  self-cleaned) and `/tmp` (logs, request/response captures).
- Never touch `.coding-hermes/`, `.gitreins/`, or board files.
- POSIX sh; ports are OS-assigned free ephemeral ports each run (no fixed
  port to collide on shared hosts).
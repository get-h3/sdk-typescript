# Memory floor of the vitest suite under address-space caps

Measured live on 2026-09-23, host: 16-CPU Linux x64, 59G RAM,
`vm.overcommit_memory=0`. Toolchain at d701a00: vitest 5.0.1, vite 8.3.0
(rolldown 1.2.6), typescript 7.0.2, Node v22.22.3 (vite-plus managed build)
and v22.23.2 (system) — both node binaries behave identically.

## Repro

```bash
bash -c 'ulimit -v 3145728; npx vitest run'
```

Unconstrained, the suite is green: rc=0, `Tests 140 passed | 43 skipped (183)`,
about 1.3s wall. Under the 3G cap it fails in about 1s with rc=1 and a log
tail that is empty except npm's error-pointer line (113 bytes of output total).
That is the same signature recorded by QA on bunker-las-02 (2026-09-21).

## Root cause (measured, not inferred)

strace of the capped run shows the failing call:

```text
mmap(NULL, 10737479680, PROT_NONE, MAP_PRIVATE|MAP_ANONYMOUS|MAP_NORESERVE, -1, 0) = -1 ENOMEM
```

A single ~10 GiB virtual reservation fails. It is V8 reserving address space
for the WASM memory of Node's bundled undici llhttp parser, instantiated
lazily out of vite's import chain in the main process, before any test worker
exists. Upstream reference: nodejs/node issue 56596 ("Wasm doesn't work in
limited virtual memory situations"), which measures the same ~10GB reservation
and was closed pointing at `node --disable-wasm-trap-handler`.

Consequences, each measured on this host:

- Worker count is irrelevant: the default pool (16 on this host),
  `--maxWorkers=2` and `--maxWorkers=1` all fail identically. The crash
  precedes worker-pool startup, so `test.maxWorkers` cannot fix this class.
- Cap-insensitive without flags: the identical instant failure appears at
  3G, 4G, 5G, 6G, 8G, 10G, 12G, 16G, 24G and 32G caps. Only an uncapped run
  succeeds. The reservation is virtual (`PROT_NONE`, `MAP_NORESERVE`) and
  commits nothing, which is why normal runners never see it.
- `NODE_OPTIONS=--disable-wasm-trap-handler` removes the big reservation
  (a bare llhttp init then survives the cap) and keeps the unconstrained
  suite green in 4 of 4 runs — but under caps it degrades to a worse,
  flaky failure: SIGABRT, rc=134, with a completely empty log (0 of 3 runs
  green at 4G, 1 of 3 at 6G and 8G), and a rolldown panic ("Panic in async
  function" while loading `vitest.config.ts`) at 12G. It is also a
  process-level env setting; `vitest.config.ts` has no knob that injects
  node flags, so it cannot be pinned from inside the repo's test config.

## Conclusion and guidance

- The 3G address-space floor is not reachable by any `vitest.config.ts`
  change on this stack. A red suite under `ulimit -v`-style caps is a
  platform limitation (Node/V8 WASM guard reservations), not a suite defect
  and not a worker-count defect.
- CI runners without explicit address-space caps are unaffected: the 10 GiB
  reservation is address-space only and commits no memory. Every uncapped
  run measured green (~1.1s to 1.7s wall).
- For sandboxes with hard virtual-memory caps: treat anything below 4G as
  unsupported for this suite. Around 4G to 8G,
  `export NODE_OPTIONS=--disable-wasm-trap-handler` may help but measured
  flaky — verify per runner, and expect a silent SIGABRT when it fails.
  The durable options are a larger cap or following the upstream
  reservation-size work referenced in the node issue above.
- Why no worker cap was added despite the board row: the row predates the
  vitest 5 toolchain bump and its numbers were stale hypotheses, as the
  tick suspected. For completeness the trade-off of `maxWorkers` was
  measured anyway: capping to 2 costs about 0.1s wall on this 16-CPU host
  (1.78s vs 1.72s) and changes nothing under caps, so the config was left
  byte-identical rather than shipping an ineffective knob.

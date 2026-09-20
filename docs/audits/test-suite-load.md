# Test-suite load audit — get-h3/sdk-typescript (GAP-058 / LOAD-HYGIENE)

Audited revision: the commit that adds this file (`main`, on top of `8745e99`).
Scope: every file vitest includes — `vitest.config.ts` `test.include:
["src/**/*.test.ts"]`, which is the same file set `scripts/check-test-count.sh`
derives the suite count from. No other test surface exists in this repo.

Method (measure, never infer):

- every file below was read in full, at the revision named above;
- the guard-script spawn count per test-file run was counted for real, with a
  `PATH` shim that logs each `sh …/scripts/check-test-count.sh` invocation and
  then `exec`s the real `/bin/sh`;
- the process fan-out was counted with `strace -f -e trace=execve`, counting
  **successful** `execve` calls (a program actually launched) — not
  `strace` lines, since each spawn also emits PATH-search misses (`ENOENT`)
  that are environment-dependent and are not a load metric;
- wall clock is vitest's own reported `Duration`, measured as interleaved
  before/after pairs on the same host in the same minutes, because host load
  drifts and a sequential before-then-after pair measures the drift.

> This repo declares its counts in `scripts/test-count.txt` only, and the guard
> sweeps prose for stale restatements. This audit therefore states no suite or
> battery count literal — sizes are described, never restated.

## Patterns audited

| id  | pattern                                                                                            | what it costs                                                                                     |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| (a) | tests spawning more than 8 concurrent subprocesses                                                 | process-table and CPU pressure; the runner cannot bound it per test                               |
| (b) | a subprocess per assertion where the process boundary is not the subject                           | the same work is paid once per case instead of once per run                                       |
| (c) | a loop re-running an expensive builder per test where one shared build covers read-only assertions | CPU paid N times for one read-only answer (typical: schema/validator compilation, fixture builds) |

## Verdicts — one row per examined file

| file                                      | patterns exercised | verdict                                                                                                                              | evidence                                                                                                          |
| ----------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `src/__tests__/test-count-guard.test.ts`  | (b)                | **FIXED in this change** — was one `spawnSync` per assertion; read-only cases now share one run per file run                         | `:85` `spawnSync("sh", [GUARD], …)`; read-only consumers `:190`, `:204`; shared run `:118`                        |
| `src/__tests__/schema-validation.test.ts` | (c)                | **REMEDIATED earlier (`e9a519c`)** — was a fresh `Ajv` build per validated case, now one shared builder + per-schema validator cache | `:148` `sharedAjv`, `:155` build site, `:180` build counter, `:370` asserts exactly one build for `decision.json` |
| `src/__tests__/harness.test.ts`           | none               | CLEAN — no child process at all; `makeApp()` is an in-process Hono app + router (`app.request`, no `listen`)                         | `:54` `makeApp`, `:55` `new Hono()`                                                                               |
| `src/__tests__/index.test.ts`             | none               | CLEAN — export-surface assertions over imported modules; no child process, no builder loop                                           | `:184` `createH3Router` presence check                                                                            |
| `src/__tests__/middleware.test.ts`        | none               | CLEAN — in-process Hono app per case; the builder is a few microseconds, not an "expensive builder"                                  | `:8`, `:28`, `:49` `new Hono()`                                                                                   |
| `src/__tests__/protocol.test.ts`          | none               | CLEAN — Zod `parse`/`safeParse` calls only; no child process                                                                         | whole file                                                                                                        |
| `src/__tests__/testbed.test.ts`           | none               | CLEAN — `MockHermes` exercised in-process; no child process                                                                          | whole file                                                                                                        |

Pattern (a): **clean everywhere.** Only one of the seven files spawns any child
process at all (`test-count-guard.test.ts`), it does so with synchronous
`spawnSync`, and that is serial by construction — one child at a time, never
eight. (Vitest's own file-level parallelism is the runner's scheduling, not a
test spawning concurrent children.)

Pattern (c): **clean after `e9a519c`.** The only expensive builder in the suite
is the Ajv/schema one; `harness.test.ts` and `middleware.test.ts` build a Hono
app per case, which is a routing-table construction, measured in the
sub-millisecond range across the file — caching it would add state for no
measurable gain, and it is recorded here as an examined-and-cleared row rather
than an implicit assumption.

## The offender: pattern (b) in the count-guard harness

Before this change every assertion drove `runGuard()` — a real
`spawnSync("sh", [scripts/check-test-count.sh])`. That is the right shape for a
case whose subject _is_ the process (exit codes, stderr wording, misconfiguration
behaviour), and those cases are left alone. It is the wrong shape for the two
cases that ask the guard the same question about inputs that cannot change while
one vitest file runs: the tracked tree, `scripts/test-count.txt` and the guard
script are all immutable for the duration of a file run, and the guard's output
is deterministic.

Per-case classification at this revision (all cases kept; none deleted, skipped,
time-boxed or weakened):

| case (line)                                                               | run kind                                                                           | verdict                                                               |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `:164` agrees with the repo's canonical counts and the vitest include set | in-process reads (canonical file, sibling shim count)                              | no spawn — clean                                                      |
| `:188` passes on the current tree and names the canonical counts          | **shared** read-only run — creates it, owns the process boundary                   | pattern (b) — FIX: `runRepoGuardOnce()`, live `pid` asserted          |
| `:203` self-scans the guard's own shell prose under real repo defaults    | **shared** read-only run — consumes the same result                                | pattern (b) — FIX: asserts the cached stdio, `repoAsIsSpawns` still 1 |
| `:213` flags a stale count in a shell script                              | private: `mkdtemp` tree + planted `self-check.sh`                                  | irreducible — input is written by the case                            |
| `:226` exits 2 when the canonical count file is missing                   | private: `H3_SDK_COUNT_FILE` → absent path                                         | irreducible — env override changes the output                         |
| `:234` exits 2 when the canonical counts are malformed                    | private: malformed canon file                                                      | irreducible                                                           |
| `:247` exits 2 when there are no test files under src/                    | private: empty scan root                                                           | irreducible                                                           |
| `:260` exits 2 when a tracked path contains whitespace                    | private: tree + spaced path                                                        | irreducible                                                           |
| `:268` exits 2 when the sibling shim count is not a number                | private: both count files overridden                                               | irreducible                                                           |
| `:287` exits 1 when the suite moved                                       | private: canon restated, suite + 1                                                 | irreducible — the drift _is_ the input                                |
| `:301` exits 1 when the battery moved upstream                            | private: shim count restated                                                       | irreducible                                                           |
| `:320` flags a retired battery literal in a current-state surface         | private: `scratchTree` + `drift.md`                                                | irreducible                                                           |
| `:334` flags a stale suite count written as a bare parenthetical          | private: `scratchTree` + `commands.md`                                             | irreducible                                                           |
| `:344` flags a stale suite count written inline                           | private: `scratchTree` + `suite.md`                                                | irreducible                                                           |
| `:356` flags a stale restated `suite=<N>` literal in a shell file         | private: `scratchTree` + `restated-suite.sh`                                       | irreducible                                                           |
| `:373` flags a stale restated `battery=<N>` literal                       | private: `scratchTree` + `restated-battery.sh`                                     | irreducible                                                           |
| `:390` flags the spaced, upper-case `suite = <N>` form                    | private: `scratchTree` + `spaced.sh`                                               | irreducible                                                           |
| `:407` exempts a scanned file that restates the canonical counts          | private: `scratchTree` + canonical restatement                                     | irreducible                                                           |
| `:421` exempts a stale restated literal marked historical                 | private: `scratchTree` + historical marker                                         | irreducible                                                           |
| `:435` exempts a line marked historical                                   | private: `scratchTree` + `narration.md`                                            | irreducible                                                           |
| `:448` exempts a document that declares itself historical                 | private: `scratchTree` + banner doc                                                | irreducible                                                           |
| `:462` requires a point-in-time banner on dated records                   | private ×2: the case mutates its own report between runs and asserts both outcomes | irreducible (two distinct inputs, both required)                      |
| `:486` is wired into the npm surface and CI                               | in-process reads (`package.json`, `ci.yml`)                                        | no spawn — clean                                                      |

Roll call of guard-script spawns per full test-file run: **22 before**
(two read-only + twenty private) → **21 after** (one shared + twenty private).
This is the ceiling for this file: every private run is keyed by an input only
that case produces, so no other pair of runs is shareable.

## Before / after measurement

Deterministic counters (5 runs per side; identical every time):

| metric                                                 | before                       | after | delta                                      |
| ------------------------------------------------------ | ---------------------------- | ----- | ------------------------------------------ |
| guard-script spawns per `test-count-guard.test.ts` run | 22                           | 21    | −1                                         |
| of those, repo-as-is runs                              | 2                            | 1     | −1 (the pair that shared, `:190` + `:204`) |
| successful `execve` per file run (whole process tree)  | 686                          | 537   | −149 (−22%)                                |
| cost of one repo-as-is guard run, standalone           | 0.24–0.25 s and 149 `execve` | —     | the removed run is exactly this            |

Wall clock, `npx vitest run src/__tests__/test-count-guard.test.ts`, interleaved
pairs (before / after / before / after …) so host drift cannot masquerade as a
win:

| pair   | before | after  | guard spawns (before → after) |
| ------ | ------ | ------ | ----------------------------- |
| 1      | 1.44 s | 1.24 s | 22 → 21                       |
| 2      | 1.48 s | 1.23 s | 22 → 21                       |
| 3      | 1.65 s | 1.23 s | 22 → 21                       |
| median | 1.48 s | 1.23 s | —                             |

Delta: −0.25 s per file run (−17% of the file run), matching the measured cost
of one repo-as-is guard run. The before samples never overlap the after samples.

Whole-suite wall clock was measured too and is **not** used as evidence: the
suite runs its files in parallel workers, so its wall clock is dominated by
scheduling noise (interleaved pairs came back 1.58/2.00/2.22 s before against
1.80/1.70/1.36 s after — overlapping). The suite-level signal is the
deterministic one: the guard file's process fan-out _is_ the suite's process
fan-out (the other six files spawn no child process), so the −149 `execve` per
file run is the suite-level reduction as well.

## Why the remaining private runs stay private

`runGuard(env)` forks a fresh `sh` per call on purpose: each private case hands
the guard a different world (a `mkdtemp` tree holding a fixture it just wrote,
or an override of `H3_SDK_COUNT_FILE` / `H3_SDK_SHIM_COUNT_FILE`), and asserts
the outcome that world produces. Caching those would mean asserting a stale
result against a world that no longer exists — that is not a load win, it is a
false test. The sharing introduced here is deliberately narrow: it covers only
inputs that are provably identical and provably immutable within a file run.

Parity is kept honest at zero extra cost: the shared run is a real child
process, the creating case asserts the live `pid` plus the exit status and both
stdio streams, and both consumers assert `repoAsIsSpawns === 1`, so a consumer
that silently re-executed — or a stubbed run — fails instead of passing quietly.
No second "compare against a fresh run" spawn is made, because it would re-add
exactly the spawn this change removes while only being able to detect
nondeterminism that cannot occur: the guard is deterministic, and every mutating
case writes inside its own `mkdtemp` tree, never into the repo-as-is.

## Not covered by this audit

- Characterisation of the guard's own algorithmic cost (per-file `grep`/`awk`
  sweeps over the tracked tree). Recorded as the 0.25 s / 149-`execve` figure,
  not optimised here — it is the guard's job to sweep every tracked file, and
  shrinking it would weaken the sweep.
- Vitest worker/thread settings: `vitest.config.ts` sets no pool or concurrency
  overrides, so the default is in use. Not a per-test load pattern; noted for
  completeness.
- Bun/Deno runners: the SDK documents Bun/Deno as unverified and CI covers Node
  only, so this audit covers the Node runner the suite actually gates on.

## How to re-measure

```sh
# guard-script spawn count per file run (no repo mutation)
mkdir -p /tmp/count-shim && printf '#!/bin/bash\nprintf "%%s\\n" "$*" >> /tmp/count-shim/log\nexec /bin/sh "$@"\n' > /tmp/count-shim/sh
chmod +x /tmp/count-shim/sh
: > /tmp/count-shim/log
PATH=/tmp/count-shim:$PATH npx vitest run src/__tests__/test-count-guard.test.ts
grep -c check-test-count.sh /tmp/count-shim/log   # expect 21

# wall clock, one file
npx vitest run src/__tests__/test-count-guard.test.ts

# process fan-out (successful execve only)
strace -f -e trace=execve -o /tmp/exec.txt npx vitest run src/__tests__/test-count-guard.test.ts
grep 'execve(' /tmp/exec.txt | grep -v '= -1' | wc -l   # expect 537
```

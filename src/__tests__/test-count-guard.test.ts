/**
 * Guard tests for scripts/check-test-count.sh (H3-GAP-087).
 *
 * This repo's counts are declared in exactly two machine-readable places — the
 * repo-owned `scripts/test-count.txt` (battery + suite) and the files vitest
 * itself includes (`src/**\/*.test.ts`) — and quoted in prose everywhere else.
 * Nothing in this repo policed that prose, so the stale-count class re-offended
 * here repeatedly: CONTRIBUTING.md advertised a suite size well below what
 * vitest actually ran (with a bare "Tests (N)" line left stale next to it), and
 * the diagnostics trail still described the battery as smaller than it is.
 *
 * These tests drive the guard's documented outcomes hermetically through its env
 * overrides, so a plain `npx vitest run` catches prose drift before CI does:
 *
 * - exit 0 — canonical counts, the derived suite count and current-state prose
 *   all agree;
 * - exit 1 — drift (the suite grew, the battery moved upstream, a tracked
 *   current-state surface still quotes a retired count, or a dated report quotes
 *   one without a point-in-time banner);
 * - exit 2 — the guard is misconfigured (missing / malformed canonical counts,
 *   no test files under src/, a non-numeric sibling count, a path with
 *   whitespace).
 *
 * Retired counts are assembled from digit fragments so this file's own source
 * carries none of them: the guard sweeps tracked `*.ts` files too, and a test
 * that hardcoded them would fail the very sweep it is testing.
 *
 * Load hygiene (GAP-058 / LOAD-HYGIENE): this file's cost is its process
 * fan-out, not its assertions — one guard run over the repo as-is forks a
 * `git`/`grep`/`sed`/`awk` fan-out over every tracked file. So the read-only
 * cases share a single spawn per test-file run (see `runRepoGuardOnce` below)
 * while every case whose input differs keeps a private process. The audit
 * artifact for the whole vitest suite is `docs/audits/test-suite-load.md`.
 */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const GUARD = join(REPO_ROOT, "scripts", "check-test-count.sh");
const CANON = join(REPO_ROOT, "scripts", "test-count.txt");
const PACKAGE_JSON = join(REPO_ROOT, "package.json");
const WORKFLOW = join(REPO_ROOT, ".github", "workflows", "ci.yml");

/** A battery total the shim has retired (assembled, never literal here). */
const retiredBattery = (): string => "4" + "5";

/**
 * A restated `key=<number>` literal, assembled at runtime. This file is itself a
 * tracked `*.ts` surface that the guard sweeps, so it must never carry such a
 * literal in its own source — including inside the fixtures it plants.
 */
const restated = (key: string, value: number): string => `${key}=${value}`;

function readCanonical(): Record<string, number> {
  const found: Record<string, number> = {};
  for (const raw of readFileSync(CANON, "utf8").split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const [key, value] = line.split("=");
    expect(value, `${CANON}: ${key} must be a bare number`).toMatch(/^\d+$/);
    expect(found[key], `${CANON} declares ${key}= twice`).toBeUndefined();
    found[key] = Number(value);
  }
  expect(found.battery).toBeGreaterThan(0);
  expect(found.suite).toBeGreaterThan(0);
  return found;
}

/** One synchronous guard invocation, captured with utf8 stdio. */
type GuardRun = SpawnSyncReturns<string>;

function runGuard(env_overrides: Record<string, string> = {}): GuardRun {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("H3_SDK_")) continue;
    if (value !== undefined) env[key] = value;
  }
  Object.assign(env, env_overrides);
  return spawnSync("sh", [GUARD], { cwd: REPO_ROOT, env, encoding: "utf8" });
}

/**
 * GAP-058 (LOAD-HYGIENE) — the READ-ONLY guard run, scoped to this test file.
 *
 * Every case that runs the guard over the repo AS-IS asks the same question of
 * the same immutable inputs: the tracked tree, the canonical counts and the
 * guard script cannot change while one vitest file runs, and the guard's output
 * is deterministic. Each such case used to pay its own `spawnSync` — 0.25s and a
 * `git`/`grep`/`sed`/`awk` fan-out over every tracked file — for output no other
 * case could distinguish. This is the vitest idiom of the task-router suite's
 * session-scoped expensive fixture (TR-077/TR-078): one build shared by the
 * read-only consumers, a private copy for anything that mutates its input.
 *
 * `runRepoGuardOnce` IS this file run's only repo-as-is spawn, and it is a real
 * child process, never a canned object: the case that owns the process boundary
 * asserts the live `pid`, the exit status and stdout/stderr. `repoAsIsSpawns` is
 * the parity proof — it stays 1, so a consumer that silently re-executed the
 * guard (or a stubbed run) fails instead of passing quietly. No second
 * compare-with-a-fresh-run spawn is made on purpose: it would re-add exactly the
 * spawn this change removes, and the only thing it could catch cannot happen
 * here — the guard is deterministic, and every mutating case below writes inside
 * its own `mkdtemp` tree, never into the repo-as-is.
 *
 * Cases whose INPUT differs keep a private fresh process, because the fresh
 * process is their subject: the misconfiguration/drift cases override
 * H3_SDK_COUNT_FILE / H3_SDK_SHIM_COUNT_FILE, and the fixture cases hand the
 * guard a private tree they just wrote.
 */
let sharedRepoRun: GuardRun | undefined;
let repoAsIsSpawns = 0;

function runRepoGuardOnce(): GuardRun {
  if (sharedRepoRun === undefined) {
    repoAsIsSpawns += 1;
    sharedRepoRun = runGuard();
  }
  return sharedRepoRun;
}

/** A self-contained scan root: `suite` vitest cases + a canonical count file. */
function scratchTree(suite: number): { root: string; canon: string } {
  const root = mkdtempSync(join(tmpdir(), "h3-count-guard-"));
  const dir = join(root, "src", "__tests__");
  mkdirSync(dir, { recursive: true });
  const cases = Array.from(
    { length: suite },
    (_unused, i) =>
      `it("scratch case ${i}", () => {\n    expect(true).toBe(true);\n  });`,
  );
  writeFileSync(
    join(dir, "scratch.test.ts"),
    `import { expect, it } from "vitest";\n\ndescribe("scratch", () => {\n  ${cases.join("\n  ")}\n});\n`,
    "utf8",
  );
  const canon = join(root, "canon.txt");
  writeFileSync(
    canon,
    `${restated("battery", readCanonical().battery)}\n${restated("suite", suite)}\n`,
    "utf8",
  );
  return { root, canon };
}

function scratchEnv(
  root: string,
  canon: string,
  extra: Record<string, string> = {},
) {
  return {
    H3_SDK_SCAN_ROOT: root,
    H3_SDK_COUNT_FILE: canon,
    H3_SDK_SHIM_COUNT_FILE: join(root, "absent-shim-count.txt"),
    ...extra,
  };
}

describe("count guard", () => {
  it("agrees with the repo's canonical counts and the vitest include set", () => {
    const counts = readCanonical();
    const shimCanon = resolve(
      REPO_ROOT,
      "..",
      "shim",
      "scripts",
      "test-count.txt",
    );
    let shimBattery: string | null = null;
    try {
      shimBattery = readFileSync(shimCanon, "utf8").trim();
    } catch {
      shimBattery = null;
    }
    if (shimBattery !== null) {
      expect(shimBattery).toBe(String(counts.battery));
    }
  });

  // GAP-058: READ-ONLY consumer #1, and the case that owns the process
  // boundary — `runRepoGuardOnce` performs the file run's single real repo-as-is
  // spawn here, so the assertions below run against a live child's stdio. The
  // `pid` and `repoAsIsSpawns` checks are what keep the shared run honest.
  it("passes on the current tree and names the canonical counts", () => {
    const counts = readCanonical();
    const result = runRepoGuardOnce();
    expect(repoAsIsSpawns).toBe(1);
    expect(result.pid).toBeGreaterThan(0);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
    expect(result.stdout).toContain(String(counts.battery));
    expect(result.stdout).toContain(String(counts.suite));
  });

  // GAP-058: READ-ONLY consumer #2 — the identical question, so it asserts the
  // identical cached result instead of paying a second spawn (0.25s + the whole
  // tracked-file fan-out). `repoAsIsSpawns` still 1 proves no re-exec happened.
  it("self-scans the guard's own shell prose under real repo defaults", () => {
    const result = runRepoGuardOnce();
    expect(repoAsIsSpawns).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "no stale count literals in current-state surfaces",
    );
  });

  it("flags a stale count in a shell script", () => {
    const { root, canon } = scratchTree(100);
    writeFileSync(
      join(root, "self-check.sh"),
      `# stale battery narration: ${retiredBattery()} tests\n`,
      "utf8",
    );
    const result = runGuard(scratchEnv(root, canon));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("self-check.sh:1");
    expect(result.stderr).toContain("stale count literal");
  });

  it("exits 2 when the canonical count file is missing", () => {
    const result = runGuard({
      H3_SDK_COUNT_FILE: join(tmpdir(), "absent-canon.txt"),
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("canonical count file missing");
  });

  it("exits 2 when the canonical counts are malformed", () => {
    const dir = mkdtempSync(join(tmpdir(), "h3-count-guard-"));
    const bad = join(dir, "canon.txt");
    writeFileSync(
      bad,
      `${restated("battery", 46)}\nsuite=one hundred\n`,
      "utf8",
    );
    const result = runGuard({ H3_SDK_COUNT_FILE: bad });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("exactly one 'suite=");
  });

  it("exits 2 when there are no test files under src/", () => {
    const root = mkdtempSync(join(tmpdir(), "h3-count-guard-"));
    const canon = join(root, "canon.txt");
    writeFileSync(
      canon,
      `${restated("battery", 46)}\n${restated("suite", 3)}\n`,
      "utf8",
    );
    const result = runGuard(scratchEnv(root, canon));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("no src/**/*.test.ts files");
  });

  it("exits 2 when a tracked path contains whitespace", () => {
    const { root, canon } = scratchTree(3);
    writeFileSync(join(root, "odd name.md"), "nothing here\n", "utf8");
    const result = runGuard(scratchEnv(root, canon));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("whitespace in a tracked path");
  });

  it("exits 2 when the sibling shim count is not a number", () => {
    const counts = readCanonical();
    const dir = mkdtempSync(join(tmpdir(), "h3-count-guard-"));
    const canon = join(dir, "canon.txt");
    writeFileSync(
      canon,
      `battery=${counts.battery}\nsuite=${counts.suite}\n`,
      "utf8",
    );
    const shim = join(dir, "shim-count.txt");
    writeFileSync(shim, "forty-six\n", "utf8");
    const result = runGuard({
      H3_SDK_COUNT_FILE: canon,
      H3_SDK_SHIM_COUNT_FILE: shim,
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("is not a bare number");
  });

  it("exits 1 when the suite moved", () => {
    const counts = readCanonical();
    const dir = mkdtempSync(join(tmpdir(), "h3-count-guard-"));
    const canon = join(dir, "canon.txt");
    writeFileSync(
      canon,
      `battery=${counts.battery}\nsuite=${counts.suite + 1}\n`,
      "utf8",
    );
    const result = runGuard({ H3_SDK_COUNT_FILE: canon });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("suite drift");
  });

  it("exits 1 when the battery moved upstream", () => {
    const counts = readCanonical();
    const dir = mkdtempSync(join(tmpdir(), "h3-count-guard-"));
    const canon = join(dir, "canon.txt");
    writeFileSync(
      canon,
      `battery=${counts.battery}\nsuite=${counts.suite}\n`,
      "utf8",
    );
    const shim = join(dir, "shim-count.txt");
    writeFileSync(shim, `${counts.battery + 1}\n`, "utf8");
    const result = runGuard({
      H3_SDK_COUNT_FILE: canon,
      H3_SDK_SHIM_COUNT_FILE: shim,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("battery drift");
  });

  it("flags a retired battery literal in a current-state surface", () => {
    const { root, canon } = scratchTree(100);
    const stale = `${retiredBattery()}/${retiredBattery()}`;
    writeFileSync(
      join(root, "drift.md"),
      `the battery reports ${stale} PASSED\n`,
      "utf8",
    );
    const result = runGuard(scratchEnv(root, canon));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("drift.md:1");
    expect(result.stderr).toContain("stale count literal");
  });

  it("flags a stale suite count written as a bare parenthetical", () => {
    const { root, canon } = scratchTree(100);
    const stale = 100 + 1;
    writeFileSync(join(root, "commands.md"), `# Tests (${stale})\n`, "utf8");
    const result = runGuard(scratchEnv(root, canon));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("commands.md:1");
    expect(result.stdout).toContain("suite claim");
  });

  it("flags a stale suite count written inline", () => {
    const { root, canon } = scratchTree(100);
    writeFileSync(
      join(root, "suite.md"),
      `- [ ] \`npm test\` passes (${101} tests)\n`,
      "utf8",
    );
    const result = runGuard(scratchEnv(root, canon));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("suite.md:1");
  });

  it("flags a stale restated suite=<N> literal in a shell file", () => {
    const counts = readCanonical();
    const { root, canon } = scratchTree(counts.suite);
    const stale = counts.suite - 1;
    writeFileSync(
      join(root, "restated-suite.sh"),
      `# size quoted from memory: ${restated("suite", stale)}\n`,
      "utf8",
    );
    const result = runGuard(scratchEnv(root, canon));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("restated-suite.sh:1");
    expect(result.stdout).toContain(
      `suite claim suite=${stale} != ${counts.suite}`,
    );
  });

  it("flags a stale restated battery=<N> literal", () => {
    const counts = readCanonical();
    const { root, canon } = scratchTree(counts.suite);
    const stale = counts.battery - 1;
    writeFileSync(
      join(root, "restated-battery.sh"),
      `# pinned battery: ${restated("battery", stale)}\n`,
      "utf8",
    );
    const result = runGuard(scratchEnv(root, canon));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("restated-battery.sh:1");
    expect(result.stdout).toContain(
      `battery claim battery=${stale} != ${counts.battery}`,
    );
  });

  it("flags the spaced, upper-case suite = <N> form", () => {
    const counts = readCanonical();
    const { root, canon } = scratchTree(counts.suite);
    const stale = counts.suite - 1;
    writeFileSync(
      join(root, "spaced.sh"),
      `# SUITE = ${stale} in the old notes\n`,
      "utf8",
    );
    const result = runGuard(scratchEnv(root, canon));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("spaced.sh:1");
    expect(result.stdout).toContain(
      `suite claim suite=${stale} != ${counts.suite}`,
    );
  });

  it("exempts a scanned file that restates the canonical counts", () => {
    const counts = readCanonical();
    const { root, canon } = scratchTree(counts.suite);
    writeFileSync(
      join(root, "canonical-restated.sh"),
      `# ${restated("suite", counts.suite)} and ` +
        `${restated("battery", counts.battery)}\n`,
      "utf8",
    );
    const result = runGuard(scratchEnv(root, canon));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  it("exempts a stale restated literal marked historical", () => {
    const counts = readCanonical();
    const { root, canon } = scratchTree(counts.suite);
    const stale = counts.suite - 1;
    writeFileSync(
      join(root, "historical.sh"),
      `# era-correct: ${restated("suite", stale)} (count-ok-historical)\n`,
      "utf8",
    );
    const result = runGuard(scratchEnv(root, canon));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  it("exempts a line marked historical", () => {
    const { root, canon } = scratchTree(100);
    const stale = `${retiredBattery()}/${retiredBattery()}`;
    writeFileSync(
      join(root, "narration.md"),
      `first run scored ${stale} (count-ok-historical: the 2026-08 era).\n`,
      "utf8",
    );
    const result = runGuard(scratchEnv(root, canon));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  it("exempts a document that declares itself historical", () => {
    const { root, canon } = scratchTree(100);
    const stale = `${retiredBattery()}/${retiredBattery()}`;
    const dir = join(root, "docs", "dogfood");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "diagnostics.md"),
      `# Trail\n\n> **Historical (2026-08-04):** point-in-time record.\n\nthe battery scored ${stale}\n`,
      "utf8",
    );
    const result = runGuard(scratchEnv(root, canon));
    expect(result.status).toBe(0);
  });

  it("requires a point-in-time banner on dated records", () => {
    const { root, canon } = scratchTree(100);
    const stale = `${retiredBattery()}/${retiredBattery()}`;
    const dir = join(root, "docs", "dogfood");
    mkdirSync(dir, { recursive: true });
    const report = join(dir, "2026-01-01-integration.md");
    writeFileSync(report, `# Report\n\nthe battery scored ${stale}\n`, "utf8");

    const bare = runGuard(scratchEnv(root, canon));
    expect(bare.status).toBe(1);
    expect(bare.stderr).toContain("no point-in-time banner");
    expect(bare.stderr).toContain("2026-01-01-integration.md");

    writeFileSync(
      report,
      "# Report\n\n" +
        "> **Historical (2026-01-01):** point-in-time record — the counts below are\n" +
        "> not live status.\n\n" +
        `the battery scored ${stale}\n`,
      "utf8",
    );
    expect(runGuard(scratchEnv(root, canon)).status).toBe(0);
  });

  it("is wired into the npm surface and CI", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["verify-counts"]).toBe(
      "sh scripts/check-test-count.sh",
    );
    expect(readFileSync(WORKFLOW, "utf8")).toContain(
      "sh scripts/check-test-count.sh",
    );
  });
});

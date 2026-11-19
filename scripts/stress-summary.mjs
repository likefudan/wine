// Turns what scripts/stress.sh left behind into one report (Markdown, on standard output):
// how many rounds of each kind failed, which tests failed and how often, rounds that broke without
// a failing test (a crash, a hang, the local site not starting), and the tests nearest their time
// limit.
//
//   node scripts/stress-summary.mjs <folder> [<folder>...]
//
// Each folder holds rounds.tsv and the per-round <id>.json / <id>.log files. Exit status is 1 when
// any round failed.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Time limits per test, from vitest.config.ts and playwright.config.ts. */
const LIMIT_MS = { unit: 15_000, e2e: 60_000 };

const folders = [];
const walk = (dir) => {
  if (existsSync(join(dir, "rounds.tsv"))) folders.push(dir);
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
  }
};
for (const dir of process.argv.slice(2)) if (existsSync(dir)) walk(dir);

/** The tests in one round's report: [{ name, ok, ms, error }]. */
function testsOf(file, kind) {
  if (!existsSync(file)) return null;
  let report;
  try {
    report = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const tests = [];
  if (kind === "unit") {
    for (const f of report.testResults ?? []) {
      const short = f.name.replace(/^.*\/test\//, "test/");
      if (f.status === "failed" && !(f.assertionResults ?? []).some((a) => a.status === "failed"))
        tests.push({ name: `${short} (whole file)`, ok: false, ms: 0, error: f.message ?? "" });
      for (const a of f.assertionResults ?? []) {
        if (a.status !== "passed" && a.status !== "failed") continue;
        tests.push({
          name: `${short} › ${a.fullName}`,
          ok: a.status === "passed",
          ms: a.duration ?? 0,
          error: (a.failureMessages ?? []).join("\n"),
        });
      }
    }
  } else {
    const visit = (suite) => {
      for (const spec of suite.specs ?? [])
        for (const t of spec.tests ?? []) {
          const last = t.results?.[t.results.length - 1];
          if (!last || last.status === "skipped") continue;
          tests.push({
            name: `e2e/${spec.file} › ${spec.title}`,
            ok: last.status === "passed",
            ms: last.duration ?? 0,
            error: last.error?.message ?? last.errors?.[0]?.message ?? last.status,
          });
        }
      for (const s of suite.suites ?? []) visit(s);
    };
    for (const s of report.suites ?? []) visit(s);
    for (const e of report.errors ?? [])
      tests.push({ name: "(outside any test)", ok: false, ms: 0, error: e.message ?? "" });
  }
  return tests;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips terminal colours from error text
const plain = (s) => s.replace(/\u001b\[[0-9;]*m/g, "");
const firstLines = (s, n) => plain(s).trim().split("\n").slice(0, n).join("\n");
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

const modes = new Map(); // mode → { rounds, failed, seconds[] }
const failures = new Map(); // mode + test → { mode, name, count, error, where[] }
const ran = new Map(); // mode + test → times it ran
const broken = []; // rounds that failed with no failing test in the report
const durations = new Map(); // kind + test → { kind, name, ms[] }

for (const dir of folders) {
  for (const line of readFileSync(join(dir, "rounds.tsv"), "utf8").split("\n")) {
    if (!line) continue;
    const [mode, label, round, id, status, seconds, seed] = line.split("\t");
    const kind = mode.startsWith("unit") ? "unit" : "e2e";
    const m = modes.get(mode) ?? { rounds: 0, failed: 0, seconds: [] };
    m.rounds++;
    m.seconds.push(Number(seconds));
    if (status !== "0") m.failed++;
    modes.set(mode, m);

    const tests = testsOf(join(dir, `${id}.json`), kind);
    const where = `copy ${label} round ${round}${seed ? ` seed ${seed}` : ""}`;
    for (const t of tests ?? []) {
      const key = `${mode}\n${t.name}`;
      ran.set(key, (ran.get(key) ?? 0) + 1);
      if (t.ok) {
        // Only the unhurried runs say how close a test normally is to its limit.
        if (mode !== "e2e-busy") {
          const d = durations.get(`${kind}\n${t.name}`) ?? { kind, name: t.name, ms: [] };
          d.ms.push(t.ms);
          durations.set(`${kind}\n${t.name}`, d);
        }
        continue;
      }
      const f = failures.get(key) ?? { mode, name: t.name, count: 0, error: t.error, where: [] };
      f.count++;
      f.where.push(where);
      failures.set(key, f);
    }
    if (status !== "0" && !(tests ?? []).some((t) => !t.ok)) {
      const log = join(dir, `${id}.log`);
      const tail = existsSync(log) ? plain(readFileSync(log, "utf8")).trim().split("\n").slice(-15).join("\n") : "";
      const what = Number(status) >= 124 ? "ran past the time limit and was stopped" : `exit ${status}`;
      broken.push({ id, what, tail });
    }
  }
}

const out = [];
out.push("# Stress test", "");
if (modes.size === 0) out.push("No results found.");
else {
  out.push("| kind | rounds | failed | fastest | median | slowest |", "|---|---|---|---|---|---|");
  for (const [mode, m] of [...modes].sort()) {
    const s = m.seconds;
    out.push(`| ${mode} | ${m.rounds} | ${m.failed} | ${Math.min(...s)}s | ${median(s)}s | ${Math.max(...s)}s |`);
  }
}

out.push("", "## Tests that failed", "");
if (failures.size === 0) out.push("None.");
for (const f of [...failures.values()].sort((a, b) => b.count - a.count)) {
  out.push(`### ${f.name}`, "");
  out.push(
    `${f.mode}: failed ${f.count} of ${ran.get(`${f.mode}\n${f.name}`)} runs (${f.where.slice(0, 6).join("; ")}${f.where.length > 6 ? "; …" : ""})`,
  );
  out.push("", "```", firstLines(f.error, 12), "```", "");
}

out.push("", "## Rounds that broke without a failing test", "");
if (broken.length === 0) out.push("None.");
for (const b of broken) out.push(`### ${b.id}: ${b.what}`, "", "```", b.tail, "```", "");

out.push("", "## Nearest their time limit", "");
out.push("Slowest run of each test against its limit (15s unit, 60s browser), busy-CPU rounds left out.", "");
out.push("| test | slowest | median | share of limit |", "|---|---|---|---|");
const slow = [...durations.values()]
  .map((d) => ({ ...d, max: Math.max(...d.ms), share: Math.max(...d.ms) / LIMIT_MS[d.kind] }))
  .sort((a, b) => b.share - a.share)
  .slice(0, 8);
for (const d of slow)
  out.push(`| ${d.name} | ${secs(d.max)} | ${secs(median(d.ms))} | ${Math.round(d.share * 100)}% |`);

console.log(out.join("\n"));
process.exit([...modes.values()].some((m) => m.failed > 0) ? 1 : 0);

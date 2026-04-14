import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const LOOP_RUNS = Number(process.env.SMOKE_LOOP_RUNS || 10);
const FAIL_FAST = process.env.SMOKE_LOOP_FAIL_FAST === "1";
const COOLDOWN_MS = Number(process.env.SMOKE_LOOP_COOLDOWN_MS || 600);
const ALLOW_FLAKE = process.env.SMOKE_LOOP_ALLOW_FLAKE === "1";
const REPORT_FILE = process.env.SMOKE_LOOP_REPORT_FILE || "";

const pad = (value) => String(value).padStart(2, "0");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const toRate = (numerator, denominator) =>
  denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;

const parseSummaryJson = (stdout) => {
  const jsonStart = stdout.lastIndexOf("\n{");
  if (jsonStart === -1) {
    return null;
  }

  const jsonCandidate = stdout.slice(jsonStart + 1).trim();
  try {
    return JSON.parse(jsonCandidate);
  } catch {
    return null;
  }
};

const runSingleIteration = (iteration) => {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, ["./scripts/slow3g_optimistic_realtime_stress.mjs"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("close", (code) => {
      const durationMs = Date.now() - startedAt;
      const summary = parseSummaryJson(stdout);
      const pass = code === 0 && Boolean(summary?.overallPass);

      const reactionPass = Boolean(summary?.reactionRollback?.pass);
      const deletePass = Boolean(summary?.deleteRollback?.pass);
      const realtimePass = Boolean(summary?.recipientRealtimeSync?.pass);

      const reason = pass
        ? "ok"
        : summary?.recipientRealtimeSync?.reason || "iteration_failed";

      resolve({
        iteration,
        durationMs,
        pass,
        exitCode: code,
        reactionPass,
        deletePass,
        realtimePass,
        reason,
        summary,
        stdout,
        stderr,
      });
    });
  });
};

const ensureValidLoopConfig = () => {
  if (!Number.isFinite(LOOP_RUNS) || LOOP_RUNS <= 0) {
    throw new Error(`Invalid SMOKE_LOOP_RUNS: ${process.env.SMOKE_LOOP_RUNS || ""}`);
  }
};

const buildPhaseStats = (results, key) => {
  const total = results.length;
  const passed = results.filter((item) => Boolean(item[key])).length;
  const failed = total - passed;

  return {
    totalRuns: total,
    passedRuns: passed,
    failedRuns: failed,
    passRate: toRate(passed, total),
    flakeRate: toRate(failed, total),
  };
};

const buildRealtimeReasonBreakdown = (results) => {
  return results.reduce((accumulator, result) => {
    if (result.realtimePass) {
      return accumulator;
    }

    const key = result.reason || "unknown";
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
};

const buildPhaseSummary = (results) => {
  return {
    reactionRollback: buildPhaseStats(results, "reactionPass"),
    deleteRollback: buildPhaseStats(results, "deletePass"),
    realtimeSync: {
      ...buildPhaseStats(results, "realtimePass"),
      failureReasons: buildRealtimeReasonBreakdown(results),
    },
  };
};

const logIterationResult = (result) => {
  const status = result.pass ? "PASS" : "FAIL";
  console.log(
    `${status} | ITER-${pad(result.iteration)} | durationMs=${result.durationMs} reaction=${result.reactionPass} delete=${result.deletePass} realtime=${result.realtimePass} reason=${result.reason}`,
  );

  if (result.pass) {
    return;
  }

  const message = result.stderr?.trim() || result.stdout?.trim();
  if (!message) {
    return;
  }

  const preview = message.split("\n").slice(-6).join("\n");
  console.log(`TRACE | ITER-${pad(result.iteration)} | ${preview}`);
};

const buildSummary = ({ results, startedAt }) => {
  const completedRuns = results.length;
  const passedRuns = results.filter((item) => item.pass).length;
  const failedRuns = completedRuns - passedRuns;
  const passRate = toRate(passedRuns, completedRuns);
  const flakeRate = toRate(failedRuns, completedRuns);
  const avgDurationMs =
    completedRuns > 0
      ? Math.round(results.reduce((total, item) => total + item.durationMs, 0) / completedRuns)
      : 0;

  return {
    requestedRuns: LOOP_RUNS,
    completedRuns,
    passedRuns,
    failedRuns,
    passRate,
    flakeRate,
    avgDurationMs,
    totalDurationMs: Date.now() - startedAt,
    failFast: FAIL_FAST,
    networkProfile: results.find((item) => item.summary?.networkProfile)?.summary?.networkProfile || null,
    phases: buildPhaseSummary(results),
  };
};

const detectCiProvider = () => {
  if (process.env.GITHUB_ACTIONS) {
    return "github-actions";
  }

  if (process.env.CI) {
    return "generic-ci";
  }

  return "local";
};

const buildReportPayload = ({ summary, results }) => {
  return {
    generatedAt: new Date().toISOString(),
    ciContext: {
      provider: detectCiProvider(),
      runId: process.env.GITHUB_RUN_ID || process.env.CI_PIPELINE_ID || null,
      job: process.env.GITHUB_JOB || process.env.CI_JOB_NAME || null,
      gitSha: process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || null,
      ref: process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_REF_NAME || null,
    },
    summary,
    iterations: results.map((result) => ({
      iteration: result.iteration,
      pass: result.pass,
      durationMs: result.durationMs,
      reason: result.reason,
      phases: {
        reactionRollback: result.reactionPass,
        deleteRollback: result.deletePass,
        realtimeSync: result.realtimePass,
      },
      exitCode: result.exitCode,
    })),
  };
};

const writeReportFile = async ({ summary, results }) => {
  if (!REPORT_FILE) {
    return null;
  }

  const resolvedReportFile = path.resolve(process.cwd(), REPORT_FILE);
  await mkdir(path.dirname(resolvedReportFile), { recursive: true });
  await writeFile(
    resolvedReportFile,
    JSON.stringify(buildReportPayload({ summary, results }), null, 2),
    "utf8",
  );

  return resolvedReportFile;
};

const run = async () => {
  ensureValidLoopConfig();

  const startedAt = Date.now();
  const results = [];

  console.log("=== SLOW 3G LOOP STRESS ===");
  console.log(`runs=${LOOP_RUNS} failFast=${FAIL_FAST} cooldownMs=${COOLDOWN_MS}`);

  for (let iteration = 1; iteration <= LOOP_RUNS; iteration += 1) {
    const result = await runSingleIteration(iteration);
    results.push(result);
    logIterationResult(result);

    if (FAIL_FAST && !result.pass) {
      break;
    }

    if (iteration < LOOP_RUNS && COOLDOWN_MS > 0) {
      await sleep(COOLDOWN_MS);
    }
  }

  const summary = buildSummary({ results, startedAt });

  console.log("=== SLOW 3G LOOP SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  const reportFilePath = await writeReportFile({ summary, results });
  if (reportFilePath) {
    console.log(`REPORT | ${reportFilePath}`);
  }

  if (!ALLOW_FLAKE && summary.failedRuns > 0) {
    process.exitCode = 1;
    return;
  }

  process.exitCode = 0;
};

try {
  await run();
} catch (error) {
  console.error("=== SLOW 3G LOOP STRESS ===");
  console.error(`FAIL | LOOP | ${error?.message || error}`);
  process.exitCode = 1;
}

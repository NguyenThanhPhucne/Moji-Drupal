import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const LOOP_RUNS = Number(process.env.SMOKE_LOOP_RUNS || 20);
const REPORT_FILE =
  process.env.SMOKE_PHASE_REPORT_FILE ||
  "./reports/slow3g-chat-phase-flake-report.json";
const FAIL_ON_FLAKE = process.env.SMOKE_PHASE_FAIL_ON_FLAKE === "1";

const parseThreshold = (rawValue, fallback = null, name = "threshold") => {
  if (rawValue == null || rawValue === "") {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name}: ${rawValue}`);
  }

  return parsed;
};

const MAX_FLAKE_THRESHOLDS = {
  overall: parseThreshold(
    process.env.SMOKE_PHASE_MAX_FLAKE_OVERALL,
    null,
    "SMOKE_PHASE_MAX_FLAKE_OVERALL",
  ),
  reactionRollback: parseThreshold(
    process.env.SMOKE_PHASE_MAX_FLAKE_REACTION,
    null,
    "SMOKE_PHASE_MAX_FLAKE_REACTION",
  ),
  deleteRollback: parseThreshold(
    process.env.SMOKE_PHASE_MAX_FLAKE_DELETE,
    null,
    "SMOKE_PHASE_MAX_FLAKE_DELETE",
  ),
  realtimeSync: parseThreshold(
    process.env.SMOKE_PHASE_MAX_FLAKE_REALTIME,
    1,
    "SMOKE_PHASE_MAX_FLAKE_REALTIME",
  ),
};

const parseReport = async (reportPath) => {
  const raw = await readFile(reportPath, "utf8");
  return JSON.parse(raw);
};

const evaluateThresholds = (reportSummary) => {
  const metrics = [
    {
      phase: "overall",
      flakeRate: Number(reportSummary?.flakeRate),
      threshold: MAX_FLAKE_THRESHOLDS.overall,
    },
    {
      phase: "reactionRollback",
      flakeRate: Number(reportSummary?.phases?.reactionRollback?.flakeRate),
      threshold: MAX_FLAKE_THRESHOLDS.reactionRollback,
    },
    {
      phase: "deleteRollback",
      flakeRate: Number(reportSummary?.phases?.deleteRollback?.flakeRate),
      threshold: MAX_FLAKE_THRESHOLDS.deleteRollback,
    },
    {
      phase: "realtimeSync",
      flakeRate: Number(reportSummary?.phases?.realtimeSync?.flakeRate),
      threshold: MAX_FLAKE_THRESHOLDS.realtimeSync,
    },
  ];

  return metrics.map((metric) => {
    if (metric.threshold == null) {
      return {
        ...metric,
        status: "SKIP",
      };
    }

    const breached = Number.isFinite(metric.flakeRate)
      ? metric.flakeRate > metric.threshold
      : true;

    return {
      ...metric,
      status: breached ? "FAIL" : "PASS",
    };
  });
};

const printThresholdSummary = (evaluations) => {
  console.log("=== SLOW 3G PHASE THRESHOLDS ===");
  for (const evaluation of evaluations) {
    const thresholdText = evaluation.threshold == null
      ? "disabled"
      : `${evaluation.threshold}%`;
    const flakeText = Number.isFinite(evaluation.flakeRate)
      ? `${evaluation.flakeRate}%`
      : "n/a";

    console.log(
      `${evaluation.status} | phase=${evaluation.phase} flakeRate=${flakeText} threshold=${thresholdText}`,
    );
  }
};

const run = async () => {
  if (!Number.isFinite(LOOP_RUNS) || LOOP_RUNS <= 0) {
    throw new Error(
      `Invalid SMOKE_LOOP_RUNS for phase report: ${process.env.SMOKE_LOOP_RUNS || ""}`,
    );
  }

  const env = {
    ...process.env,
    SMOKE_LOOP_RUNS: String(LOOP_RUNS),
    SMOKE_LOOP_REPORT_FILE: REPORT_FILE,
    SMOKE_LOOP_ALLOW_FLAKE: "1",
  };

  console.log("=== SLOW 3G PHASE FLAKE REPORT ===");
  console.log(
    `runs=${LOOP_RUNS} failOnFlake=${FAIL_ON_FLAKE} output=${REPORT_FILE}`,
  );

  const exitCode = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["./scripts/slow3g_optimistic_realtime_stress_loop.mjs"],
      {
        cwd: process.cwd(),
        env,
        stdio: "inherit",
      },
    );

    child.on("close", (code) => {
      resolve(typeof code === "number" ? code : 1);
    });
  });

  if (exitCode !== 0) {
    process.exitCode = exitCode;
    return;
  }

  const resolvedReportFile = path.resolve(process.cwd(), REPORT_FILE);
  const report = await parseReport(resolvedReportFile);
  const evaluations = evaluateThresholds(report?.summary || {});
  printThresholdSummary(evaluations);

  const hasThresholdFailure = evaluations.some(
    (evaluation) => evaluation.status === "FAIL",
  );

  if (hasThresholdFailure) {
    const notice = "WARN | One or more phase flake thresholds were exceeded.";
    if (FAIL_ON_FLAKE) {
      console.error(`FAIL | ${notice}`);
      process.exitCode = 1;
      return;
    }

    console.warn(notice);
  }

  process.exitCode = 0;
};

try {
  await run();
} catch (error) {
  console.error("=== SLOW 3G PHASE FLAKE REPORT ===");
  console.error(`FAIL | PHASE-REPORT | ${error?.message || error}`);
  process.exitCode = 1;
}

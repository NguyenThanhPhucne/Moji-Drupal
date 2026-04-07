#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

const TARGET_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const IGNORE_DIRS = new Set(["node_modules", "dist", "coverage", ".git"]);
const EXEMPT_RELATIVE_FILES = new Set([
  "src/components/auth/google-login-button.tsx",
]);

const ALLOWED_TOKEN_RE =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|shadow)-(?:primary|secondary|muted|foreground|background|card|popover|accent|destructive|warning|info|input|border|ring|sidebar|online|offline)(?:\/[0-9]{1,3})?\b/g;

const HARD_CODED_UTILITY_RE =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|shadow)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)(?:\/[0-9]{1,3})?\b/g;

const RAW_COLOR_RE = /#(?:[0-9a-fA-F]{3,8})\b/g;
const ARBITRARY_COLOR_RE =
  /\[(?:#(?:[0-9a-fA-F]{3,8})|rgb\(|rgba\(|hsl\((?!var\()|hsla\((?!var\())/g;

async function walk(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        files.push(...(await walk(entryPath)));
      }
      continue;
    }

    if (TARGET_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function sanitizeLineForAllowedTokens(line) {
  return line.replace(ALLOWED_TOKEN_RE, "");
}

function shouldIgnoreLine(lines, lineIndex) {
  const line = lines[lineIndex] ?? "";
  const prevLine = lines[lineIndex - 1] ?? "";
  return (
    line.includes("accent-check-ignore") ||
    prevLine.includes("accent-check-ignore-next-line")
  );
}

function collectMatches(lines, filePath) {
  const relativePath = path.relative(ROOT, filePath).replace(/\\/g, "/");
  if (EXEMPT_RELATIVE_FILES.has(relativePath)) {
    return [];
  }

  const findings = [];

  lines.forEach((rawLine, index) => {
    if (shouldIgnoreLine(lines, index)) {
      return;
    }

    const line = sanitizeLineForAllowedTokens(rawLine);

    for (const match of line.matchAll(HARD_CODED_UTILITY_RE)) {
      findings.push({
        filePath,
        line: index + 1,
        value: match[0],
        kind: "tailwind-hardcoded",
      });
    }

    for (const match of line.matchAll(RAW_COLOR_RE)) {
      findings.push({
        filePath,
        line: index + 1,
        value: match[0],
        kind: "raw-hex",
      });
    }

    for (const match of line.matchAll(ARBITRARY_COLOR_RE)) {
      findings.push({
        filePath,
        line: index + 1,
        value: match[0],
        kind: "arbitrary-color",
      });
    }
  });

  return findings;
}

function groupByFile(findings) {
  return findings.reduce((acc, finding) => {
    if (!acc[finding.filePath]) {
      acc[finding.filePath] = [];
    }
    acc[finding.filePath].push(finding);
    return acc;
  }, {});
}

function printSummary(findings) {
  const grouped = groupByFile(findings);
  const files = Object.keys(grouped).sort();

  if (files.length === 0) {
    console.log("Accent regression check passed. No hard-coded accent color usages found.");
    return;
  }

  console.log("Accent regression check found non-theme color usages:\n");

  for (const file of files) {
    const relPath = path.relative(ROOT, file);
    console.log(`- ${relPath}`);

    grouped[file]
      .sort((a, b) => a.line - b.line)
      .forEach((finding) => {
        console.log(
          `  L${finding.line}: [${finding.kind}] ${finding.value}`,
        );
      });

    console.log("");
  }

  console.log(
    "Tip: replace fixed colors with theme tokens (primary/muted/foreground/etc) or CSS vars. " +
      "Use comment 'accent-check-ignore-next-line' for intentional exceptions.",
  );
}

async function run() {
  try {
    const files = await walk(SRC_DIR);
    const allFindings = [];

    for (const filePath of files) {
      const content = await fs.readFile(filePath, "utf8");
      const lines = content.split(/\r?\n/);
      allFindings.push(...collectMatches(lines, filePath));
    }

    printSummary(allFindings);
    process.exit(allFindings.length === 0 ? 0 : 1);
  } catch (error) {
    console.error("Accent regression check failed to run:", error);
    process.exit(2);
  }
}

void run();

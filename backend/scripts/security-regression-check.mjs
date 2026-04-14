import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(process.cwd());
const scanRoots = [
  path.join(projectRoot, "src"),
  path.join(projectRoot, "scripts"),
];

const ignoredDirNames = new Set([
  "node_modules",
  ".git",
  "build",
  "dist",
  "coverage",
]);

const ignoredFileNames = new Set([
  "security-regression-check.mjs",
]);

const fileExtensions = new Set([".js", ".mjs", ".cjs"]);

const securityRules = [
  {
    id: "NO_EVAL",
    description: "Disallow eval usage",
    pattern: /\beval\s*\(/g,
  },
  {
    id: "NO_FUNCTION_CONSTRUCTOR",
    description: "Disallow Function constructor",
    pattern: /\bnew\s+Function\s*\(/g,
  },
  {
    id: "NO_CHILD_PROCESS",
    description: "Disallow child_process usage",
    pattern: /\bchild_process\b/g,
  },
  {
    id: "NO_VM_MODULE",
    description: "Disallow vm module usage",
    pattern: /\bnode:vm\b|\bfrom\s+["']vm["']/g,
  },
  {
    id: "NO_SHELL_EXEC",
    description: "Disallow direct shell execution APIs",
    pattern: /\b(exec|execSync|spawn|spawnSync|fork)\s*\(/g,
  },
  {
    id: "NO_MONGO_WHERE",
    description: "Disallow Mongo $where operator",
    pattern: /\$where\b/g,
  },
  {
    id: "NO_HARDCODED_DEV_SSO_SECRET",
    description: "Disallow hardcoded fallback SSO secrets",
    pattern: /open-crm-chat-sso-dev-secret/g,
  },
];

const collectFiles = async (dirPath, acc = []) => {
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (ignoredDirNames.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await collectFiles(fullPath, acc);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (ignoredFileNames.has(entry.name)) {
      continue;
    }

    if (!fileExtensions.has(path.extname(entry.name))) {
      continue;
    }

    acc.push(fullPath);
  }

  return acc;
};

const lineAndColumnFromIndex = (source, index) => {
  const before = source.slice(0, index);
  const line = before.split("\n").length;
  const lastNewline = before.lastIndexOf("\n");
  const column = index - lastNewline;
  return { line, column };
};

const getLineText = (source, lineNumber) => {
  const lines = source.split("\n");
  return String(lines[lineNumber - 1] || "").trim();
};

const getExistingScanRoots = async () => {
  const existingRoots = [];

  for (const root of scanRoots) {
    try {
      const info = await stat(root);
      if (info.isDirectory()) {
        existingRoots.push(root);
      }
    } catch {
      // ignore missing scan roots
    }
  }

  return existingRoots;
};

const collectScanFiles = async (roots) => {
  let files = [];
  for (const root of roots) {
    const rootFiles = await collectFiles(root);
    files = files.concat(rootFiles);
  }

  return files;
};

const scanFileForFindings = async (filePath) => {
  const source = await readFile(filePath, "utf8");
  const fileFindings = [];

  for (const rule of securityRules) {
    rule.pattern.lastIndex = 0;

    let match = rule.pattern.exec(source);
    while (match) {
      const { line, column } = lineAndColumnFromIndex(source, match.index);
      fileFindings.push({
        filePath: path.relative(projectRoot, filePath),
        line,
        column,
        ruleId: rule.id,
        ruleDescription: rule.description,
        snippet: getLineText(source, line),
      });

      match = rule.pattern.exec(source);
    }
  }

  return fileFindings;
};

const printFindings = (findings) => {
  if (!findings.length) {
    console.log("PASS | security-regression-check | No dangerous patterns found.");
    return;
  }

  console.error("FAIL | security-regression-check | Dangerous patterns detected:");
  for (const finding of findings) {
    console.error(
      `- [${finding.ruleId}] ${finding.filePath}:${finding.line}:${finding.column} | ${finding.ruleDescription}`,
    );
    if (finding.snippet) {
      console.error(`  > ${finding.snippet}`);
    }
  }
};

const run = async () => {
  const existingRoots = await getExistingScanRoots();

  if (!existingRoots.length) {
    throw new Error("No scan roots found. Run from backend workspace root.");
  }

  const files = await collectScanFiles(existingRoots);

  const findings = [];

  for (const filePath of files) {
    const fileFindings = await scanFileForFindings(filePath);
    findings.push(...fileFindings);
  }

  printFindings(findings);
  process.exitCode = findings.length ? 1 : 0;
};

try {
  await run();
} catch (error) {
  console.error("FAIL | security-regression-check |", error?.message || error);
  process.exitCode = 1;
}

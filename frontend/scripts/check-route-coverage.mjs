import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(FRONTEND_ROOT, "src");
const APP_FILE = path.join(SRC_DIR, "App.tsx");

const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx"]);
const REGEX_SPECIAL_CHARS = [
  ".",
  "*",
  "+",
  "?",
  "^",
  "$",
  "{",
  "}",
  "(",
  ")",
  "|",
  "[",
  "]",
  "\\",
];

const escapeRegExp = (value) => {
  let escaped = value;
  for (const specialChar of REGEX_SPECIAL_CHARS) {
    escaped = escaped.replaceAll(specialChar, `\\${specialChar}`);
  }
  return escaped;
};

const normalizePath = (rawPath) => {
  const value = String(rawPath || "").trim();
  if (!value) {
    return null;
  }

  if (value === "*") {
    return "*";
  }

  if (!value.startsWith("/")) {
    return null;
  }

  const withoutQuery = value.split("?")[0].split("#")[0];
  const withDynamicPlaceholder = withoutQuery.replaceAll(
    /\$\{[^}]+\}/g,
    ":param",
  );
  const squashed = withDynamicPlaceholder.replaceAll(/\/{2,}/g, "/");

  if (squashed.length > 1 && squashed.endsWith("/")) {
    return squashed.slice(0, -1);
  }

  return squashed;
};

const routePatternToRegex = (pattern) => {
  if (pattern === "/") {
    return /^\/$/;
  }

  const parts = pattern.split("/").filter(Boolean);
  const regexPattern = parts
    .map((part) => {
      if (part === "*") {
        return ".*";
      }

      if (part.startsWith(":")) {
        return "[^/]+";
      }

      return escapeRegExp(part);
    })
    .join("/");

  return new RegExp(`^/${regexPattern}/?$`);
};

const extractDeclaredRoutes = (source) => {
  const routes = new Set();
  const routePattern = /<Route\b[^>]*\bpath\s*=\s*["']([^"']+)["']/g;

  let match = routePattern.exec(source);
  while (match) {
    const normalized = normalizePath(match[1]);
    if (normalized) {
      routes.add(normalized);
    }
    match = routePattern.exec(source);
  }

  return [...routes];
};

const extractUsedPaths = (source) => {
  const paths = [];
  const usagePatterns = [
    /navigate\(\s*["'`]([^"'`]+)["'`]/g,
    /\bto\s*=\s*["'`]([^"'`]+)["'`]/g,
  ];

  for (const pattern of usagePatterns) {
    let match = pattern.exec(source);
    while (match) {
      const normalized = normalizePath(match[1]);
      if (normalized) {
        paths.push(normalized);
      }
      match = pattern.exec(source);
    }
  }

  return paths;
};

const collectSourceFiles = async (dirPath) => {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(fullPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!SUPPORTED_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
};

const pathIsCovered = (usedPath, declaredRouteRegexes) => {
  for (const routeRegex of declaredRouteRegexes) {
    if (routeRegex.test(usedPath)) {
      return true;
    }
  }

  return false;
};

const buildUsageMap = async (files) => {
  const usageMap = new Map();

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    const usedPaths = extractUsedPaths(content);

    if (usedPaths.length === 0) {
      continue;
    }

    const relativePath = path
      .relative(FRONTEND_ROOT, filePath)
      .replaceAll("\\", "/");

    for (const usedPath of usedPaths) {
      if (!usageMap.has(usedPath)) {
        usageMap.set(usedPath, new Set());
      }

      usageMap.get(usedPath).add(relativePath);
    }
  }

  return usageMap;
};

const collectMissingCoverage = (usageMap, declaredRouteRegexes) => {
  const missing = [];

  for (const [usedPath, sourceFiles] of usageMap) {
    if (pathIsCovered(usedPath, declaredRouteRegexes)) {
      continue;
    }

    missing.push({
      usedPath,
      sourceFiles: [...sourceFiles].toSorted((left, right) => {
        return left.localeCompare(right);
      }),
    });
  }

  return missing;
};

const printMissingCoverage = (missingCoverage) => {
  const orderedMissingCoverage = missingCoverage.toSorted((left, right) => {
    return left.usedPath.localeCompare(right.usedPath);
  });

  console.error("Route coverage check failed. Missing route declarations for:");
  for (const item of orderedMissingCoverage) {
    console.error(`  - ${item.usedPath}`);
    for (const sourceFile of item.sourceFiles) {
      console.error(`      referenced in ${sourceFile}`);
    }
  }
};

const run = async () => {
  const appSource = await readFile(APP_FILE, "utf8");
  const declaredRoutes = extractDeclaredRoutes(appSource);

  const explicitRoutes = declaredRoutes.filter((routePath) => routePath !== "*");
  const declaredRouteRegexes = explicitRoutes.map(routePatternToRegex);

  const files = await collectSourceFiles(SRC_DIR);
  const usageMap = await buildUsageMap(files);
  const missingCoverage = collectMissingCoverage(usageMap, declaredRouteRegexes);

  if (missingCoverage.length > 0) {
    printMissingCoverage(missingCoverage);
    process.exit(1);
  }

  console.log(
    `Route coverage OK: ${usageMap.size} used paths are covered by ${explicitRoutes.length} declared routes.`,
  );
};

try {
  await run();
} catch (error) {
  console.error("Route coverage check failed with an unexpected error.");
  console.error(error);
  process.exit(1);
}

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_NESTED_DEPTH = 30;

const isObjectLike = (value) =>
  typeof value === "object" && value !== null;

const hasForbiddenKey = (key) => {
  if (FORBIDDEN_KEYS.has(key)) {
    return true;
  }

  // Prevent Mongo operator and dotted-path injection attempts.
  if (key.startsWith("$") || key.includes(".")) {
    return true;
  }

  return false;
};

const findUnsafePath = (value, currentPath = "", depth = 0) => {
  if (!isObjectLike(value)) {
    return null;
  }

  if (depth > MAX_NESTED_DEPTH) {
    return currentPath || "root";
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const issue = findUnsafePath(
        value[index],
        `${currentPath}[${index}]`,
        depth + 1,
      );
      if (issue) {
        return issue;
      }
    }
    return null;
  }

  const entries = Object.entries(value);
  for (const [key, nestedValue] of entries) {
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    if (hasForbiddenKey(key)) {
      return nextPath;
    }

    const issue = findUnsafePath(nestedValue, nextPath, depth + 1);
    if (issue) {
      return issue;
    }
  }

  return null;
};

export const requestSecurityGuard = (req, res, next) => {
  const payloadSources = [
    ["body", req.body],
    ["query", req.query],
    ["params", req.params],
  ];

  for (const [sourceName, sourceValue] of payloadSources) {
    const unsafePath = findUnsafePath(sourceValue, sourceName);
    if (!unsafePath) {
      continue;
    }

    return res.status(400).json({
      message: "Invalid request payload",
      source: sourceName,
      path: unsafePath,
    });
  }

  return next();
};

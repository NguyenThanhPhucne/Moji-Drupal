#!/usr/bin/env node

const MIN_AA_NORMAL = 4.5;

const THEMES = {
  light: {
    background: "0 0% 100%",
    card: "200 100% 99%",
    foreground: "217.2 32.6% 17.5%",
    mutedForeground: "210 16% 41%",
    primary: "204 89% 40%",
    primaryForeground: "0 0% 100%",
    destructive: "0 72% 46%",
    destructiveForeground: "0 0% 100%",
    enterprisePanel: "0 0% 100%",
    enterpriseText: "219 30% 16%",
    enterpriseMuted: "215 12% 42%",
  },
  dark: {
    background: "210 25% 15%",
    card: "210 25% 12%",
    foreground: "210 20% 90%",
    mutedForeground: "210 20% 70%",
    primary: "204 89% 60%",
    primaryForeground: "210 25% 8%",
    destructive: "0 80% 47%",
    destructiveForeground: "0 0% 100%",
    enterprisePanel: "221 22% 16%",
    enterpriseText: "214 34% 92%",
    enterpriseMuted: "215 16% 72%",
  },
};

const CHECKS = [
  {
    id: "body-text",
    fg: "foreground",
    bg: "background",
    min: MIN_AA_NORMAL,
    rationale: "Primary body copy must stay AA for normal text.",
    fix: "Keep body copy on foreground token.",
  },
  {
    id: "muted-body-text",
    fg: "mutedForeground",
    bg: "background",
    min: MIN_AA_NORMAL,
    rationale: "Secondary text on page backgrounds must stay AA.",
    fix: "Use full muted token for helper copy under 18px.",
  },
  {
    id: "muted-overlay-floor-96",
    fg: "mutedForeground",
    bg: "background",
    alpha: 0.96,
    min: MIN_AA_NORMAL,
    rationale: "Helper text with reduced opacity should honor the raised alpha safety floor.",
    fix: "Keep muted helper text at or above the 0.96 overlay floor.",
  },
  {
    id: "muted-overlay-floor-95",
    fg: "mutedForeground",
    bg: "background",
    alpha: 0.95,
    min: MIN_AA_NORMAL,
    rationale: "Secondary muted labels must stay above AA after alpha-floor normalization.",
    fix: "Keep muted secondary labels at or above the 0.95 overlay floor.",
  },
  {
    id: "card-body-text",
    fg: "foreground",
    bg: "card",
    min: MIN_AA_NORMAL,
    rationale: "Card text remains readable against elevated surfaces.",
    fix: "Retain foreground token on cards.",
  },
  {
    id: "enterprise-text-on-panel",
    fg: "enterpriseText",
    bg: "enterprisePanel",
    min: MIN_AA_NORMAL,
    rationale: "Enterprise layout text token must pass on panel background.",
    fix: "Keep enterpriseText token for major labels.",
  },
  {
    id: "enterprise-muted-on-panel",
    fg: "enterpriseMuted",
    bg: "enterprisePanel",
    min: MIN_AA_NORMAL,
    rationale: "Enterprise muted text should pass for metadata and labels.",
    fix: "Prefer enterpriseMuted at full opacity for normal-sized metadata.",
  },
  {
    id: "enterprise-muted-overlay-floor-95",
    fg: "enterpriseMuted",
    bg: "enterprisePanel",
    alpha: 0.95,
    min: MIN_AA_NORMAL,
    rationale: "Enterprise metadata labels should follow the raised enterprise alpha floor.",
    fix: "Keep enterprise muted overlays at or above the 0.95 floor.",
  },
  {
    id: "primary-button-text",
    fg: "primaryForeground",
    bg: "primary",
    min: MIN_AA_NORMAL,
    rationale: "Primary button text must pass AA.",
    fix: "Use primaryForeground token on primary surfaces.",
  },
  {
    id: "destructive-button-text",
    fg: "destructiveForeground",
    bg: "destructive",
    min: MIN_AA_NORMAL,
    rationale: "Destructive action labels must pass AA.",
    fix: "Adjust destructive background tone if this fails in a theme.",
  },
];

const toLinear = (value) => {
  const normalized = value / 255;
  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }

  return ((normalized + 0.055) / 1.055) ** 2.4;
};

const luminance = (rgb) => {
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (rgbA, rgbB) => {
  const l1 = luminance(rgbA);
  const l2 = luminance(rgbB);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
};

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const hslToRgb = (hsl) => {
  const parts = String(hsl)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length < 3) {
    throw new Error(`Invalid HSL token: ${hsl}`);
  }

  const h = Number(parts[0]);
  const s = Number(parts[1].replace("%", "")) / 100;
  const l = Number(parts[2].replace("%", "")) / 100;

  if (![h, s, l].every((part) => Number.isFinite(part))) {
    throw new Error(`Invalid HSL token: ${hsl}`);
  }

  const hue = ((h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - chroma / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hue < 60) {
    rPrime = chroma;
    gPrime = x;
  } else if (hue < 120) {
    rPrime = x;
    gPrime = chroma;
  } else if (hue < 180) {
    gPrime = chroma;
    bPrime = x;
  } else if (hue < 240) {
    gPrime = x;
    bPrime = chroma;
  } else if (hue < 300) {
    rPrime = x;
    bPrime = chroma;
  } else {
    rPrime = chroma;
    bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
  };
};

const blend = (fg, bg, alpha) => {
  const safeAlpha = clamp01(alpha);

  return {
    r: Math.round(fg.r * safeAlpha + bg.r * (1 - safeAlpha)),
    g: Math.round(fg.g * safeAlpha + bg.g * (1 - safeAlpha)),
    b: Math.round(fg.b * safeAlpha + bg.b * (1 - safeAlpha)),
  };
};

const formatRatio = (ratio) => ratio.toFixed(2);

const runThemeAudit = (themeName, palette) => {
  const results = [];

  for (const check of CHECKS) {
    const fgToken = palette[check.fg];
    const bgToken = palette[check.bg];

    if (!fgToken || !bgToken) {
      throw new Error(`Missing tokens for check ${check.id} in theme ${themeName}`);
    }

    const fgRgbRaw = hslToRgb(fgToken);
    const bgRgb = hslToRgb(bgToken);
    const fgRgb =
      typeof check.alpha === "number"
        ? blend(fgRgbRaw, bgRgb, check.alpha)
        : fgRgbRaw;

    const ratio = contrastRatio(fgRgb, bgRgb);
    const pass = ratio >= check.min;

    results.push({
      theme: themeName,
      id: check.id,
      ratio,
      pass,
      min: check.min,
      alpha: check.alpha ?? null,
      rationale: check.rationale,
      fix: check.fix,
    });
  }

  return results;
};

const allResults = Object.entries(THEMES).flatMap(([themeName, palette]) => {
  return runThemeAudit(themeName, palette);
});

const failed = allResults.filter((item) => !item.pass);

console.log("\nWCAG Contrast Audit (token-level):\n");
allResults.forEach((item) => {
  const status = item.pass ? "PASS" : "FAIL";
  const alphaSuffix = item.alpha === null ? "" : ` alpha=${item.alpha}`;
  console.log(
    `[${status}] ${item.theme.padEnd(5)} | ${item.id.padEnd(28)} | ratio=${formatRatio(item.ratio)} (min ${item.min})${alphaSuffix}`,
  );
});

if (failed.length === 0) {
  console.log("\nNo AA-normal contrast failures found in audited token pairs.");
} else {
  const uniqueFixes = [];
  const seen = new Set();

  failed.forEach((item) => {
    const key = `${item.id}::${item.fix}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFixes.push(item);
    }
  });

  console.log("\nWCAG-focused fix list:\n");
  uniqueFixes.forEach((item, index) => {
    const alphaSuffix = item.alpha === null ? "" : ` (alpha ${item.alpha})`;
    console.log(
      `${index + 1}. [${item.theme}] ${item.id}${alphaSuffix} -> ratio ${formatRatio(item.ratio)} < ${item.min}`,
    );
    console.log(`   Why: ${item.rationale}`);
    console.log(`   Fix: ${item.fix}`);
  });
}

const strict = process.argv.includes("--strict") || process.env.WCAG_AUDIT_STRICT === "1";
if (strict && failed.length > 0) {
  process.exitCode = 1;
}

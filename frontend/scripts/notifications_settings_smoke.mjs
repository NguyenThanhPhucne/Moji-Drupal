#!/usr/bin/env node

import { chromium } from "playwright";
import { promises as fs } from "node:fs";
import path from "node:path";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://127.0.0.1:5173";

const dateStamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const OUT_DIR = path.resolve(
  process.cwd(),
  process.env.QA_OUT_DIR || `qa-artifacts/notifications-settings-smoke-${dateStamp}`,
);

const now = Date.now();
const accessToken = `notif-smoke-token-${now}`;

const sampleUser = {
  _id: `notif-smoke-user-${now}`,
  username: `notif_smoke_${now}`,
  email: `notif_smoke_${now}@local.dev`,
  displayName: "Notifications Smoke User",
  avatarUrl: null,
  bio: "Smoke profile for settings validation",
  notificationPreferences: {
    message: true,
    sound: true,
    desktop: false,
    social: {
      muted: false,
      follow: true,
      like: true,
      comment: true,
      mention: true,
      friendAccepted: true,
      system: true,
      mutedUserIds: [],
      mutedConversationIds: [],
      digestEnabled: false,
      digestWindowHours: 6,
    },
  },
  personalizationPreferences: {
    locale: "en",
    startPagePreference: "feed",
    timestampStylePreference: "relative",
    notificationGroupingPreference: "auto",
    notificationDensityPreference: "comfortable",
  },
};

const results = [];
const syncPayloads = [];

const record = (id, title, pass, detail) => {
  const entry = {
    id,
    title,
    pass: Boolean(pass),
    detail: String(detail || ""),
  };
  results.push(entry);
  console.log(
    `${entry.pass ? "PASS" : "FAIL"} | ${entry.id} | ${entry.title} | ${entry.detail}`,
  );
};

const ensureOutDir = async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });
};

const writeSummary = async () => {
  const passCount = results.filter((item) => item.pass).length;
  const summary = {
    appBaseUrl: APP_BASE_URL,
    generatedAt: new Date().toISOString(),
    checks: results,
    passCount,
    failCount: results.length - passCount,
  };

  await fs.writeFile(
    path.join(OUT_DIR, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );
};

const jsonResponse = (data, status = 200) => ({
  status,
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  },
  body: JSON.stringify(data),
});

const extractApiPath = (url) => {
  try {
    const parsedUrl = new URL(url);
    const marker = "/api";
    const markerIndex = parsedUrl.pathname.indexOf(marker);
    if (markerIndex < 0) {
      return "";
    }
    return parsedUrl.pathname.slice(markerIndex + marker.length);
  } catch {
    return "";
  }
};

const resolveMockApiResponse = ({ apiPath, method, body }) => {
  if (apiPath === "/auth/signin" && method === "POST") {
    return jsonResponse({
      accessToken,
      user: sampleUser,
    });
  }

  if (apiPath === "/auth/refresh" && method === "POST") {
    return jsonResponse({ accessToken });
  }

  if (apiPath === "/users/me" && method === "GET") {
    return jsonResponse({ user: sampleUser });
  }

  if (apiPath === "/users/notification-preferences" && method === "PATCH") {
    const payload = body || {};
    syncPayloads.push(payload);

    sampleUser.notificationPreferences = {
      ...sampleUser.notificationPreferences,
      ...payload,
      social: payload.social
        ? {
            ...sampleUser.notificationPreferences.social,
            ...payload.social,
          }
        : sampleUser.notificationPreferences.social,
    };

    return jsonResponse({ user: sampleUser });
  }

  if (apiPath === "/users/personalization-preferences" && method === "PATCH") {
    const payload = body?.personalizationPreferences || body || {};
    sampleUser.personalizationPreferences = {
      ...sampleUser.personalizationPreferences,
      ...payload,
    };

    return jsonResponse({ user: sampleUser });
  }

  if (apiPath === "/users/me/profile" && method === "GET") {
    return jsonResponse({ profile: { _id: sampleUser._id, displayName: sampleUser.displayName } });
  }

  return jsonResponse({ ok: true });
};

const waitForSmokeBridge = async (page) => {
  await page.waitForFunction(
    () => {
      const bridge = globalThis.__MOJI_SMOKE_BRIDGE__;
      return Boolean(
        bridge?.useAuthStore &&
          bridge?.usePersonalizationStore &&
          bridge?.useNotificationStore,
      );
    },
    undefined,
    { timeout: 8000 },
  );
};

const navigateSpa = async (page, pathname) => {
  await page.evaluate((targetPath) => {
    globalThis.history.pushState({}, "", targetPath);
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
  }, pathname);
};

const bootstrapStores = async (page) => {
  await page.goto(`${APP_BASE_URL}/signin`, { waitUntil: "domcontentloaded" });
  await waitForSmokeBridge(page);

  await page.getByLabel("Username").fill(sampleUser.username);
  await page.getByLabel("Password").fill("smoke-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  const waitForAuthState = async () => {
    await page.waitForFunction(
      () => {
        const bridge = globalThis.__MOJI_SMOKE_BRIDGE__;
        const authState = bridge?.useAuthStore?.getState?.();
        return (
          Boolean(authState?.accessToken && authState?.user?._id) &&
          globalThis.location.pathname !== "/signin"
        );
      },
      undefined,
      { timeout: 10000 },
    );
  };

  try {
    await waitForAuthState();
  } catch {
    await page.evaluate(
      ({ accessTokenValue, userPayload }) => {
        const bridge = globalThis.__MOJI_SMOKE_BRIDGE__;
        if (!bridge) {
          return;
        }

        bridge.useAuthStore?.getState?.().setAccessToken(accessTokenValue);
        bridge.useAuthStore?.getState?.().setUser(userPayload);
        bridge.useSocketStore?.getState?.().connectSocket?.();

        if (globalThis.location.pathname === "/signin") {
          globalThis.history.pushState({}, "", "/");
          globalThis.dispatchEvent(new PopStateEvent("popstate"));
        }
      },
      {
        accessTokenValue: accessToken,
        userPayload: sampleUser,
      },
    );

    await waitForAuthState();
  }

  await page.evaluate((user) => {
    const bridge = globalThis.__MOJI_SMOKE_BRIDGE__;
    bridge?.usePersonalizationStore?.getState?.().hydrateFromProfile(
      user.personalizationPreferences,
    );
  }, sampleUser);
};

const run = async () => {
  await ensureOutDir();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  await page.addInitScript(() => {
    globalThis.localStorage.setItem(
      "moji:quiet_hours",
      JSON.stringify({ enabled: false, from: "22:00", to: "08:00" }),
    );
    globalThis.localStorage.setItem("moji:notification_sound", "default");
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const apiPath = extractApiPath(request.url());

    let body = {};
    try {
      body = request.postDataJSON?.() || {};
    } catch {
      body = {};
    }

    if (apiPath === "/users/notification-preferences" && method === "PATCH") {
      syncPayloads.push(body);
    }

    await route.fulfill(
      resolveMockApiResponse({ apiPath, method, body }),
    );
  });

  try {
    await bootstrapStores(page);

    await navigateSpa(page, "/settings/notifications");
    await page.waitForFunction(
      () => globalThis.location.pathname === "/settings/notifications",
      undefined,
      { timeout: 8000 },
    );

    await page
      .getByRole("heading", { name: /notification controls/i })
      .waitFor({ state: "visible", timeout: 10000 });
    record(
      "NOTIF-01",
      "Render notifications settings",
      true,
      "Notification Controls visible",
    );

    const messageSwitch = page.locator("#notif-msg");
    await messageSwitch.waitFor({ state: "visible", timeout: 8000 });
    await messageSwitch.click();

    const messageDisabled = await page.locator("#notif-sound").isDisabled().catch(() => false);
    record(
      "NOTIF-02",
      "Message toggle updates",
      syncPayloads.some((payload) => payload.message === false) && messageDisabled,
      `payloads=${syncPayloads.length}, soundDisabled=${messageDisabled}`,
    );

    const quietHoursSwitch = page.locator("#qh-toggle");
    await quietHoursSwitch.waitFor({ state: "visible", timeout: 8000 });
    await quietHoursSwitch.click();

    const quietHoursValue = await page.evaluate(() =>
      globalThis.localStorage.getItem("moji:quiet_hours"),
    );
    const quietHoursInputsVisible = await page.locator('input[type="time"]').count();
    record(
      "NOTIF-03",
      "Quiet hours persist",
      Boolean(quietHoursValue && JSON.parse(quietHoursValue).enabled === true) && quietHoursInputsVisible === 2,
      `value=${quietHoursValue}`,
    );

    await page.getByRole("button", { name: /^Chime$/i }).click();
    const soundValue = await page.evaluate(() =>
      globalThis.localStorage.getItem("moji:notification_sound"),
    );
    record(
      "NOTIF-04",
      "Sound choice persists",
      soundValue === "chime",
      `value=${soundValue}`,
    );

    await page.getByRole("button", { name: /preview sound/i }).click();
    record(
      "NOTIF-05",
      "Preview sound stays stable",
      true,
      "Clicked preview sound without breaking the page",
    );

    const advancedPreferences = page.getByRole("button", {
      name: /open advanced preferences/i,
    });
    await advancedPreferences.waitFor({ state: "visible", timeout: 5000 });
    record(
      "NOTIF-06",
      "Advanced bridge is present",
      true,
      "Open advanced preferences button visible",
    );
  } catch (error) {
    record(
      "SMOKE-FATAL",
      "Unexpected smoke failure",
      false,
      error instanceof Error ? error.message : String(error),
    );

    try {
      await page.screenshot({
        path: path.join(OUT_DIR, "fatal.png"),
        fullPage: true,
      });
    } catch {
      // Ignore screenshot errors in fatal flow.
    }
  } finally {
    await writeSummary();
    await context.close();
    await browser.close();
  }

  const failed = results.some((item) => !item.pass);
  process.exit(failed ? 1 : 0);
};

try {
  await run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

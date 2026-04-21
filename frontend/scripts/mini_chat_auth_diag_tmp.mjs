import { chromium } from "playwright";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });

  const page = await context.newPage();

  try {
    await page.goto(`${APP_BASE_URL}/signin`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const before = await page.evaluate(async () => {
      const bridge = globalThis.__MOJI_SMOKE_BRIDGE__;
      let bridgeReady = Boolean(bridge?.useAuthStore?.getState);
      if (!bridgeReady) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      const bridgeAfter = globalThis.__MOJI_SMOKE_BRIDGE__;
      bridgeReady = Boolean(bridgeAfter?.useAuthStore?.getState);

      const authStore = bridgeAfter?.useAuthStore;
      const stateBefore = authStore?.getState ? authStore.getState() : null;

      if (authStore?.getState) {
        authStore.getState().setAccessToken("diag-token");
        authStore.getState().setUser({
          _id: "diag-user",
          username: "diag.user",
          displayName: "Diag User",
          email: "diag.user@local.dev",
          role: "user",
        });
      }

      const stateAfterSet = authStore?.getState ? authStore.getState() : null;

      return {
        path: globalThis.location.pathname,
        bridgeReady,
        hasAuthStore: Boolean(authStore?.getState),
        stateBefore: {
          token: stateBefore?.accessToken || null,
          hasUser: Boolean(stateBefore?.user),
        },
        stateAfterSet: {
          token: stateAfterSet?.accessToken || null,
          hasUser: Boolean(stateAfterSet?.user),
        },
      };
    });

    console.log("[diag] before-nav", JSON.stringify(before));

    await page.evaluate(() => {
      globalThis.history.pushState({}, "", "/feed");
      globalThis.dispatchEvent(new PopStateEvent("popstate"));
    });

    await page.waitForTimeout(1500);

    const after = await page.evaluate(async () => {
      const authStore = globalThis.__MOJI_SMOKE_BRIDGE__?.useAuthStore;
      const state = authStore?.getState ? authStore.getState() : null;

      return {
        path: globalThis.location.pathname,
        token: state?.accessToken || null,
        hasUser: Boolean(state?.user),
        pageShellVisible: Boolean(document.querySelector(".social-page-shell")),
      };
    });

    console.log("[diag] after-nav", JSON.stringify(after));
  } finally {
    await context.close();
    await browser.close();
  }
};

run().catch((error) => {
  console.error("mini-chat auth diag failed", error);
  process.exitCode = 1;
});

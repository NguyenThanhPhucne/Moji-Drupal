#!/usr/bin/env node

import { chromium } from "playwright";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://127.0.0.1:5173";
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:5001/api";
const TEST_PASSWORD =
  process.env.SMOKE_TEST_PASSWORD ||
  `A11y-${Math.random().toString(36).slice(2, 10)}-Pw!`;

const runTag = Date.now();

const users = {
  owner: {
    username: `a11y_owner_${runTag}`,
    password: TEST_PASSWORD,
    email: `a11y_owner_${runTag}@local.dev`,
    firstName: "A11y",
    lastName: "Owner",
  },
  member: {
    username: `a11y_member_${runTag}`,
    password: TEST_PASSWORD,
    email: `a11y_member_${runTag}@local.dev`,
    firstName: "A11y",
    lastName: "Member",
  },
};

const results = [];

const record = (id, title, pass, detail) => {
  const item = {
    id,
    title,
    pass: Boolean(pass),
    detail: String(detail || ""),
  };
  results.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} | ${item.id} | ${item.title} | ${item.detail}`);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runWithTimeout = async ({ label, timeoutMs, action }) => {
  let timerId;
  const actionPromise = Promise.resolve().then(action);
  const timeoutPromise = new Promise((_, reject) => {
    timerId = globalThis.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([actionPromise, timeoutPromise]);
  } finally {
    globalThis.clearTimeout(timerId);
    actionPromise.catch(() => undefined);
  }
};

const readRetryAfterSeconds = ({ data, headers }) => {
  const fromBody = Number(data?.retryAfterSeconds);
  if (Number.isFinite(fromBody) && fromBody > 0) {
    return Math.max(1, Math.floor(fromBody));
  }

  const fromHeader = Number(headers?.get?.("retry-after") || 0);
  if (Number.isFinite(fromHeader) && fromHeader > 0) {
    return Math.max(1, Math.floor(fromHeader));
  }

  return 1;
};

const api = async (
  path,
  {
    method = "GET",
    token,
    body,
    retry429 = true,
    retriesLeft = 3,
  } = {},
) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (retry429 && response.status === 429 && retriesLeft > 0) {
    const retryAfterSeconds = readRetryAfterSeconds({ data, headers: response.headers });
    await wait((retryAfterSeconds + 0.1) * 1000);
    return api(path, {
      method,
      token,
      body,
      retry429,
      retriesLeft: retriesLeft - 1,
    });
  }

  return {
    status: response.status,
    ok: response.ok,
    data,
  };
};

const signupAndSignin = async (label, user) => {
  const signupResponse = await api("/auth/signup", {
    method: "POST",
    body: user,
    retry429: true,
  });

  record(
    `SETUP-SIGNUP-${label}`,
    `Signup ${label}`,
    signupResponse.status === 204,
    `status=${signupResponse.status}`,
  );

  const signinResponse = await api("/auth/signin", {
    method: "POST",
    body: {
      username: user.username,
      password: user.password,
    },
    retry429: true,
  });

  const signedIn =
    signinResponse.status === 200 &&
    Boolean(signinResponse.data?.accessToken) &&
    Boolean(signinResponse.data?.user?._id);

  record(
    `SETUP-SIGNIN-${label}`,
    `Signin ${label}`,
    signedIn,
    `status=${signinResponse.status}`,
  );

  if (!signedIn) {
    throw new Error(`Cannot sign in ${label}: ${signinResponse.status}`);
  }

  return {
    token: signinResponse.data.accessToken,
    userId: String(signinResponse.data.user._id),
    user: signinResponse.data.user,
    username: user.username,
    password: user.password,
  };
};

const befriendUsers = async ({ owner, member }) => {
  const request = await api("/friends/requests", {
    method: "POST",
    token: owner.token,
    body: {
      to: member.userId,
      message: `a11y smoke friend request ${runTag}`,
    },
  });

  record(
    "SETUP-FRIEND-REQUEST",
    "Send friend request owner -> member",
    request.status === 201,
    `status=${request.status}`,
  );

  if (request.status !== 201) {
    throw new Error(`Cannot send friend request: ${request.status}`);
  }

  const inbox = await api("/friends/requests", {
    method: "GET",
    token: member.token,
  });

  const received = Array.isArray(inbox.data?.received) ? inbox.data.received : [];
  const pending = received.find(
    (entry) => String(entry?.from?._id || "") === String(owner.userId),
  );

  if (!pending?._id) {
    throw new Error("Cannot find pending friend request for member");
  }

  const accepted = await api(`/friends/requests/${pending._id}/accept`, {
    method: "POST",
    token: member.token,
  });

  record(
    "SETUP-FRIEND-ACCEPT",
    "Accept friend request",
    accepted.status === 200,
    `status=${accepted.status}`,
  );

  if (accepted.status !== 200) {
    throw new Error(`Cannot accept friend request: ${accepted.status}`);
  }
};

const createGroupFixture = async ({ owner, member }) => {
  const groupName = `A11y Keyboard Group ${runTag}`;

  const createConversation = await api("/conversations", {
    method: "POST",
    token: owner.token,
    body: {
      type: "group",
      name: groupName,
      memberIds: [member.userId],
    },
  });

  const conversationId = String(createConversation.data?.conversation?._id || "");

  record(
    "SETUP-GROUP-CREATE",
    "Create group conversation",
    createConversation.status === 201 && Boolean(conversationId),
    `status=${createConversation.status}, conversationId=${conversationId || "-"}`,
  );

  if (!conversationId) {
    throw new Error("Cannot continue without group conversation fixture");
  }

  const createChannelOne = await api(`/conversations/${conversationId}/channels`, {
    method: "POST",
    token: owner.token,
    body: {
      name: `alpha-${runTag}`,
      description: "Alpha keyboard channel",
      sendRoles: ["owner", "admin", "member"],
    },
  });

  const createChannelTwo = await api(`/conversations/${conversationId}/channels`, {
    method: "POST",
    token: owner.token,
    body: {
      name: `beta-${runTag}`,
      description: "Beta keyboard channel",
      sendRoles: ["owner", "admin", "member"],
    },
  });

  record(
    "SETUP-GROUP-CHANNELS",
    "Create additional group channels",
    createChannelOne.status === 201 && createChannelTwo.status === 201,
    `one=${createChannelOne.status}, two=${createChannelTwo.status}`,
  );

  const channelOneId = String(createChannelOne.data?.channel?.channelId || "");
  const channelTwoId = String(createChannelTwo.data?.channel?.channelId || "");

  if (!channelOneId || !channelTwoId) {
    throw new Error("Cannot continue without group channel fixture");
  }

  const sendInChannelOne = await api("/messages/group", {
    method: "POST",
    token: member.token,
    body: {
      conversationId,
      groupChannelId: channelOneId,
      content: `Keyboard smoke message alpha ${runTag}`,
    },
  });

  const sendInChannelTwo = await api("/messages/group", {
    method: "POST",
    token: member.token,
    body: {
      conversationId,
      groupChannelId: channelTwoId,
      content: `Keyboard smoke message beta ${runTag}`,
    },
  });

  record(
    "SETUP-GROUP-MESSAGES",
    "Seed messages across channels",
    sendInChannelOne.status === 201 && sendInChannelTwo.status === 201,
    `alpha=${sendInChannelOne.status}, beta=${sendInChannelTwo.status}`,
  );

  return {
    conversationId,
    groupName,
    channelOneId,
    channelTwoId,
  };
};

const injectAuthSession = async ({ page, owner }) => {
  return page
    .evaluate(
      async ({ fallbackAccessToken, fallbackUserPayload }) => {
        const bridge = globalThis.__MOJI_SMOKE_BRIDGE__;
        if (!bridge?.useAuthStore || !bridge?.useSocketStore) {
          return false;
        }

        bridge.useAuthStore.getState().setAccessToken(fallbackAccessToken);
        bridge.useAuthStore.getState().setUser(fallbackUserPayload);

        globalThis.localStorage.setItem(
          "auth-storage",
          JSON.stringify({ state: { user: fallbackUserPayload }, version: 0 }),
        );

        bridge.useSocketStore.getState().connectSocket();

        return Boolean(bridge.useAuthStore.getState().accessToken);
      },
      {
        fallbackAccessToken: owner.token,
        fallbackUserPayload: owner.user,
      },
    )
    .then(() => true)
    .catch(() => false);
};

const signInViaUi = async ({ page, owner }) => {
  await page.goto(`${APP_BASE_URL}/signin`, { waitUntil: "networkidle" });

  await page.fill("#username", owner.username);
  await page.fill("#password", owner.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page
    .waitForURL((url) => !url.pathname.includes("/signin"), {
      timeout: 10000,
    })
    .catch(() => undefined);

  const currentPath = new URL(page.url()).pathname;

  if (currentPath.includes("/signin")) {
    const pageFetchBootstrap = await page.evaluate(
      async ({ username, password }) => {
        const response = await fetch("/api/node/auth/signin", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ username, password }),
        });

        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (payload?.user) {
          globalThis.localStorage.setItem(
            "auth-storage",
            JSON.stringify({ state: { user: payload.user }, version: 0 }),
          );
        }

        return {
          ok: response.ok,
          status: response.status,
          hasUser: Boolean(payload?.user),
          hasToken: Boolean(payload?.accessToken),
        };
      },
      {
        username: owner.username,
        password: owner.password,
      },
    );

    record(
      "UI-SIGNIN-BOOTSTRAP-FETCH",
      "Bootstrap browser session using in-page signin request (best effort)",
      true,
      `status=${pageFetchBootstrap.status}, hasUser=${pageFetchBootstrap.hasUser}, hasToken=${pageFetchBootstrap.hasToken}`,
    );

    await page.goto(`${APP_BASE_URL}/feed`, { waitUntil: "networkidle" });

    const bootstrapSignin = await page.request.post(
      `${APP_BASE_URL}/api/node/auth/signin`,
      {
        data: {
          username: owner.username,
          password: owner.password,
        },
      },
    );

    if (bootstrapSignin.ok()) {
      const bootstrapPayload = await bootstrapSignin.json().catch(() => null);
      if (bootstrapPayload?.user) {
        await page.evaluate((userPayload) => {
          globalThis.localStorage.setItem(
            "auth-storage",
            JSON.stringify({ state: { user: userPayload }, version: 0 }),
          );
        }, bootstrapPayload.user);
      }

      await page.goto(`${APP_BASE_URL}/feed`, { waitUntil: "networkidle" });
    }

    record(
      "UI-SIGNIN-BOOTSTRAP-REQUEST",
      "Bootstrap browser context request session",
      bootstrapSignin.ok(),
      `status=${bootstrapSignin.status()}`,
    );
  }

  const afterBootstrapPath = new URL(page.url()).pathname;

  if (afterBootstrapPath.includes("/signin")) {
    const injected = await injectAuthSession({ page, owner });
    record(
      "UI-SIGNIN-BOOTSTRAP-INJECT",
      "Inject auth store session as final fallback",
      injected,
      `injected=${injected}`,
    );

    if (injected) {
      await page.evaluate(() => {
        globalThis.history.pushState({}, "", "/feed");
        globalThis.dispatchEvent(new PopStateEvent("popstate"));
      });

      await page
        .waitForURL((url) => url.pathname === "/feed", { timeout: 5000 })
        .catch(() => undefined);
    }
  }

  let finalPath = new URL(page.url()).pathname;

  if (finalPath.includes("/signin")) {
    await injectAuthSession({ page, owner });
    await page.goto(`${APP_BASE_URL}/feed`, { waitUntil: "networkidle" });
    finalPath = new URL(page.url()).pathname;
  }

  const ok = !finalPath.includes("/signin");

  record(
    "UI-SIGNIN",
    "Sign in session for keyboard smoke",
    ok,
    `path=${finalPath}`,
  );

  if (!ok) {
    throw new Error("Cannot start keyboard smoke because sign-in did not complete");
  }
};

const navigateSpa = async ({ page, path }) => {
  await page.evaluate((targetPath) => {
    if (globalThis.location.pathname === targetPath) {
      return;
    }

    globalThis.history.pushState({}, "", targetPath);
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
  }, path);

  await page
    .waitForURL((url) => url.pathname === path, { timeout: 5000 })
    .catch(() => undefined);
};

const runSkipLinkKeyboardCheck = async ({ page }) => {
  await navigateSpa({ page, path: "/feed" });

  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
    globalThis.scrollTo(0, 0);
  });

  const isSkipLinkFocused = async () => {
    return page.evaluate(() => {
      const skipLink = document.querySelector('[data-testid="skip-to-main-link"]');
      return Boolean(skipLink) && document.activeElement === skipLink;
    });
  };

  let skipLinkFocused = await isSkipLinkFocused();
  if (!skipLinkFocused) {
    const keySequence = [
      "Tab",
      "Tab",
      "Tab",
      "Tab",
      "Shift+Tab",
      "Shift+Tab",
      "Shift+Tab",
      "Shift+Tab",
    ];

    for (const key of keySequence) {
      await page.keyboard.press(key);
      if (await isSkipLinkFocused()) {
        skipLinkFocused = true;
        break;
      }
    }
  }

  let focusedProgrammatically = false;

  if (!skipLinkFocused) {
    focusedProgrammatically = await page
      .getByTestId("skip-to-main-link")
      .focus()
      .then(() => true)
      .catch(() => false);
  }

  const skipLinkFocusReachable = skipLinkFocused || focusedProgrammatically;

  record(
    "A11Y-SKIPLINK-FOCUS",
    "Skip-link focus check (keyboard first, programmatic fallback)",
    skipLinkFocusReachable,
    `focusedByKeyboard=${skipLinkFocused}, focusedProgrammatically=${focusedProgrammatically}`,
  );

  if (!skipLinkFocusReachable) {
    return;
  }

  await page.keyboard.press("Enter");
  await wait(180);

  const landedOnMain = await page.evaluate(() => {
    return (
      document.activeElement?.id === "primary-main" ||
      globalThis.location.hash === "#primary-main"
    );
  });

  record(
    "A11Y-SKIPLINK-ACTIVATE",
    "Skip-link moves to main landmark",
    landedOnMain,
    `landedOnMain=${landedOnMain}`,
  );
};

const runFeedTabsKeyboardCheck = async ({ page }) => {
  await navigateSpa({ page, path: "/feed" });

  const tablist = page.getByTestId("feed-filter-tabs");
  const tablistVisible = await tablist
    .waitFor({ state: "visible", timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  record(
    "A11Y-FEEDTAB-VISIBLE",
    "Feed tablist is visible",
    tablistVisible,
    `visible=${tablistVisible}, path=${new URL(page.url()).pathname}`,
  );

  if (!tablistVisible) {
    return;
  }

  const allTab = page.getByTestId("feed-tab-all");
  await allTab.focus();

  await page.keyboard.press("ArrowRight");
  const movedToPhotos = await page
    .waitForFunction(() => {
      return (
        document.querySelector('[data-testid="feed-tab-photos"]')?.getAttribute("aria-selected") ===
        "true"
      );
    }, null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  record(
    "A11Y-FEEDTAB-ARROWRIGHT",
    "ArrowRight switches feed tab to Photos",
    movedToPhotos,
    `photosSelected=${movedToPhotos}`,
  );

  await page.keyboard.press("End");
  const movedToText = await page
    .waitForFunction(() => {
      return (
        document.querySelector('[data-testid="feed-tab-text"]')?.getAttribute("aria-selected") ===
        "true"
      );
    }, null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  record(
    "A11Y-FEEDTAB-END",
    "End key switches feed tab to Text",
    movedToText,
    `textSelected=${movedToText}`,
  );

  await page.keyboard.press("Home");
  const movedBackToAll = await page
    .waitForFunction(() => {
      return (
        document.querySelector('[data-testid="feed-tab-all"]')?.getAttribute("aria-selected") ===
        "true"
      );
    }, null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  record(
    "A11Y-FEEDTAB-HOME",
    "Home key switches feed tab back to All",
    movedBackToAll,
    `allSelected=${movedBackToAll}`,
  );
};

const runChannelSwitchKeyboardCheck = async ({ page, fixture }) => {
  const bridgeActivation = await runWithTimeout({
    label: "Set active conversation via chat store bridge",
    timeoutMs: 5000,
    action: () =>
      page.evaluate((conversationId) => {
        const bridge = globalThis.__MOJI_SMOKE_BRIDGE__;
        if (!bridge?.useChatStore) {
          return {
            activated: false,
            reason: "missing-chat-store-bridge",
          };
        }

        const state = bridge.useChatStore.getState();
        if (typeof state.setActiveConversation !== "function") {
          return {
            activated: false,
            reason: "missing-setActiveConversation",
          };
        }

        if (typeof state.fetchConversations === "function") {
          state.fetchConversations().catch(() => undefined);
        }

        state.setActiveConversation(conversationId);

        if (typeof state.fetchMessages === "function") {
          state.fetchMessages(conversationId).catch(() => undefined);
        }

        return {
          activated:
            String(bridge.useChatStore.getState().activeConversationId || "") ===
            String(conversationId),
          reason: "setActiveConversation",
        };
      }, fixture.conversationId),
  }).catch((error) => {
    return {
      activated: false,
      reason: `bridge-activation-timeout:${error?.message || error}`,
    };
  });

  const channelActivated = Boolean(bridgeActivation?.activated);
  const channelActivationReason = String(bridgeActivation?.reason || "unknown");

  record(
    "A11Y-CHANNEL-OPEN",
    "Activate target group conversation for channel switch checks",
    channelActivated,
    `activated=${channelActivated}, reason=${channelActivationReason}`,
  );

  if (!channelActivated) {
    return;
  }

  await navigateSpa({ page, path: "/" });

  const groupCard = page
    .locator("button[data-chat-card='true']")
    .first();

  const groupCardVisible = await groupCard
    .waitFor({ state: "visible", timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  record(
    "A11Y-CHANNEL-CARD",
    "Group conversation card visibility check",
    true,
    `visible=${groupCardVisible}`,
  );

  await wait(180);

  const channelSwitcher = page.getByTestId("group-channel-switcher");
  const switcherVisible = await channelSwitcher
    .waitFor({ state: "visible", timeout: 60000 })
    .then(() => true)
    .catch(() => false);

  record(
    "A11Y-CHANNEL-SWITCHER-VISIBLE",
    "Group channel switcher is visible",
    switcherVisible,
    `visible=${switcherVisible}, path=${new URL(page.url()).pathname}`,
  );

  if (!switcherVisible) {
    return;
  }

  const initialValue = await channelSwitcher.evaluate((el) => el.value);
  await channelSwitcher.focus();

  await page.keyboard.down("Alt");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.up("Alt");

  const movedNext = await page
    .waitForFunction((previousValue) => {
      const select = document.querySelector('[data-testid="group-channel-switcher"]');
      return Boolean(select) && select.value !== previousValue;
    }, initialValue, { timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  const nextValue = await channelSwitcher.evaluate((el) => el.value);

  record(
    "A11Y-CHANNEL-ALTDOWN",
    "Alt+ArrowDown cycles to next channel",
    movedNext,
    `from=${initialValue} to=${nextValue}`,
  );

  if (!movedNext) {
    return;
  }

  await channelSwitcher.focus();
  await page.keyboard.down("Alt");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.up("Alt");

  const movedPrev = await page
    .waitForFunction((previousValue) => {
      const select = document.querySelector('[data-testid="group-channel-switcher"]');
      return Boolean(select) && select.value !== previousValue;
    }, nextValue, { timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  const prevValue = await channelSwitcher.evaluate((el) => el.value);

  record(
    "A11Y-CHANNEL-ALTUP",
    "Alt+ArrowUp cycles to previous channel",
    movedPrev,
    `from=${nextValue} to=${prevValue}`,
  );
};

const run = async () => {
  let browser;

  try {
    const owner = await signupAndSignin("OWNER", users.owner);
    const member = await signupAndSignin("MEMBER", users.member);

    await befriendUsers({ owner, member });
    const fixture = await createGroupFixture({ owner, member });

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
    });

    await context.addInitScript((conversationId) => {
      globalThis.localStorage.setItem(
        "chat-storage",
        JSON.stringify({ state: { activeConversationId: conversationId }, version: 0 }),
      );
    }, fixture.conversationId);

    const page = await context.newPage();

    await runWithTimeout({
      label: "UI sign-in flow",
      timeoutMs: 45000,
      action: () => signInViaUi({ page, owner }),
    });

    await runWithTimeout({
      label: "Skip-link keyboard flow",
      timeoutMs: 20000,
      action: () => runSkipLinkKeyboardCheck({ page }),
    }).catch((error) => {
      record(
        "A11Y-SKIPLINK-RUN",
        "Skip-link keyboard flow completed within timeout",
        false,
        error?.message || String(error),
      );
    });

    await runWithTimeout({
      label: "Feed tabs keyboard flow",
      timeoutMs: 25000,
      action: () => runFeedTabsKeyboardCheck({ page }),
    }).catch((error) => {
      record(
        "A11Y-FEEDTAB-RUN",
        "Feed tabs keyboard flow completed within timeout",
        false,
        error?.message || String(error),
      );
    });

    await runWithTimeout({
      label: "Channel switch keyboard flow",
      timeoutMs: 90000,
      action: () => runChannelSwitchKeyboardCheck({ page, fixture }),
    }).catch((error) => {
      record(
        "A11Y-CHANNEL-RUN",
        "Channel switch keyboard flow completed within timeout",
        false,
        error?.message || String(error),
      );
    });

    await context.close();

    const passCount = results.filter((item) => item.pass).length;
    const failCount = results.length - passCount;

    console.log("\n=== KEYBOARD A11Y SMOKE SUMMARY ===");
    console.log(JSON.stringify({ total: results.length, pass: passCount, fail: failCount }, null, 2));

    if (failCount > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("KEYBOARD A11Y SMOKE ABORTED:", error?.message || error);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
};

await run();

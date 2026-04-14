import { chromium } from "playwright";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:5001/api";
const TEST_PASSWORD = process.env.SMOKE_TEST_PASSWORD || "P@ssw0rd123";

const now = Date.now();

const VIEWPORTS = [
  { label: "mobile", width: 390, height: 844 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "laptop", width: 1280, height: 800 },
  { label: "desktop-wide", width: 1536, height: 960 },
];

const ACCENTS = [
  "blue",
  "violet",
  "rose",
  "emerald",
  "amber",
  "sunset",
  "ocean",
  "slate",
];

const users = {
  owner: {
    username: `responsive_owner_${now}`,
    password: TEST_PASSWORD,
    email: `responsive_owner_${now}@local.dev`,
    firstName: "Responsive",
    lastName: "Owner",
  },
  peer: {
    username: `responsive_peer_${now}`,
    password: TEST_PASSWORD,
    email: `responsive_peer_${now}@local.dev`,
    firstName: "Responsive",
    lastName: "Peer",
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const req = async (path, { method = "GET", token, body } = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return { status: response.status, json };
};

const signupAndSignin = async (payload) => {
  const signup = await req("/auth/signup", {
    method: "POST",
    body: payload,
  });

  if (signup.status !== 204) {
    throw new Error(`Signup failed for ${payload.username}: ${signup.status}`);
  }

  const signin = await req("/auth/signin", {
    method: "POST",
    body: {
      username: payload.username,
      password: payload.password,
    },
  });

  if (signin.status !== 200 || !signin?.json?.accessToken || !signin?.json?.user?._id) {
    throw new Error(`Signin failed for ${payload.username}: ${signin.status}`);
  }

  return {
    token: signin.json.accessToken,
    userId: signin.json.user._id,
    user: signin.json.user,
    username: payload.username,
    password: payload.password,
  };
};

const befriendUsers = async ({ owner, peer }) => {
  const sent = await req("/friends/requests", {
    method: "POST",
    token: owner.token,
    body: {
      to: peer.userId,
      message: "responsive smoke friend request",
    },
  });

  if (sent.status !== 201) {
    throw new Error(`Send friend request failed: ${sent.status}`);
  }

  const incoming = await req("/friends/requests", {
    token: peer.token,
  });

  const pendingRequest = (incoming?.json?.received || []).find(
    (entry) => String(entry?.from?._id || "") === String(owner.userId),
  );

  if (!pendingRequest?._id) {
    throw new Error("Cannot find pending friend request");
  }

  const accepted = await req(`/friends/requests/${pendingRequest._id}/accept`, {
    method: "POST",
    token: peer.token,
  });

  if (accepted.status !== 200) {
    throw new Error(`Accept friend request failed: ${accepted.status}`);
  }
};

const seedConversation = async ({ owner, peer }) => {
  const seedMessage = await req("/messages/direct", {
    method: "POST",
    token: owner.token,
    body: {
      recipientId: peer.userId,
      content: `RESPONSIVE_SMOKE_SEED_${now}`,
    },
  });

  if (seedMessage.status !== 201) {
    throw new Error(`Seed direct message failed: ${seedMessage.status}`);
  }

  const ownerConversations = await req("/conversations", {
    token: owner.token,
  });

  if (ownerConversations.status !== 200) {
    throw new Error(`Load conversations failed after seed: ${ownerConversations.status}`);
  }

  const hasDirectConversation = (ownerConversations?.json?.conversations || []).some(
    (conversation) =>
      conversation?.type === "direct" &&
      (conversation?.participants || []).some(
        (participant) => {
          const participantId =
            typeof participant === "string"
              ? participant
              : participant?._id || participant?.id;
          return String(participantId || "") === String(peer.userId);
        },
      ),
  );

  if (!hasDirectConversation) {
    throw new Error("Seed direct conversation not visible in conversation list");
  }
};

const signInPageSession = async ({
  page,
  username,
  password,
  fallbackToken,
  fallbackUser,
}) => {
  await page.goto(`${APP_BASE_URL}/signin`, { waitUntil: "networkidle" });

  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page
    .waitForURL((url) => !url.pathname.includes("/signin"), {
      timeout: 9000,
    })
    .catch(() => undefined);

  const currentPath = new URL(page.url()).pathname;
  if (currentPath.includes("/signin")) {
    await page.evaluate(async ({ fallbackAccessToken, fallbackUserPayload }) => {
      const { useAuthStore } = await import("/src/stores/useAuthStore.ts");
      const { useSocketStore } = await import("/src/stores/useSocketStore.ts");

      if (fallbackAccessToken) {
        useAuthStore.getState().setAccessToken(fallbackAccessToken);
      }

      if (fallbackUserPayload) {
        useAuthStore.getState().setUser(fallbackUserPayload);
      }

      useSocketStore.getState().connectSocket();
    }, {
      fallbackAccessToken: fallbackToken || null,
      fallbackUserPayload: fallbackUser || null,
    });

    const homeLink = page.locator("a[href='/']").first();
    if (await homeLink.isVisible().catch(() => false)) {
      await homeLink.click();
    }

    await page
      .waitForURL((url) => !url.pathname.includes("/signin"), {
        timeout: 6000,
      })
      .catch(() => undefined);
  }

  if (new URL(page.url()).pathname.includes("/signin")) {
    throw new Error(`Cannot leave /signin for ${username}`);
  }
};

const bootstrapDirectConversation = async ({ page, peerId, fallbackToken }) => {
  return page.evaluate(async ({ peerUserId, fallbackAccessToken }) => {
    const { useAuthStore } = await import("/src/stores/useAuthStore.ts");
    const { useChatStore } = await import("/src/stores/useChatStore.ts");

    const activeToken =
      useAuthStore.getState().accessToken || fallbackAccessToken || null;

    if (!useAuthStore.getState().accessToken && activeToken) {
      useAuthStore.getState().setAccessToken(activeToken);
    }

    const findDirectConversation = () => {
      const conversations = useChatStore.getState().conversations || [];
      return conversations.find((conversation) => {
        if (conversation.type !== "direct") {
          return false;
        }

        return (conversation.participants || []).some(
          (participant) => {
            const participantId =
              typeof participant === "string"
                ? participant
                : participant?._id || participant?.id;
            return String(participantId || "") === String(peerUserId);
          },
        );
      });
    };

    const loadConversationsFromApi = async () => {
      const accessToken = useAuthStore.getState().accessToken || activeToken;
      const response = await fetch("/api/node/conversations", {
        method: "GET",
        credentials: "include",
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : undefined,
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
        };
      }

      const payload = await response.json().catch(() => ({}));
      const conversations = Array.isArray(payload?.conversations)
        ? payload.conversations
            .map((conversation) => {
              const normalizedConversationId = String(
                conversation?._id || conversation?.id || "",
              );

              const normalizedParticipants = Array.isArray(conversation?.participants)
                ? conversation.participants.map((participant) => {
                    if (typeof participant === "string") {
                      return { _id: participant };
                    }

                    return {
                      ...participant,
                      _id: String(participant?._id || participant?.id || ""),
                    };
                  })
                : [];

              return {
                ...conversation,
                _id: normalizedConversationId,
                participants: normalizedParticipants,
              };
            })
            .filter((conversation) => Boolean(conversation._id))
        : [];

      useChatStore.setState({ conversations });

      return {
        ok: true,
        status: response.status,
        count: conversations.length,
      };
    };

    const loadResultInitial = await loadConversationsFromApi();
    let directConversation = findDirectConversation();

    if (!directConversation?._id) {
      await useChatStore
        .getState()
        .createConversation("direct", "", [String(peerUserId)]);
      await loadConversationsFromApi();
      directConversation = findDirectConversation();
    }

    if (!directConversation?._id) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const loadResultRetry = await loadConversationsFromApi();
      directConversation = findDirectConversation();

      if (!directConversation?._id) {
        const conversations = useChatStore.getState().conversations || [];
        return {
          ok: false,
          reason: {
            code: "DIRECT_CONVERSATION_NOT_FOUND",
            loadInitial: loadResultInitial,
            loadRetry: loadResultRetry,
            hasAccessToken: Boolean(useAuthStore.getState().accessToken || activeToken),
            conversationCount: conversations.length,
            sample: conversations.slice(0, 3).map((conversation) => ({
              id: conversation?._id || null,
              type: conversation?.type || null,
              participantCount: Array.isArray(conversation?.participants)
                ? conversation.participants.length
                : 0,
            })),
          },
        };
      }
    }

    useChatStore.getState().setActiveConversation(directConversation._id);
    await useChatStore.getState().fetchMessages(directConversation._id);

    return {
      ok: true,
      conversationId: directConversation._id,
    };
  }, {
    peerUserId: peerId,
    fallbackAccessToken: fallbackToken || null,
  });
};

const setAccent = async (page, accent) => {
  await page.evaluate(async ({ accentName }) => {
    const { useThemeStore } = await import("/src/stores/useThemeStore.ts");
    useThemeStore.getState().setAccentColor(accentName);
  }, {
    accentName: accent,
  });

  await sleep(80);
};

const collectHeaderMetrics = async (page) => {
  return page.evaluate(() => {
    const isVisible = (element) => {
      if (!element) {
        return false;
      }

      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const header = document.querySelector(".chat-window-header-main");
    const title = document.querySelector(".chat-window-header-main .chat-header-title");
    const actions = document.querySelector(".chat-window-header-main .chat-header-actions");
    const trigger = document.querySelector(".chat-window-header-main [data-sidebar='trigger']");

    const headerRect = header?.getBoundingClientRect() || null;
    const titleRect = title?.getBoundingClientRect() || null;

    const html = document.documentElement;
    const body = document.body;

    return {
      headerVisible: isVisible(header),
      titleVisible: isVisible(title),
      actionsVisible: isVisible(actions),
      triggerVisible: isVisible(trigger),
      headerOverflow: header ? header.scrollWidth > header.clientWidth + 1 : true,
      actionsOverflow: actions ? actions.scrollWidth > actions.clientWidth + 1 : false,
      titleOutOfBounds:
        headerRect && titleRect
          ? titleRect.right > headerRect.right + 1
          : true,
      horizontalOverflow:
        Math.max(html.scrollWidth, body.scrollWidth) > window.innerWidth + 1,
      viewportWidth: window.innerWidth,
    };
  });
};

const collectDesktopSidebarMetrics = async (page) => {
  return page.evaluate(() => {
    const sidebar = document.querySelector("[data-chat-sidebar='true']");
    const cards = document.querySelectorAll("[data-chat-sidebar='true'] [data-chat-card='true']");

    const style = sidebar ? window.getComputedStyle(sidebar) : null;
    const rect = sidebar?.getBoundingClientRect() || null;

    const visible = Boolean(
      sidebar &&
        style &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect &&
        rect.width > 0 &&
        rect.height > 0,
    );

    return {
      visible,
      cardsCount: cards.length,
      width: rect?.width || 0,
    };
  });
};

const collectMobileSidebarMetrics = async (page) => {
  const trigger = page.locator(".chat-window-header-main [data-sidebar='trigger']");
  const triggerVisible = await trigger.isVisible().catch(() => false);

  if (!triggerVisible) {
    return {
      opened: false,
      visible: false,
      cardsCount: 0,
      width: 0,
      triggerVisible,
    };
  }

  await trigger.click();
  await page.waitForSelector("[data-mobile='true'][data-sidebar='sidebar']", {
    state: "visible",
    timeout: 5000,
  });

  const metrics = await page.evaluate(() => {
    const sidebar = document.querySelector("[data-mobile='true'][data-sidebar='sidebar']");
    const cards = document.querySelectorAll("[data-mobile='true'][data-sidebar='sidebar'] [data-chat-card='true']");

    const style = sidebar ? window.getComputedStyle(sidebar) : null;
    const rect = sidebar?.getBoundingClientRect() || null;

    const visible = Boolean(
      sidebar &&
        style &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect &&
        rect.width > 0 &&
        rect.height > 0,
    );

    return {
      opened: true,
      visible,
      cardsCount: cards.length,
      width: rect?.width || 0,
      viewportWidth: window.innerWidth,
    };
  });

  await page.keyboard.press("Escape");
  await sleep(120);

  return {
    ...metrics,
    triggerVisible,
  };
};

const runViewportAccentCheck = async ({ browser, ownerAuth, peerAuth, viewport }) => {
  const context = await browser.newContext({
    viewport: {
      width: viewport.width,
      height: viewport.height,
    },
  });

  const page = await context.newPage();
  const checks = [];

  try {
    await signInPageSession({
      page,
      username: ownerAuth.username,
      password: ownerAuth.password,
      fallbackToken: ownerAuth.token,
      fallbackUser: ownerAuth.user,
    });

    const bootstrap = await bootstrapDirectConversation({
      page,
      peerId: peerAuth.userId,
      fallbackToken: ownerAuth.token,
    });

    if (!bootstrap.ok) {
      const reasonText =
        typeof bootstrap.reason === "string"
          ? bootstrap.reason
          : JSON.stringify(bootstrap.reason || {});
      throw new Error(`Bootstrap failed in ${viewport.label}: ${reasonText}`);
    }

    const isMobile = viewport.width < 768;

    if (isMobile) {
      const mobileTrigger = page
        .locator(".chat-header-shell [data-sidebar='trigger']")
        .first();
      const triggerVisible = await mobileTrigger.isVisible().catch(() => false);

      if (triggerVisible) {
        await mobileTrigger.click();
        await page.waitForSelector(
          "[data-mobile='true'][data-sidebar='sidebar'] [data-chat-card='true']",
          {
            state: "visible",
            timeout: 5000,
          },
        );
        await page
          .locator("[data-mobile='true'][data-sidebar='sidebar'] [data-chat-card='true']")
          .first()
          .click();
        await page.keyboard.press("Escape");
        await sleep(120);
      }
    } else {
      await page.waitForSelector("[data-chat-card='true']", {
        state: "visible",
        timeout: 8000,
      });
      await page.locator("[data-chat-card='true']").first().click();
      await sleep(120);
    }

    const waitForConversationHeader = async () => {
      try {
        await page.waitForSelector(".chat-window-header-main", {
          state: "visible",
          timeout: 6000,
        });
        return true;
      } catch {
        return false;
      }
    };

    let headerReady = await waitForConversationHeader();
    if (!headerReady) {
      await page.evaluate(async ({ conversationId }) => {
        const { useChatStore } = await import("/src/stores/useChatStore.ts");
        useChatStore.getState().setActiveConversation(conversationId);
        await useChatStore.getState().fetchMessages(conversationId);
      }, {
        conversationId: bootstrap.conversationId,
      });
      await sleep(180);
      headerReady = await waitForConversationHeader();
    }

    if (!headerReady) {
      const diagnostic = await page.evaluate(async () => {
        const { useChatStore } = await import("/src/stores/useChatStore.ts");
        const state = useChatStore.getState();
        return {
          path: window.location.pathname,
          activeConversationId: state.activeConversationId,
          conversationCount: (state.conversations || []).length,
          hasConversationHeaderClass: Boolean(document.querySelector(".chat-window-header-main")),
          hasFallbackHeaderClass: Boolean(document.querySelector(".chat-header-shell")),
        };
      });

      throw new Error(
        `Conversation header not visible in ${viewport.label}: ${JSON.stringify(diagnostic)}`,
      );
    }

    for (const accent of ACCENTS) {
      await setAccent(page, accent);

      const header = await collectHeaderMetrics(page);
      const sidebar = isMobile
        ? await collectMobileSidebarMetrics(page)
        : await collectDesktopSidebarMetrics(page);
      const requireVisibleActions = viewport.width >= 1024;

      const pass =
        header.headerVisible &&
        header.titleVisible &&
        (!requireVisibleActions || header.actionsVisible) &&
        !header.horizontalOverflow &&
        !header.headerOverflow &&
        !header.actionsOverflow &&
        !header.titleOutOfBounds &&
        (isMobile
          ? sidebar.triggerVisible && sidebar.visible && sidebar.cardsCount > 0 && sidebar.width <= header.viewportWidth + 1
          : sidebar.visible && sidebar.cardsCount > 0 && sidebar.width >= 52);

      checks.push({
        viewport: viewport.label,
        accent,
        pass,
        header,
        sidebar,
      });

      const sidebarSummary = isMobile
        ? `trigger=${sidebar.triggerVisible} sidebar=${sidebar.visible} cards=${sidebar.cardsCount} width=${sidebar.width}`
        : `sidebar=${sidebar.visible} cards=${sidebar.cardsCount} width=${sidebar.width}`;

      console.log(
        `${pass ? "PASS" : "FAIL"} | CHAT-RESPONSIVE | viewport=${viewport.label} accent=${accent} headerVisible=${header.headerVisible} titleVisible=${header.titleVisible} actionsVisible=${header.actionsVisible} overflow=${header.horizontalOverflow} headerOverflow=${header.headerOverflow} actionsOverflow=${header.actionsOverflow} titleOutOfBounds=${header.titleOutOfBounds} ${sidebarSummary}`,
      );
    }
  } finally {
    await context.close();
  }

  return checks;
};

const run = async () => {
  const ownerAuth = await signupAndSignin(users.owner);
  const peerAuth = await signupAndSignin(users.peer);

  await befriendUsers({
    owner: ownerAuth,
    peer: peerAuth,
  });

  await seedConversation({
    owner: ownerAuth,
    peer: peerAuth,
  });

  const browser = await chromium.launch({
    headless: true,
  });

  const allChecks = [];

  try {
    console.log("=== CHAT SIDEBAR/HEADER RESPONSIVE SMOKE ===");
    console.log(`base=${APP_BASE_URL} api=${API_BASE_URL}`);

    for (const viewport of VIEWPORTS) {
      const checks = await runViewportAccentCheck({
        browser,
        ownerAuth,
        peerAuth,
        viewport,
      });

      allChecks.push(...checks);
    }

    const failedChecks = allChecks.filter((item) => !item.pass);
    const summary = {
      totalChecks: allChecks.length,
      passedChecks: allChecks.length - failedChecks.length,
      failedChecks: failedChecks.length,
      viewports: VIEWPORTS.map((item) => item.label),
      accents: ACCENTS,
      failures: failedChecks.map((item) => ({
        viewport: item.viewport,
        accent: item.accent,
        header: {
          headerVisible: item.header.headerVisible,
          titleVisible: item.header.titleVisible,
          actionsVisible: item.header.actionsVisible,
          horizontalOverflow: item.header.horizontalOverflow,
          headerOverflow: item.header.headerOverflow,
          actionsOverflow: item.header.actionsOverflow,
          titleOutOfBounds: item.header.titleOutOfBounds,
        },
        sidebar: {
          visible: item.sidebar.visible,
          cardsCount: item.sidebar.cardsCount,
          width: item.sidebar.width,
        },
      })),
    };

    console.log(JSON.stringify(summary, null, 2));

    process.exitCode = failedChecks.length === 0 ? 0 : 1;
  } finally {
    await browser.close();
  }
};

run().catch((error) => {
  console.error("FAIL | CHAT-RESPONSIVE-SMOKE |", error.message);
  process.exit(1);
});

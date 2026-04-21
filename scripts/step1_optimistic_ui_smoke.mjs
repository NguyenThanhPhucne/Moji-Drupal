import { createRequire } from "node:module";

const requireFromFrontend = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const { chromium } = requireFromFrontend("playwright");

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:5001/api";
const now = Date.now();
const smokePassword = `Smoke_${now}_Aa!`;

const users = {
  sender: {
    username: `s1ui_sender_${now}`,
    password: smokePassword,
    email: `s1ui_sender_${now}@local.dev`,
    firstName: "UI",
    lastName: "Sender",
  },
  recipient: {
    username: `s1ui_recipient_${now}`,
    password: smokePassword,
    email: `s1ui_recipient_${now}@local.dev`,
    firstName: "UI",
    lastName: "Recipient",
  },
};

const req = async (path, { method = "GET", token, body } = {}) => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  return { status: res.status, json };
};

const signupSignin = async (u) => {
  const signup = await req("/auth/signup", { method: "POST", body: u });
  if (signup.status !== 204) {
    throw new Error(`signup ${u.username} failed: ${signup.status}`);
  }

  const signin = await req("/auth/signin", {
    method: "POST",
    body: { username: u.username, password: u.password },
  });

  if (signin.status !== 200 || !signin.json?.accessToken || !signin.json?.user?._id) {
    throw new Error(`signin ${u.username} failed: ${signin.status}`);
  }

  return {
    token: signin.json.accessToken,
    userId: signin.json.user._id,
    user: signin.json.user,
  };
};

const befriend = async (from, to) => {
  const send = await req("/friends/requests", {
    method: "POST",
    token: from.token,
    body: { to: to.userId, message: "hi" },
  });

  if (send.status !== 201) {
    throw new Error(`send request failed: ${send.status}`);
  }

  const requests = await req("/friends/requests", { token: to.token });
  const target = (requests.json?.received || []).find(
    (r) => String(r.from?._id || "") === String(from.userId),
  );
  if (!target?._id) {
    throw new Error("incoming request not found");
  }

  const accept = await req(`/friends/requests/${target._id}/accept`, {
    method: "POST",
    token: to.token,
  });

  if (accept.status !== 200) {
    throw new Error(`accept request failed: ${accept.status}`);
  }
};

const signInPageSession = async ({
  page,
  accessToken,
  user,
}) => {
  await page.goto(`${APP_BASE_URL}/signin`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.evaluate(({ fallbackAccessToken, fallbackUser }) => {
    globalThis.localStorage.setItem(
      "auth-storage",
      JSON.stringify({
        state: {
          user: fallbackUser || null,
          accessToken: fallbackAccessToken || null,
        },
        version: 0,
      }),
    );
  }, {
    fallbackAccessToken: accessToken || null,
    fallbackUser: user || null,
  });

  await page.goto(`${APP_BASE_URL}/`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page
    .waitForURL((url) => !url.pathname.includes("/signin"), {
      timeout: 9000,
    })
    .catch(() => undefined);

  if (new URL(page.url()).pathname.includes("/signin")) {
    throw new Error("Cannot leave /signin after auth-storage bootstrap");
  }
};

const run = async () => {
  let browser;

  try {
    const sender = await signupSignin(users.sender);
    const recipient = await signupSignin(users.recipient);
    await befriend(sender, recipient);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await signInPageSession({
      page,
      accessToken: sender.token,
      user: sender.user,
    });

    const directMessageResponses = [];
    const onResponse = (response) => {
      let pathname = "";
      try {
        pathname = new URL(response.url()).pathname;
      } catch {
        pathname = "";
      }

      if (!pathname.endsWith("/messages/direct")) {
        return;
      }

      directMessageResponses.push({
        status: response.status(),
        ok: response.ok(),
        url: response.url(),
      });
    };

    page.on("response", onResponse);

    const result = await page.evaluate(async ({ recipientId, expectedContent }) => {
      const { useChatStore } = await import("../src/stores/useChatStore.ts");

      useChatStore.setState({ activeConversationId: null });

      const sendPromise = useChatStore
        .getState()
        .sendDirectMessage(recipientId, expectedContent, undefined, undefined, undefined);

      const tempConversationId = `temp-direct-${String(recipientId)}`;
      const isTempId = (value) => String(value || "").startsWith("temp-");

      const immediateState = useChatStore.getState();

      const hasTempConversationImmediate = immediateState.conversations.some(
        (conversationItem) => conversationItem._id === tempConversationId,
      );

      const hasTempMessageImmediate =
        (immediateState.messages[tempConversationId]?.items || []).some((m) =>
          isTempId(m._id),
        );

      const settleWindowMs = 9000;
      const pollIntervalMs = 180;

      await sendPromise;

      const buildSnapshot = () => {
        const state = useChatStore.getState();

        const hasTempConversation = state.conversations.some(
          (conversationItem) => conversationItem._id === tempConversationId,
        );

        const tempMessages = state.messages[tempConversationId]?.items || [];
        const tempMessage = tempMessages.find((messageItem) =>
          isTempId(messageItem?._id),
        );

        let deliveredMessageId = null;
        let deliveredConversationId = null;

        for (const [conversationId, bucket] of Object.entries(state.messages || {})) {
          const items = Array.isArray(bucket?.items) ? bucket.items : [];
          const delivered = items.find(
            (messageItem) =>
              String(messageItem?.content || "") === String(expectedContent) &&
              !isTempId(messageItem?._id),
          );

          if (delivered) {
            deliveredMessageId = String(delivered._id || "");
            deliveredConversationId = String(conversationId || "") || null;
            break;
          }
        }

        const queueHasTempMessage = (state.outgoingQueue || []).some(
          (queueItem) =>
            String(queueItem?.conversationId || "") === tempConversationId &&
            isTempId(queueItem?.tempId),
        );

        return {
          hasTempConversation,
          tempMessageId: tempMessage?._id || null,
          tempDeliveryState: tempMessage?.deliveryState || null,
          tempDeliveryError: tempMessage?.deliveryError || null,
          queueHasTempMessage,
          deliveredMessageFound: Boolean(deliveredMessageId),
          deliveredMessageId,
          deliveredConversationId,
        };
      };

      let finalSnapshot = buildSnapshot();
      const deadline = Date.now() + settleWindowMs;
      while (Date.now() < deadline) {
        const deliveredAndPruned =
          finalSnapshot.deliveredMessageFound && !finalSnapshot.hasTempConversation;
        const terminalFailureState =
          finalSnapshot.tempDeliveryState === "failed" ||
          finalSnapshot.tempDeliveryState === "queued";

        if (deliveredAndPruned || terminalFailureState) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        finalSnapshot = buildSnapshot();
      }

      let queueConsistency = true;
      if (finalSnapshot.tempDeliveryState === "queued") {
        queueConsistency = finalSnapshot.queueHasTempMessage;
      } else if (finalSnapshot.tempDeliveryState === "failed") {
        queueConsistency = !finalSnapshot.queueHasTempMessage;
      }

      const deliveryModelConsistent =
        (finalSnapshot.deliveredMessageFound && !finalSnapshot.hasTempConversation) ||
        ((finalSnapshot.tempDeliveryState === "failed" ||
          finalSnapshot.tempDeliveryState === "queued") && queueConsistency);

      return {
        hasTempConversationImmediate,
        hasTempMessageImmediate,
        finalSnapshot,
        queueConsistency,
        deliveryModelConsistent,
      };
    }, {
      recipientId: recipient.userId,
      expectedContent: `optimistic step1 ui ${now}`,
    });

    page.off("response", onResponse);

    const pass =
      result.hasTempConversationImmediate &&
      result.hasTempMessageImmediate &&
      result.deliveryModelConsistent;

    console.log(
      `${pass ? "PASS" : "FAIL"} | S1-4-optimistic-ui | ${JSON.stringify({
        ...result,
        directMessageResponses,
      })}`,
    );

    process.exitCode = pass ? 0 : 1;

    await context.close();
  } catch (error) {
    console.error(`FAIL | S1-4-optimistic-ui | ${error?.message || error}`);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

await run();

import { chromium } from "../frontend/node_modules/playwright/index.mjs";

const APP_BASE_URL = "http://localhost:5173";
const API_BASE_URL = "http://127.0.0.1:5001/api";
const now = Date.now();

const users = {
  sender: {
    username: `s1ui_sender_${now}`,
    password: "P@ssw0rd123",
    email: `s1ui_sender_${now}@local.dev`,
    firstName: "UI",
    lastName: "Sender",
  },
  recipient: {
    username: `s1ui_recipient_${now}`,
    password: "P@ssw0rd123",
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

  return { token: signin.json.accessToken, userId: signin.json.user._id };
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

(async () => {
  let browser;

  try {
    const sender = await signupSignin(users.sender);
    const recipient = await signupSignin(users.recipient);
    await befriend(sender, recipient);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${APP_BASE_URL}/signin`, { waitUntil: "networkidle" });

    const uiSignInOk = await page.evaluate(async ({ username, password }) => {
      const { useAuthStore } = await import("/src/stores/useAuthStore.ts");
      return useAuthStore.getState().signIn(username, password);
    }, {
      username: users.sender.username,
      password: users.sender.password,
    });

    if (!uiSignInOk) {
      const diagnostic = await page.evaluate(async ({ username, password }) => {
        try {
          const response = await fetch("/api/node/auth/signin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });

          let payload = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }

          return {
            ok: response.ok,
            status: response.status,
            payload,
          };
        } catch (error) {
          return {
            ok: false,
            status: 0,
            payload: { message: String(error?.message || error) },
          };
        }
      }, {
        username: users.sender.username,
        password: users.sender.password,
      });

      throw new Error(
        `UI signIn returned false (status=${diagnostic.status}, message=${diagnostic?.payload?.message || "n/a"})`,
      );
    }

    await page.goto(`${APP_BASE_URL}/`, { waitUntil: "networkidle" });

    const result = await page.evaluate(async ({ recipientId }) => {
      const { useChatStore } = await import("/src/stores/useChatStore.ts");

      useChatStore.setState({ activeConversationId: null });

      const sendPromise = useChatStore
        .getState()
        .sendDirectMessage(recipientId, "optimistic step1 ui", undefined, undefined, undefined);

      const tempConversationId = `temp-direct-${String(recipientId)}`;
      const immediateState = useChatStore.getState();

      const hasTempConversationImmediate = immediateState.conversations.some(
        (conversationItem) => conversationItem._id === tempConversationId,
      );

      const hasTempMessageImmediate =
        (immediateState.messages[tempConversationId]?.items || []).some((m) =>
          String(m._id || "").startsWith("temp-"),
        );

      await sendPromise;

      const finalState = useChatStore.getState();
      const hasTempConversationAfter = finalState.conversations.some(
        (conversationItem) => conversationItem._id === tempConversationId,
      );

      return {
        hasTempConversationImmediate,
        hasTempMessageImmediate,
        hasTempConversationAfter,
      };
    }, { recipientId: recipient.userId });

    const pass =
      result.hasTempConversationImmediate &&
      result.hasTempMessageImmediate &&
      !result.hasTempConversationAfter;

    console.log(
      `${pass ? "PASS" : "FAIL"} | S1-4-optimistic-ui | ${JSON.stringify(result)}`,
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
})();

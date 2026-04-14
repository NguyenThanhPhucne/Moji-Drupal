import { chromium } from "playwright";

const now = Date.now();

const APP_BASE_URL = process.env.APP_BASE_URL || "http://127.0.0.1:5173";
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:5001/api";
const TEST_PASSWORD = process.env.SMOKE_TEST_PASSWORD || `Slow3G_${now}_Aa!`;
const SLOW3G_LATENCY_MS = Number(process.env.SMOKE_SLOW3G_LATENCY_MS || 400);
const SLOW3G_DOWNLOAD_BPS = Number(process.env.SMOKE_SLOW3G_DOWNLOAD_BPS || 50 * 1024);
const SLOW3G_UPLOAD_BPS = Number(process.env.SMOKE_SLOW3G_UPLOAD_BPS || 20 * 1024);
const REQUEST_DELAY_MS = Number(process.env.SMOKE_SLOW3G_REQUEST_DELAY_MS || 900);

const users = {
  sender: {
    username: `slow3g_sender_${now}`,
    password: TEST_PASSWORD,
    email: `slow3g_sender_${now}@local.dev`,
    firstName: "Slow3G",
    lastName: "Sender",
  },
  recipient: {
    username: `slow3g_recipient_${now}`,
    password: TEST_PASSWORD,
    email: `slow3g_recipient_${now}@local.dev`,
    firstName: "Slow3G",
    lastName: "Recipient",
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

const signupAndSignin = async (userPayload) => {
  const signup = await req("/auth/signup", { method: "POST", body: userPayload });
  if (signup.status !== 204) {
    throw new Error(`Signup failed for ${userPayload.username}: ${signup.status}`);
  }

  const signin = await req("/auth/signin", {
    method: "POST",
    body: {
      username: userPayload.username,
      password: userPayload.password,
    },
  });

  if (signin.status !== 200 || !signin?.json?.accessToken || !signin?.json?.user?._id) {
    throw new Error(`Signin failed for ${userPayload.username}: ${signin.status}`);
  }

  return {
    token: signin.json.accessToken,
    userId: signin.json.user._id,
    username: userPayload.username,
    password: userPayload.password,
  };
};

const befriendUsers = async ({ sender, recipient }) => {
  const sendRequest = await req("/friends/requests", {
    method: "POST",
    token: sender.token,
    body: {
      to: recipient.userId,
      message: "Slow 3G stress test friend request",
    },
  });

  if (sendRequest.status !== 201) {
    throw new Error(`Friend request failed: ${sendRequest.status}`);
  }

  const receivedRequests = await req("/friends/requests", {
    token: recipient.token,
  });

  const pendingRequest = (receivedRequests?.json?.received || []).find(
    (requestItem) => String(requestItem?.from?._id || "") === String(sender.userId),
  );

  if (!pendingRequest?._id) {
    throw new Error("Incoming friend request not found");
  }

  const acceptRequest = await req(`/friends/requests/${pendingRequest._id}/accept`, {
    method: "POST",
    token: recipient.token,
  });

  if (acceptRequest.status !== 200) {
    throw new Error(`Accept friend request failed: ${acceptRequest.status}`);
  }
};

const signInPageSession = async ({ page, username, password }) => {
  await page.goto(`${APP_BASE_URL}/signin`, { waitUntil: "networkidle" });

  const signInResult = await page.evaluate(async ({ usernameValue, passwordValue }) => {
    const { useAuthStore } = await import("../src/stores/useAuthStore.ts");
    const { useSocketStore } = await import("../src/stores/useSocketStore.ts");

    const signedIn = await useAuthStore
      .getState()
      .signIn(usernameValue, passwordValue);

    if (!signedIn) {
      return {
        signedIn: false,
        socketConnected: false,
      };
    }

    useSocketStore.getState().connectSocket();

    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      if (useSocketStore.getState().socket?.connected) {
        return {
          signedIn: true,
          socketConnected: true,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    return {
      signedIn: true,
      socketConnected: Boolean(useSocketStore.getState().socket?.connected),
    };
  }, {
    usernameValue: username,
    passwordValue: password,
  });

  if (!signInResult?.signedIn) {
    throw new Error(`UI signIn returned false for ${username}`);
  }

  await page.goto(`${APP_BASE_URL}/`, { waitUntil: "networkidle" });
};

const ensureSocketConnectedAndJoined = async ({ page, conversationId }) => {
  return page.evaluate(async ({ targetConversationId }) => {
    const { useSocketStore } = await import("../src/stores/useSocketStore.ts");

    useSocketStore.getState().connectSocket();

    const deadline = Date.now() + 9000;
    while (Date.now() < deadline) {
      const socket = useSocketStore.getState().socket;
      if (socket?.connected) {
        socket.emit("join-conversation", targetConversationId);
        return {
          connected: true,
          socketId: socket.id || null,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    return {
      connected: false,
      socketId: null,
    };
  }, {
    targetConversationId: conversationId,
  });
};

const bootstrapConversationInStore = async ({ page, peerId }) => {
  return page.evaluate(async ({ peerUserId }) => {
    const { useChatStore } = await import("../src/stores/useChatStore.ts");
    const { useSocketStore } = await import("../src/stores/useSocketStore.ts");

    await useChatStore.getState().fetchConversations();
    const conversations = useChatStore.getState().conversations || [];

    const targetConversation = conversations.find((conversationItem) => {
      if (conversationItem.type !== "direct") {
        return false;
      }

      return (conversationItem.participants || []).some(
        (participant) => String(participant?._id || "") === String(peerUserId),
      );
    });

    if (!targetConversation?._id) {
      return {
        ok: false,
        reason: "DIRECT_CONVERSATION_NOT_FOUND",
      };
    }

    useChatStore.getState().setActiveConversation(targetConversation._id);
    await useChatStore.getState().fetchMessages(targetConversation._id);

    if (useSocketStore.getState().socket?.connected) {
      useSocketStore.getState().socket.emit(
        "join-conversation",
        targetConversation._id,
      );
    }

    return {
      ok: true,
      conversationId: targetConversation._id,
      messageIds: (useChatStore.getState().messages[targetConversation._id]?.items || []).map(
        (messageItem) => messageItem._id,
      ),
    };
  }, {
    peerUserId: peerId,
  });
};

const findMessageByContent = async ({ page, conversationId, content }) => {
  return page.evaluate(async ({ targetConversationId, targetContent }) => {
    const { useChatStore } = await import("../src/stores/useChatStore.ts");
    const items = useChatStore.getState().messages[targetConversationId]?.items || [];

    const message = items.find(
      (messageItem) => String(messageItem?.content || "") === String(targetContent),
    );

    return message
      ? {
          found: true,
          messageId: message._id,
        }
      : {
          found: false,
          messageId: null,
        };
  }, {
    targetConversationId: conversationId,
    targetContent: content,
  });
};

const enableSlow3G = async (context, page) => {
  const cdpSession = await context.newCDPSession(page);
  await cdpSession.send("Network.enable");
  await cdpSession.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: SLOW3G_LATENCY_MS,
    downloadThroughput: SLOW3G_DOWNLOAD_BPS,
    uploadThroughput: SLOW3G_UPLOAD_BPS,
    connectionType: "cellular3g",
  });

  return cdpSession;
};

const runReactionRollbackSpam = async ({ page, conversationId, messageId, rounds, emoji }) => {
  return page.evaluate(async ({ conversationIdValue, messageIdValue, roundsValue, emojiValue }) => {
    const { useChatStore } = await import("../src/stores/useChatStore.ts");

    const normalize = (reactions) => {
      const safeReactions = Array.isArray(reactions) ? reactions : [];
      return [...safeReactions]
        .map((reaction) => ({
          userId: String(reaction?.userId || ""),
          emoji: String(reaction?.emoji || ""),
        }))
        .sort((left, right) => {
          const leftKey = `${left.userId}:${left.emoji}`;
          const rightKey = `${right.userId}:${right.emoji}`;
          return leftKey.localeCompare(rightKey);
        });
    };

    const readMessage = () => {
      return (useChatStore.getState().messages[conversationIdValue]?.items || []).find(
        (messageItem) => String(messageItem?._id || "") === String(messageIdValue),
      );
    };

    const beforeMessage = readMessage();
    const beforeReactions = normalize(beforeMessage?.reactions);

    const jobs = Array.from({ length: roundsValue }, () =>
      useChatStore
        .getState()
        .reactToMessage(conversationIdValue, messageIdValue, emojiValue)
        .catch(() => null),
    );

    await Promise.allSettled(jobs);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const afterMessage = readMessage();
    const afterReactions = normalize(afterMessage?.reactions);

    return {
      pass:
        JSON.stringify(beforeReactions) === JSON.stringify(afterReactions),
      beforeReactions,
      afterReactions,
    };
  }, {
    conversationIdValue: conversationId,
    messageIdValue: messageId,
    roundsValue: rounds,
    emojiValue: emoji,
  });
};

const runDeleteRollbackSpam = async ({ page, conversationId, messageId, rounds }) => {
  return page.evaluate(async ({ conversationIdValue, messageIdValue, roundsValue }) => {
    const { useChatStore } = await import("../src/stores/useChatStore.ts");

    const beforeMessage = (useChatStore.getState().messages[conversationIdValue]?.items || []).find(
      (messageItem) => String(messageItem?._id || "") === String(messageIdValue),
    );
    const beforeContent = String(beforeMessage?.content || "");

    const jobs = Array.from({ length: roundsValue }, () =>
      useChatStore
        .getState()
        .unsendMessage(conversationIdValue, messageIdValue)
        .catch(() => null),
    );

    await Promise.allSettled(jobs);
    await new Promise((resolve) => setTimeout(resolve, 2800));

    const afterMessage = (useChatStore.getState().messages[conversationIdValue]?.items || []).find(
      (messageItem) => String(messageItem?._id || "") === String(messageIdValue),
    );

    return {
      pass: Boolean(afterMessage) && !afterMessage.isDeleted && String(afterMessage.content || "") === beforeContent,
      beforeContent,
      afterContent: String(afterMessage?.content || ""),
      afterDeleted: Boolean(afterMessage?.isDeleted),
    };
  }, {
    conversationIdValue: conversationId,
    messageIdValue: messageId,
    roundsValue: rounds,
  });
};

const applyDefinitiveReaction = async ({ page, conversationId, messageId, emoji }) => {
  return page.evaluate(async ({ conversationIdValue, messageIdValue, emojiValue }) => {
    const { useChatStore } = await import("../src/stores/useChatStore.ts");

    await useChatStore.getState().reactToMessage(
      conversationIdValue,
      messageIdValue,
      emojiValue,
    );

    await new Promise((resolve) => setTimeout(resolve, 1600));

    const message = (useChatStore.getState().messages[conversationIdValue]?.items || []).find(
      (messageItem) => String(messageItem?._id || "") === String(messageIdValue),
    );

    return {
      reactions: Array.isArray(message?.reactions) ? message.reactions : [],
    };
  }, {
    conversationIdValue: conversationId,
    messageIdValue: messageId,
    emojiValue: emoji,
  });
};

const waitRealtimeReactionEvent = async ({ page, conversationId, messageId, senderId, emoji }) => {
  return page.evaluate(async ({ conversationIdValue, messageIdValue, senderIdValue, emojiValue }) => {
    const { useSocketStore } = await import("../src/stores/useSocketStore.ts");

    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const hasReaction = (reactions) => {
      for (const reaction of reactions) {
        if (
          String(reaction?.userId || "") === String(senderIdValue) &&
          String(reaction?.emoji || "") === String(emojiValue)
        ) {
          return true;
        }
      }

      return false;
    };

    useSocketStore.getState().connectSocket();

    const ensureConnectedDeadline = Date.now() + 7000;
    while (Date.now() < ensureConnectedDeadline) {
      if (useSocketStore.getState().socket?.connected) {
        break;
      }

      await pause(120);
    }

    const socket = useSocketStore.getState().socket;
    if (!socket?.connected) {
      return {
        pass: false,
        reason: "socket_not_connected",
        reactions: [],
      };
    }

    socket.emit("join-conversation", conversationIdValue);

    return new Promise((resolve) => {
      const cleanup = () => {
        socket.off("message-reacted", onMessageReacted);
      };

      const timeout = setTimeout(() => {
        cleanup();
        resolve({
          pass: false,
          reason: "timeout",
          reactions: [],
        });
      }, 9000);

      const onMessageReacted = (payload) => {
        const sameConversation =
          String(payload?.conversationId || "") === String(conversationIdValue);
        const sameMessage =
          String(payload?.messageId || "") === String(messageIdValue);

        if (!sameConversation || !sameMessage) {
          return;
        }

        const reactions = Array.isArray(payload?.reactions)
          ? payload.reactions
          : [];
        if (!hasReaction(reactions)) {
          return;
        }

        clearTimeout(timeout);
        cleanup();
        resolve({
          pass: true,
          reason: "event_received",
          reactions,
        });
      };

      socket.on("message-reacted", onMessageReacted);
    });
  }, {
    conversationIdValue: conversationId,
    messageIdValue: messageId,
    senderIdValue: senderId,
    emojiValue: emoji,
  });
};

const isReactRequest = (request) => {
  if (request.method() !== "POST") {
    return false;
  }

  try {
    const pathname = new URL(request.url()).pathname;
    return /\/messages\/[^/]+\/react$/.test(pathname);
  } catch {
    return false;
  }
};

const isUnsendRequest = (request) => {
  if (request.method() !== "DELETE") {
    return false;
  }

  try {
    const pathname = new URL(request.url()).pathname;
    return /\/messages\/[^/]+\/unsend$/.test(pathname);
  } catch {
    return false;
  }
};

const run = async () => {
  let browser = null;

  try {
    const sender = await signupAndSignin(users.sender);
    const recipient = await signupAndSignin(users.recipient);

    await befriendUsers({ sender, recipient });

    const seedMessageContent = `SLOW3G_STRESS_SEED_${now}`;

    const seedMessageResponse = await req("/messages/direct", {
      method: "POST",
      token: sender.token,
      body: {
        recipientId: recipient.userId,
        content: seedMessageContent,
      },
    });

    if (seedMessageResponse.status !== 201 || !seedMessageResponse?.json?.message?._id) {
      throw new Error(`Seed message create failed: ${seedMessageResponse.status}`);
    }

    const seedMessageId = seedMessageResponse.json.message._id;

    browser = await chromium.launch({ headless: true });
    const contextSender = await browser.newContext();
    const contextRecipient = await browser.newContext();
    const pageSender = await contextSender.newPage();
    const pageRecipient = await contextRecipient.newPage();

    await Promise.all([
      signInPageSession({
        page: pageSender,
        username: sender.username,
        password: sender.password,
      }),
      signInPageSession({
        page: pageRecipient,
        username: recipient.username,
        password: recipient.password,
      }),
    ]);

    await Promise.all([
      bootstrapConversationInStore({ page: pageSender, peerId: recipient.userId }),
      bootstrapConversationInStore({ page: pageRecipient, peerId: sender.userId }),
    ]);

    const senderConversationBootstrap = await bootstrapConversationInStore({
      page: pageSender,
      peerId: recipient.userId,
    });

    if (!senderConversationBootstrap.ok || !senderConversationBootstrap.conversationId) {
      throw new Error(`Sender bootstrap failed: ${senderConversationBootstrap.reason || "unknown"}`);
    }

    const recipientConversationBootstrap = await bootstrapConversationInStore({
      page: pageRecipient,
      peerId: sender.userId,
    });

    if (!recipientConversationBootstrap.ok || !recipientConversationBootstrap.conversationId) {
      throw new Error(`Recipient bootstrap failed: ${recipientConversationBootstrap.reason || "unknown"}`);
    }

    const conversationId = senderConversationBootstrap.conversationId;

    const senderSocketJoin = await ensureSocketConnectedAndJoined({
      page: pageSender,
      conversationId,
    });
    const recipientSocketJoin = await ensureSocketConnectedAndJoined({
      page: pageRecipient,
      conversationId,
    });

    if (!senderSocketJoin.connected || !recipientSocketJoin.connected) {
      console.warn(
        `[stress] socket join readiness | sender=${senderSocketJoin.connected} recipient=${recipientSocketJoin.connected}`,
      );
    }

    const senderSeedLookup = await findMessageByContent({
      page: pageSender,
      conversationId,
      content: seedMessageContent,
    });

    const targetMessageId = senderSeedLookup.found
      ? senderSeedLookup.messageId
      : seedMessageId;

    await Promise.all([
      enableSlow3G(contextSender, pageSender),
      enableSlow3G(contextRecipient, pageRecipient),
    ]);

    let blockedReactRequests = 0;
    let blockedUnsendRequests = 0;

    // Phase 1: force failures under Slow 3G to validate rollback correctness.
    await pageSender.route("**/messages/**", async (route, request) => {
      if (isReactRequest(request)) {
        blockedReactRequests += 1;
        await sleep(REQUEST_DELAY_MS);
        await route.abort("failed");
        return;
      }

      if (isUnsendRequest(request)) {
        blockedUnsendRequests += 1;
        await sleep(REQUEST_DELAY_MS);
        await route.abort("failed");
        return;
      }

      await route.continue();
    });

    const reactionRollback = await runReactionRollbackSpam({
      page: pageSender,
      conversationId,
      messageId: targetMessageId,
      rounds: 10,
      emoji: "🔥",
    });

    const deleteRollback = await runDeleteRollbackSpam({
      page: pageSender,
      conversationId,
      messageId: targetMessageId,
      rounds: 6,
    });

    await pageSender.unroute("**/messages/**");

    // Phase 2: keep Slow 3G delay, but allow API success to validate realtime sync.
    await pageSender.route("**/messages/**", async (route, request) => {
      if (isReactRequest(request) || isUnsendRequest(request)) {
        await sleep(REQUEST_DELAY_MS);
      }

      await route.continue();
    });

    const definitiveEmoji = "👍";
    const recipientRealtimeSyncPromise = waitRealtimeReactionEvent({
      page: pageRecipient,
      conversationId,
      messageId: targetMessageId,
      senderId: sender.userId,
      emoji: definitiveEmoji,
    });

    const senderReactionState = await applyDefinitiveReaction({
      page: pageSender,
      conversationId,
      messageId: targetMessageId,
      emoji: definitiveEmoji,
    });

    const recipientRealtimeSync = await recipientRealtimeSyncPromise;

    const senderHasDefinitiveReaction = (Array.isArray(senderReactionState.reactions)
      ? senderReactionState.reactions
      : []).some(
      (reaction) =>
        String(reaction?.userId || "") === String(sender.userId) &&
        String(reaction?.emoji || "") === definitiveEmoji,
    );

    const recipientHasDefinitiveReaction = (Array.isArray(recipientRealtimeSync.reactions)
      ? recipientRealtimeSync.reactions
      : []).some(
      (reaction) =>
        String(reaction?.userId || "") === String(sender.userId) &&
        String(reaction?.emoji || "") === definitiveEmoji,
    );

    const overallPass =
      reactionRollback.pass &&
      deleteRollback.pass &&
      senderHasDefinitiveReaction &&
      recipientRealtimeSync.pass &&
      recipientHasDefinitiveReaction;

    console.log("=== SLOW 3G OPTIMISTIC + REALTIME STRESS ===");
    console.log(
      `${reactionRollback.pass ? "PASS" : "FAIL"} | STRESS-ROLLBACK-REACTION | react spam rollback under forced failure`,
    );
    console.log(
      `${deleteRollback.pass ? "PASS" : "FAIL"} | STRESS-ROLLBACK-DELETE | unsend spam rollback under forced failure`,
    );
    console.log(
      `${recipientRealtimeSync.pass ? "PASS" : "FAIL"} | STRESS-REALTIME-SYNC | reaction sync reaches recipient under Slow 3G`,
    );

    console.log(
      JSON.stringify(
        {
          overallPass,
          conversationId,
          targetMessageId,
          blockedReactRequests,
          blockedUnsendRequests,
          reactionRollback,
          deleteRollback,
          senderHasDefinitiveReaction,
          recipientRealtimeSync,
          recipientHasDefinitiveReaction,
          networkProfile: {
            latencyMs: SLOW3G_LATENCY_MS,
            downloadBps: SLOW3G_DOWNLOAD_BPS,
            uploadBps: SLOW3G_UPLOAD_BPS,
            requestDelayMs: REQUEST_DELAY_MS,
          },
        },
        null,
        2,
      ),
    );

    process.exitCode = overallPass ? 0 : 1;

    await contextSender.close();
    await contextRecipient.close();
  } catch (error) {
    console.error("=== SLOW 3G OPTIMISTIC + REALTIME STRESS ===");
    console.error(`FAIL | STRESS | ${error?.message || error}`);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

run();

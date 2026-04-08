const base = "http://127.0.0.1:5001/api";
const now = Date.now();

const users = {
  a: {
    username: `s1a_${now}`,
    password: "P@ssw0rd123",
    email: `s1a_${now}@local.dev`,
    firstName: "S1",
    lastName: "A",
  },
  b: {
    username: `s1b_${now}`,
    password: "P@ssw0rd123",
    email: `s1b_${now}@local.dev`,
    firstName: "S1",
    lastName: "B",
  },
  c: {
    username: `s1c_${now}`,
    password: "P@ssw0rd123",
    email: `s1c_${now}@local.dev`,
    firstName: "S1",
    lastName: "C",
  },
};

const req = async (path, { method = "GET", token, body } = {}) => {
  const res = await fetch(`${base}${path}`, {
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

  return { status: res.status, ok: res.ok, json };
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

const befriend = async (from, toUserId, toToken) => {
  const send = await req("/friends/requests", {
    method: "POST",
    token: from.token,
    body: { to: toUserId, message: "hi" },
  });

  if (send.status !== 201) {
    throw new Error(`send request failed: ${send.status} ${JSON.stringify(send.json)}`);
  }

  const requests = await req("/friends/requests", { token: toToken });
  const incoming = requests.json?.received || [];
  const target = incoming.find(
    (r) => String(r.from?._id || "") === String(from.userId),
  );

  if (!target?._id) {
    throw new Error("cannot find incoming friend request");
  }

  const accept = await req(`/friends/requests/${target._id}/accept`, {
    method: "POST",
    token: toToken,
  });

  if (accept.status !== 200) {
    throw new Error(`accept request failed: ${accept.status}`);
  }
};

const getMessageInConversation = async (token, conversationId, messageId) => {
  const r = await req(`/conversations/${conversationId}/messages?limit=50`, { token });
  if (r.status !== 200) {
    throw new Error(`fetch messages failed: ${r.status}`);
  }

  return (r.json?.messages || []).find(
    (m) => String(m._id) === String(messageId),
  );
};

(async () => {
  const results = [];
  const log = (id, pass, detail) => {
    results.push({ id, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"} | ${id} | ${detail}`);
  };

  try {
    const A = await signupSignin(users.a);
    const B = await signupSignin(users.b);
    const C = await signupSignin(users.c);

    await befriend(A, B.userId, B.token);
    await befriend(A, C.userId, C.token);

    const firstDirect = await req("/messages/direct", {
      method: "POST",
      token: A.token,
      body: { recipientId: B.userId, content: "first direct no convo id" },
    });
    const convAB = firstDirect.json?.message?.conversationId;
    log(
      "S1-4-backend-support",
      firstDirect.status === 201 && !!convAB,
      `status=${firstDirect.status}`,
    );

    const convACRes = await req("/conversations", {
      method: "POST",
      token: A.token,
      body: { type: "direct", memberIds: [C.userId] },
    });
    const convAC = convACRes.json?.conversation?._id;

    const msgACRes = await req("/messages/direct", {
      method: "POST",
      token: A.token,
      body: {
        recipientId: C.userId,
        conversationId: convAC,
        content: "seed AC",
      },
    });
    const msgAC = msgACRes.json?.message?._id;

    const seedAB = await req("/messages/direct", {
      method: "POST",
      token: A.token,
      body: {
        recipientId: B.userId,
        conversationId: convAB,
        content: "seed AB",
      },
    });
    const msgAB = seedAB.json?.message?._id;

    const invalidReply = await req("/messages/direct", {
      method: "POST",
      token: A.token,
      body: {
        recipientId: B.userId,
        conversationId: convAB,
        content: "invalid reply",
        replyTo: msgAC,
      },
    });
    log(
      "S1-2-replyTo-validation",
      invalidReply.status === 400,
      `status=${invalidReply.status}`,
    );

    const emojis = ["😀", "🔥", "❤️", "😮", "😂", "👍"];
    const raceResponses = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        req(`/messages/${msgAB}/react`, {
          method: "POST",
          token: B.token,
          body: { emoji: emojis[i % emojis.length] },
        }),
      ),
    );

    const noServerErrors = raceResponses.every((r) => r.status < 500);

    const afterRace = await getMessageInConversation(B.token, convAB, msgAB);
    const bReactions = (afterRace?.reactions || []).filter(
      (r) => String(r.userId) === String(B.userId),
    );
    log(
      "S1-1-reaction-atomic",
      bReactions.length <= 1 && noServerErrors,
      `userReactionCount=${bReactions.length},no5xx=${noServerErrors}`,
    );

    await req(`/messages/${msgAB}/react`, {
      method: "POST",
      token: B.token,
      body: { emoji: "😎" },
    });
    await req(`/messages/${msgAB}/read`, { method: "POST", token: B.token });

    const unsend = await req(`/messages/${msgAB}/unsend`, {
      method: "DELETE",
      token: A.token,
    });
    const m = unsend.json?.message || {};
    const normalized =
      unsend.status === 200 &&
      m.isDeleted === true &&
      m.content === "This message was removed" &&
      m.imgUrl === null &&
      m.replyTo === null &&
      Array.isArray(m.reactions) &&
      m.reactions.length === 0 &&
      Array.isArray(m.readBy) &&
      m.readBy.length === 0;

    log("S1-3-unsend-normalize", normalized, `status=${unsend.status}`);

    const delConv = await req(`/conversations/${convAB}`, {
      method: "DELETE",
      token: A.token,
    });
    const getConvs = await req("/conversations", { token: A.token });
    const stillExists = (getConvs.json?.conversations || []).some(
      (c) => String(c._id) === String(convAB),
    );
    const getMessagesAfterDelete = await req(
      `/conversations/${convAB}/messages`,
      {
        token: A.token,
      },
    );

    log(
      "S1-5-delete-conversation",
      delConv.status === 200 &&
        !stillExists &&
        [404, 403].includes(getMessagesAfterDelete.status),
      `delete=${delConv.status},exists=${stillExists},messages=${getMessagesAfterDelete.status}`,
    );

    const fail = results.filter((r) => !r.pass).length;
    console.log("SUMMARY", JSON.stringify({ total: results.length, fail }, null, 2));
    process.exitCode = fail ? 1 : 0;
  } catch (e) {
    console.error("SMOKE ERROR", e?.message || e);
    process.exitCode = 1;
  }
})();

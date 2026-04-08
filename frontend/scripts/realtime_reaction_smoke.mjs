import { io } from "socket.io-client";

const base = "http://127.0.0.1:5001/api";
const socketBase = "http://127.0.0.1:5001";
const now = Date.now();

const users = {
  a: {
    username: `rta_${now}`,
    password: "P@ssw0rd123",
    email: `rta_${now}@local.dev`,
    firstName: "Realtime",
    lastName: "A",
  },
  b: {
    username: `rtb_${now}`,
    password: "P@ssw0rd123",
    email: `rtb_${now}@local.dev`,
    firstName: "Realtime",
    lastName: "B",
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

  return { status: res.status, json };
};

const signupAndSignin = async (u) => {
  const signup = await req("/auth/signup", { method: "POST", body: u });
  if (signup.status !== 204) {
    throw new Error(`Signup failed for ${u.username}: ${signup.status}`);
  }

  const signin = await req("/auth/signin", {
    method: "POST",
    body: { username: u.username, password: u.password },
  });

  if (signin.status !== 200 || !signin?.json?.accessToken) {
    throw new Error(`Signin failed for ${u.username}: ${signin.status}`);
  }

  return signin.json.accessToken;
};

const waitForEvent = (socket, eventName, predicate, timeoutMs = 5000) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timeout waiting for ${eventName}`));
    }, timeoutMs);

    const onEvent = (payload) => {
      if (!predicate(payload)) {
        return;
      }

      clearTimeout(timeout);
      socket.off(eventName, onEvent);
      resolve(payload);
    };

    socket.on(eventName, onEvent);
  });

const connectSocket = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(socketBase, {
      transports: ["websocket"],
      auth: { token },
      timeout: 5000,
    });

    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (error) => {
      reject(error);
    });
  });

(async () => {
  let socketA = null;
  let socketB = null;

  try {
    const tokenA = await signupAndSignin(users.a);
    const tokenB = await signupAndSignin(users.b);

    socketA = await connectSocket(tokenA);
    socketB = await connectSocket(tokenB);

    const createPost = await req("/social/posts", {
      method: "POST",
      token: tokenA,
      body: { caption: `Realtime reaction ${now}` },
    });

    if (createPost.status !== 201 || !createPost?.json?.post?._id) {
      throw new Error(`Create post failed: ${createPost.status}`);
    }

    const postId = createPost.json.post._id;

    const waitA = waitForEvent(
      socketA,
      "social-post-like-updated",
      (payload) => String(payload?.postId) === String(postId),
    );
    const waitB = waitForEvent(
      socketB,
      "social-post-like-updated",
      (payload) => String(payload?.postId) === String(postId),
    );

    const like = await req(`/social/posts/${postId}/like`, {
      method: "POST",
      token: tokenB,
      body: { reaction: "love" },
    });

    if (like.status !== 200) {
      throw new Error(`Like request failed: ${like.status}`);
    }

    const [eventA, eventB] = await Promise.all([waitA, waitB]);

    const passA = Number(eventA?.likesCount || 0) >= 1;
    const passB = Number(eventB?.likesCount || 0) >= 1;

    const createComment = await req(`/social/posts/${postId}/comments`, {
      method: "POST",
      token: tokenB,
      body: { content: "Realtime delete comment" },
    });

    if (createComment.status !== 201 || !createComment?.json?.comment?._id) {
      throw new Error(`Create comment failed: ${createComment.status}`);
    }

    const commentId = createComment.json.comment._id;

    const waitCommentDeleteA = waitForEvent(
      socketA,
      "social-post-comment-deleted",
      (payload) =>
        String(payload?.postId) === String(postId) &&
        Array.isArray(payload?.deletedCommentIds) &&
        payload.deletedCommentIds.includes(commentId),
    );

    const waitCommentDeleteB = waitForEvent(
      socketB,
      "social-post-comment-deleted",
      (payload) =>
        String(payload?.postId) === String(postId) &&
        Array.isArray(payload?.deletedCommentIds) &&
        payload.deletedCommentIds.includes(commentId),
    );

    const deleteComment = await req(`/social/posts/${postId}/comments/${commentId}`, {
      method: "DELETE",
      token: tokenA,
    });

    if (deleteComment.status !== 200) {
      throw new Error(`Delete comment failed: ${deleteComment.status}`);
    }

    const [commentDeleteEventA, commentDeleteEventB] = await Promise.all([
      waitCommentDeleteA,
      waitCommentDeleteB,
    ]);

    const waitPostDeleteA = waitForEvent(
      socketA,
      "social-post-deleted",
      (payload) => String(payload?.postId) === String(postId),
    );

    const waitPostDeleteB = waitForEvent(
      socketB,
      "social-post-deleted",
      (payload) => String(payload?.postId) === String(postId),
    );

    const deletePost = await req(`/social/posts/${postId}`, {
      method: "DELETE",
      token: tokenA,
    });

    if (deletePost.status !== 200) {
      throw new Error(`Delete post failed: ${deletePost.status}`);
    }

    const [postDeleteEventA, postDeleteEventB] = await Promise.all([
      waitPostDeleteA,
      waitPostDeleteB,
    ]);

    console.log("=== E REALTIME REACTION SYNC ===");
    console.log(`PASS | E-reaction-A | socket A received event | likesCount=${eventA?.likesCount}`);
    console.log(`PASS | E-reaction-B | socket B received event | likesCount=${eventB?.likesCount}`);
    console.log(
      `PASS | E-comment-delete-A | socket A received event | deletedCount=${commentDeleteEventA?.deletedCommentIds?.length || 0}`,
    );
    console.log(
      `PASS | E-comment-delete-B | socket B received event | deletedCount=${commentDeleteEventB?.deletedCommentIds?.length || 0}`,
    );
    console.log(`PASS | E-post-delete-A | socket A received post delete event | postId=${postDeleteEventA?.postId}`);
    console.log(`PASS | E-post-delete-B | socket B received post delete event | postId=${postDeleteEventB?.postId}`);
    console.log(
      JSON.stringify(
        {
          postId,
          pass: passA && passB,
          eventA,
          eventB,
          commentDeleteEventA,
          commentDeleteEventB,
          postDeleteEventA,
          postDeleteEventB,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.log("=== E REALTIME REACTION SYNC ===");
    console.log(`FAIL | E-reaction | ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (socketA) {
      socketA.disconnect();
    }
    if (socketB) {
      socketB.disconnect();
    }
  }
})();

// @ts-nocheck
import bcrypt from "bcrypt";
import axios from "axios";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import Session from "../models/Session.js";
import { OAuth2Client } from "google-auth-library";

const ACCESS_TOKEN_TTL = "30m"; // thuờng là dưới 15m
const toPositiveInteger = (value, fallbackValue) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return Math.floor(parsed);
};

const REFRESH_TOKEN_TTL_MS = toPositiveInteger(
  process.env.REFRESH_TOKEN_TTL_MS,
  14 * 24 * 60 * 60 * 1000,
);
const REFRESH_TOKEN_ABSOLUTE_TTL_MS = Math.max(
  toPositiveInteger(
    process.env.REFRESH_TOKEN_ABSOLUTE_TTL_MS,
    30 * 24 * 60 * 60 * 1000,
  ),
  REFRESH_TOKEN_TTL_MS,
);
const SESSION_MAX_PER_USER = toPositiveInteger(
  process.env.SESSION_MAX_PER_USER,
  10,
);
const SESSION_STRICT_FINGERPRINT = ["1", "true", "yes"].includes(
  String(process.env.SESSION_STRICT_FINGERPRINT || "").toLowerCase(),
);
const REFRESH_TOKEN_FORMAT_REGEX = /^[a-f0-9]{128}$/i;
// Keep fallback snappy so sign-in does not feel blocked on network latency.
const DRUPAL_AUTH_TIMEOUT_MS = 2500;

const REFRESH_COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
};

const issueAccessToken = (user, payload = {}) =>
  jwt.sign({ userId: user._id, ...payload }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });

const getClientIp = (req) => {
  const forwardedIp = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim())
    .find(Boolean);

  return (
    forwardedIp ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  );
};

const getClientUserAgent = (req) =>
  String(req.headers["user-agent"] || "").slice(0, 512);

const hashValue = (value) =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex");

const buildSessionFingerprint = (req) => {
  const ip = getClientIp(req);
  const userAgent = getClientUserAgent(req);

  return {
    ipHash: ip && ip !== "unknown" ? hashValue(ip) : null,
    userAgentHash: userAgent ? hashValue(userAgent) : null,
  };
};

const tokenFingerprint = (token) => hashValue(token).slice(0, 16);

const logAuthSecurityEvent = (eventName, payload = {}) => {
  console.warn(
    `[auth-security] ${eventName} ${JSON.stringify({
      ts: new Date().toISOString(),
      ...payload,
    })}`,
  );
};

const setRefreshCookie = (res, refreshToken, expiresAt) => {
  const maxAge = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  res.cookie("refreshToken", refreshToken, {
    ...REFRESH_COOKIE_BASE_OPTIONS,
    maxAge,
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie("refreshToken", REFRESH_COOKIE_BASE_OPTIONS);
};

const computeSlidingExpiry = ({
  now = new Date(),
  createdAt,
  absoluteExpiresAt,
}) => {
  const nowTime = now.getTime();
  const createdAtTime = new Date(createdAt || now).getTime();
  const absoluteTime = absoluteExpiresAt
    ? new Date(absoluteExpiresAt).getTime()
    : createdAtTime + REFRESH_TOKEN_ABSOLUTE_TTL_MS;
  const slidingTime = nowTime + REFRESH_TOKEN_TTL_MS;

  return new Date(Math.min(slidingTime, absoluteTime));
};

const pruneActiveSessions = async (userId) => {
  if (SESSION_MAX_PER_USER <= 0) {
    return;
  }

  const activeSessions = await Session.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastUsedAt: -1, createdAt: -1 })
    .select("_id")
    .lean();

  if (activeSessions.length <= SESSION_MAX_PER_USER) {
    return;
  }

  const staleSessionIds = activeSessions
    .slice(SESSION_MAX_PER_USER)
    .map((session) => session._id);

  if (!staleSessionIds.length) {
    return;
  }

  await Session.deleteMany({ _id: { $in: staleSessionIds } });
};

const isBcryptHash = (hash) => /^\$2[aby]\$\d{2}\$/.test(String(hash || ""));
const isSha256Hex = (hash) => /^[a-f0-9]{64}$/i.test(String(hash || ""));

const verifyPasswordWithFallback = async (plainPassword, storedHash) => {
  const hash = String(storedHash || "");
  if (!hash) {
    return { matched: false, shouldUpgrade: false };
  }

  if (isBcryptHash(hash)) {
    const matched = await bcrypt.compare(plainPassword, hash);
    return { matched, shouldUpgrade: false };
  }

  // Legacy compatibility: some synced users were stored as sha256(password) hex.
  if (isSha256Hex(hash)) {
    const digest = crypto
      .createHash("sha256")
      .update(plainPassword)
      .digest("hex");
    const matched = digest.toLowerCase() === hash.toLowerCase();
    return { matched, shouldUpgrade: matched };
  }

  return { matched: false, shouldUpgrade: false };
};

const buildDrupalSigninCandidates = () => {
  const rawBase = String(process.env.DRUPAL_API_URL || "").trim();
  const explicitAuthUrl = String(process.env.DRUPAL_AUTH_SIGNIN_URL || "")
    .trim()
    .replace(/\/+$/, "");

  const urls = explicitAuthUrl ? [explicitAuthUrl] : [];

  if (!rawBase) {
    return urls;
  }

  const base = rawBase.replace(/\/+$/, "");
  const derivedUrls = base.endsWith("/api")
    ? [`${base}/auth/signin`]
    : [`${base}/api/auth/signin`, `${base}/auth/signin`];

  return [...new Set([...urls, ...derivedUrls])];
};

const issueSessionTokens = async (req, res, user, payload = {}) => {
  const accessToken = issueAccessToken(user, payload);
  const refreshToken = crypto.randomBytes(64).toString("hex");
  const now = new Date();
  const absoluteExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_ABSOLUTE_TTL_MS);
  const expiresAt = computeSlidingExpiry({
    now,
    createdAt: now,
    absoluteExpiresAt,
  });
  const fingerprint = buildSessionFingerprint(req);

  await Session.create({
    userId: user._id,
    tokenFamily: crypto.randomUUID(),
    refreshToken,
    expiresAt,
    absoluteExpiresAt,
    lastUsedAt: now,
    rotationCount: 0,
    userAgentHash: fingerprint.userAgentHash,
    ipHash: fingerprint.ipHash,
  });

  await pruneActiveSessions(user._id);

  setRefreshCookie(res, refreshToken, expiresAt);

  return accessToken;
};

const authenticateAgainstDrupal = async (username, password) => {
  const candidates = buildDrupalSigninCandidates();
  if (!candidates.length) {
    return null;
  }

  const resolvePayload = (payload) => {
    const data = payload || {};
    if (data.user) {
      return data.user;
    }

    if (data.username || data.uid || data._id) {
      return {
        uid: data.uid || data._id,
        username: data.username || username,
        email: data.email || "",
        displayName: data.displayName || data.name || data.username || username,
      };
    }

    return null;
  };

  try {
    const drupalUser = await Promise.any(
      candidates.map(async (endpoint) => {
        const response = await axios.post(
          endpoint,
          { username, password },
          {
            timeout: DRUPAL_AUTH_TIMEOUT_MS,
            headers: { "Content-Type": "application/json" },
            validateStatus: () => true,
          },
        );

        if (response.status < 200 || response.status >= 300) {
          throw new Error(`status_${response.status}`);
        }

        const parsed = resolvePayload(response.data);
        if (!parsed) {
          throw new Error("invalid_payload");
        }

        return parsed;
      }),
    );

    return drupalUser;
  } catch (error) {
    console.warn("Drupal auth fallback failed:", error?.message || error);
    return null;
  }
};

export const signUp = async (req, res) => {
  try {
    const { username, password, email, firstName, lastName } = req.body;

    if (!username || !password || !email || !firstName || !lastName) {
      return res.status(400).json({
        message:
          "Không thể thiếu username, password, email, firstName, và lastName",
      });
    }

    // kiểm tra username tồn tại chưa
    const duplicate = await User.findOne({ username });

    if (duplicate) {
      return res.status(409).json({ message: "username đã tồn tại" });
    }

    // mã hoá password
    const hashedPassword = await bcrypt.hash(password, 10); // salt = 10

    // tạo user mới
    await User.create({
      username,
      hashedPassword,
      email,
      displayName: `${lastName} ${firstName}`,
    });

    // return
    return res.sendStatus(204);
  } catch (error) {
    console.error("Lỗi khi gọi signUp", error);

    // Mongo duplicate key error safeguard (e.g. race conditions / unique index).
    if (error?.code === 11000) {
      const key = Object.keys(error?.keyPattern || {})[0];
      if (key === "username") {
        return res.status(409).json({ message: "username đã tồn tại" });
      }
      if (key === "email") {
        return res.status(409).json({ message: "email đã tồn tại" });
      }
      return res.status(409).json({ message: "Thông tin đã tồn tại" });
    }

    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const signIn = async (req, res) => {
  try {
    // lấy inputs
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Thiếu username hoặc password." });
    }

    const usernameInput = String(username).trim();
    const normalizedUsername = usernameInput.toLowerCase();

    let user = null;
    if (normalizedUsername) {
      user = await User.findOne({ username: normalizedUsername });
    }
    if (!user && usernameInput !== normalizedUsername) {
      user = await User.findOne({ username: usernameInput });
    }
    let passwordCorrect = false;

    if (user?.hashedPassword) {
      const verification = await verifyPasswordWithFallback(
        password,
        user.hashedPassword,
      );
      passwordCorrect = verification.matched;

      if (passwordCorrect && verification.shouldUpgrade) {
        user.hashedPassword = await bcrypt.hash(password, 10);
        await user.save();
      }
    }

    // Fallback to Drupal auth so CRM users can sign in directly on the chat app.
    if (!passwordCorrect) {
      const drupalUser = await authenticateAgainstDrupal(username, password);

      if (!drupalUser) {
        return res
          .status(401)
          .json({ message: "username hoặc password không chính xác" });
      }

      user = await findOrCreateDrupalUser({
        uid: drupalUser.uid || drupalUser._id,
        username: drupalUser.username || username,
        email: drupalUser.email || "",
        displayName: drupalUser.displayName || drupalUser.name || username,
      });
    }

    const accessToken = await issueSessionTokens(req, res, user);

    // trả access token về trong res
    return res.status(200).json({
      message: `User ${user.displayName} đã logged in!`,
      accessToken,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl || null,
      },
    });
  } catch (error) {
    console.error("Lỗi khi gọi signIn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const signOut = async (req, res) => {
  try {
    // lấy refresh token từ cookie
    const token = String(req.cookies?.refreshToken || "").trim();

    if (token && REFRESH_TOKEN_FORMAT_REGEX.test(token)) {
      // xoá refresh token trong Session
      await Session.deleteOne({ refreshToken: token });
    }

    // xoá cookie
    clearRefreshCookie(res);

    return res.sendStatus(204);
  } catch (error) {
    console.error("Lỗi khi gọi signOut", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// tạo access token mới từ refresh token
export const refreshToken = async (req, res) => {
  try {
    // lấy refresh token từ cookie
    const token = String(req.cookies?.refreshToken || "").trim();
    if (!token) {
      return res.status(401).json({ message: "Token không tồn tại." });
    }

    if (!REFRESH_TOKEN_FORMAT_REGEX.test(token)) {
      logAuthSecurityEvent("refresh_token_format_invalid", {
        ip: getClientIp(req),
        tokenFingerprint: tokenFingerprint(token),
      });
      clearRefreshCookie(res);
      return res
        .status(403)
        .json({ message: "Token không hợp lệ hoặc đã hết hạn" });
    }

    const now = new Date();

    // so với refresh token trong db
    const session = await Session.findOne({ refreshToken: token });

    if (!session) {
      logAuthSecurityEvent("refresh_token_not_found", {
        ip: getClientIp(req),
        userAgentHash: hashValue(getClientUserAgent(req)),
        tokenFingerprint: tokenFingerprint(token),
      });
      clearRefreshCookie(res);
      return res
        .status(403)
        .json({ message: "Token không hợp lệ hoặc đã hết hạn" });
    }

    if (session.revokedAt) {
      clearRefreshCookie(res);
      return res
        .status(403)
        .json({ message: "Token không hợp lệ hoặc đã hết hạn" });
    }

    // kiểm tra hết hạn chưa
    if (session.expiresAt < now || session.absoluteExpiresAt < now) {
      await Session.deleteOne({ _id: session._id });
      clearRefreshCookie(res);
      return res.status(403).json({ message: "Token đã hết hạn." });
    }

    const currentFingerprint = buildSessionFingerprint(req);
    const userAgentMismatch =
      Boolean(session.userAgentHash) &&
      Boolean(currentFingerprint.userAgentHash) &&
      session.userAgentHash !== currentFingerprint.userAgentHash;
    const ipMismatch =
      Boolean(session.ipHash) &&
      Boolean(currentFingerprint.ipHash) &&
      session.ipHash !== currentFingerprint.ipHash;

    if (userAgentMismatch || ipMismatch) {
      logAuthSecurityEvent("session_fingerprint_mismatch", {
        sessionId: String(session._id),
        userId: String(session.userId),
        ip: getClientIp(req),
        mismatch: {
          ip: ipMismatch,
          userAgent: userAgentMismatch,
        },
      });

      if (SESSION_STRICT_FINGERPRINT) {
        await Session.updateOne(
          { _id: session._id },
          {
            $set: {
              revokedAt: now,
              lastUsedAt: now,
            },
          },
        );
        clearRefreshCookie(res);
        return res
          .status(403)
          .json({ message: "Phiên đăng nhập không còn hợp lệ." });
      }
    }

    const rotatedRefreshToken = crypto.randomBytes(64).toString("hex");
    const nextExpiresAt = computeSlidingExpiry({
      now,
      createdAt: session.createdAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    });

    const updateResult = await Session.updateOne(
      {
        _id: session._id,
        refreshToken: token,
        revokedAt: null,
      },
      {
        $set: {
          refreshToken: rotatedRefreshToken,
          expiresAt: nextExpiresAt,
          lastUsedAt: now,
          userAgentHash:
            currentFingerprint.userAgentHash || session.userAgentHash || null,
          ipHash: currentFingerprint.ipHash || session.ipHash || null,
        },
        $inc: {
          rotationCount: 1,
        },
      },
    );

    if (!updateResult.modifiedCount) {
      logAuthSecurityEvent("refresh_rotation_conflict", {
        sessionId: String(session._id),
        userId: String(session.userId),
        ip: getClientIp(req),
      });
      clearRefreshCookie(res);
      return res
        .status(403)
        .json({ message: "Token không hợp lệ hoặc đã hết hạn" });
    }

    // tạo access token mới
    const accessToken = issueAccessToken({ _id: session.userId });
    setRefreshCookie(res, rotatedRefreshToken, nextExpiresAt);

    // return
    return res.status(200).json({ accessToken });
  } catch (error) {
    console.error("Lỗi khi gọi refreshToken", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Google OAuth authentication
// Supports both:
//   - id_token (JWT): issued by <GoogleLogin> component or sign_in_with_google
//   - access_token (ya29.xxx): issued by useGoogleLogin({ flow: "implicit" })
const createAuthHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const resolveGoogleIdentityFromAccessToken = async (token) => {
  try {
    const userInfoResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      },
    );

    const info = userInfoResponse.data || {};
    return {
      googleId: info.sub,
      email: info.email,
      displayName: info.name,
      avatarUrl: info.picture ?? null,
    };
  } catch (error) {
    console.error(
      "Google userinfo fetch failed:",
      error?.response?.data ?? error.message,
    );
    throw createAuthHttpError(401, "Google access token không hợp lệ");
  }
};

const resolveGoogleIdentityFromIdToken = async (token) => {
  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch (error) {
    console.error("Google id_token verification failed:", error.message);
    throw createAuthHttpError(401, "Google token không hợp lệ");
  }

  const payload = ticket.getPayload() || {};
  return {
    googleId: payload.sub,
    email: payload.email,
    displayName: payload.name,
    avatarUrl: payload.picture ?? null,
  };
};

const resolveGoogleIdentity = async (token) => {
  const isAccessToken = String(token).startsWith("ya29.");
  return isAccessToken
    ? resolveGoogleIdentityFromAccessToken(token)
    : resolveGoogleIdentityFromIdToken(token);
};

const findOrCreateGoogleUser = async ({
  googleId,
  email,
  displayName,
  avatarUrl,
}) => {
  let user = await User.findOne({ $or: [{ googleId }, { email }] });

  if (!user) {
    return User.create({
      email,
      googleId,
      displayName,
      avatarUrl: avatarUrl ?? null,
      username: email.split("@")[0] + "_google_" + googleId.slice(-6),
      hashedPassword: null,
    });
  }

  let changed = false;
  if (!user.googleId) {
    user.googleId = googleId;
    changed = true;
  }
  if (!user.avatarUrl && avatarUrl) {
    user.avatarUrl = avatarUrl;
    changed = true;
  }
  if (changed) {
    await user.save();
  }

  return user;
};

export const googleAuth = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Thiếu Google token" });
    }

    const {
      googleId,
      email,
      displayName,
      avatarUrl,
    } = await resolveGoogleIdentity(token);

    if (!email || !googleId) {
      return res.status(401).json({ message: "Không lấy được thông tin từ Google" });
    }

    const user = await findOrCreateGoogleUser({
      googleId,
      email,
      displayName,
      avatarUrl,
    });

    const accessToken = await issueSessionTokens(req, res, user);

    return res.status(200).json({
      message: `User ${user.displayName} đã logged in với Google!`,
      accessToken,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl ?? null,
      },
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error("Lỗi khi gọi googleAuth", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

const findOrCreateDrupalUser = async ({
  uid,
  username,
  email,
  displayName,
}) => {
  const drupalId = Number(uid);
  const hasDrupalId = Number.isFinite(drupalId);
  const normalizedUsername = String(username).toLowerCase();
  const normalizedEmail = email ? String(email).toLowerCase() : "";

  let user = null;
  if (hasDrupalId) {
    user = await User.findOne({ drupalId });
  }
  if (!user) {
    user = await User.findOne({ username: normalizedUsername });
  }
  if (!user && normalizedEmail) {
    user = await User.findOne({ email: normalizedEmail });
  }

  if (user) {
    if (!user.drupalId && Number.isFinite(drupalId)) {
      user.drupalId = drupalId;
    }
    if (displayName && user.displayName !== displayName) {
      user.displayName = String(displayName);
    }
    await user.save();
    return user;
  }

  return User.create({
    username: normalizedUsername,
    email: normalizedEmail || `${normalizedUsername}@drupal.local`,
    displayName: String(displayName || username),
    drupalId: hasDrupalId ? drupalId : undefined,
    hashedPassword: crypto.randomBytes(32).toString("hex"),
    avatarUrl: null,
  });
};

// Drupal CRM SSO: verify signed payload and issue chat tokens.
export const drupalSso = async (req, res) => {
  try {
    const { uid, username, email, displayName, ts, sig } = req.body || {};

    if (!uid || !username || !ts || !sig) {
      return res.status(400).json({ message: "Thiếu thông tin SSO" });
    }

    const candidateSecrets = [
      process.env.DRUPAL_SSO_SECRET,
      process.env.ACCESS_TOKEN_SECRET,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (!candidateSecrets.length) {
      console.error("DRUPAL SSO secrets are not configured");
      return res.status(500).json({ message: "SSO configuration missing" });
    }

    const payload = [uid, username, email || "", displayName || "", ts].join(
      "|",
    );
    let signatureValid = false;

    for (const secret of candidateSecrets) {
      const expectedSig = crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("hex");

      const expectedBuffer = Buffer.from(expectedSig);
      const providedBuffer = Buffer.from(String(sig));
      if (
        expectedBuffer.length === providedBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, providedBuffer)
      ) {
        signatureValid = true;
        break;
      }
    }

    const providedBuffer = Buffer.from(String(sig));
    if (!signatureValid || !providedBuffer.length) {
      return res.status(401).json({ message: "SSO signature không hợp lệ" });
    }

    const now = Math.floor(Date.now() / 1000);
    const tsNumber = Number(ts);
    if (!Number.isFinite(tsNumber) || Math.abs(now - tsNumber) > 600) {
      return res.status(401).json({ message: "SSO token đã hết hạn" });
    }

    const user = await findOrCreateDrupalUser({
      uid,
      username,
      email,
      displayName,
    });

    const accessToken = await issueSessionTokens(req, res, user, {
      username: user.username,
      email: user.email,
      displayName: user.displayName,
    });

    return res.status(200).json({
      message: "SSO đăng nhập thành công",
      accessToken,
    });
  } catch (error) {
    console.error("Lỗi khi gọi drupalSso", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

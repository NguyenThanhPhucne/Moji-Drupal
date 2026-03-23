// @ts-nocheck
import bcrypt from "bcrypt";
import axios from "axios";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import Session from "../models/Session.js";
import { OAuth2Client } from "google-auth-library";

const ACCESS_TOKEN_TTL = "30m"; // thuờng là dưới 15m
const REFRESH_TOKEN_TTL = 14 * 24 * 60 * 60 * 1000; // 14 ngày
const DRUPAL_AUTH_TIMEOUT_MS = 8000;

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

const issueSessionTokens = async (res, user, payload = {}) => {
  const accessToken = jwt.sign(
    { userId: user._id, ...payload },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );

  const refreshToken = crypto.randomBytes(64).toString("hex");
  await Session.create({
    userId: user._id,
    refreshToken,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL),
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: REFRESH_TOKEN_TTL,
  });

  return accessToken;
};

const authenticateAgainstDrupal = async (username, password) => {
  const candidates = buildDrupalSigninCandidates();
  if (!candidates.length) {
    return null;
  }

  for (const endpoint of candidates) {
    try {
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
        continue;
      }

      const data = response.data || {};
      if (data.user) {
        return data.user;
      }

      if (data.username || data.uid || data._id) {
        return {
          uid: data.uid || data._id,
          username: data.username || username,
          email: data.email || "",
          displayName:
            data.displayName || data.name || data.username || username,
        };
      }
    } catch (error) {
      console.warn(
        `Drupal auth fallback failed at ${endpoint}:`,
        error?.message || error,
      );
    }
  }

  return null;
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

    let user = await User.findOne({ username: usernameInput }).collation({
      locale: "en",
      strength: 2,
    });
    if (!user && normalizedUsername) {
      user = await User.findOne({ username: normalizedUsername });
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

    const accessToken = await issueSessionTokens(res, user);

    // trả access token về trong res
    return res
      .status(200)
      .json({ message: `User ${user.displayName} đã logged in!`, accessToken });
  } catch (error) {
    console.error("Lỗi khi gọi signIn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const signOut = async (req, res) => {
  try {
    // lấy refresh token từ cookie
    const token = req.cookies?.refreshToken;

    if (token) {
      // xoá refresh token trong Session
      await Session.deleteOne({ refreshToken: token });

      // xoá cookie
      res.clearCookie("refreshToken");
    }

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
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ message: "Token không tồn tại." });
    }

    // so với refresh token trong db
    const session = await Session.findOne({ refreshToken: token });

    if (!session) {
      return res
        .status(403)
        .json({ message: "Token không hợp lệ hoặc đã hết hạn" });
    }

    // kiểm tra hết hạn chưa
    if (session.expiresAt < new Date()) {
      return res.status(403).json({ message: "Token đã hết hạn." });
    }

    // tạo access token mới
    const accessToken = jwt.sign(
      {
        userId: session.userId,
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL },
    );

    // return
    return res.status(200).json({ accessToken });
  } catch (error) {
    console.error("Lỗi khi gọi refreshToken", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Google OAuth authentication
export const googleAuth = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Thiếu Google token" });
    }

    // Xác minh token từ Google
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (error) {
      console.error("Google token verification failed:", error);
      return res.status(401).json({ message: "Google token không hợp lệ" });
    }

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const displayName = payload.name;

    // Tìm hoặc tạo user
    let user = await User.findOne({ email });

    if (!user) {
      // Tạo user mới từ thông tin Google
      user = await User.create({
        email,
        googleId,
        displayName,
        // Không có password vì đăng nhập bằng Google
        username: email.split("@")[0] + "_google_" + googleId.slice(-6),
        hashedPassword: null,
      });
    } else if (!user.googleId) {
      // Nếu user tồn tại nhưng chưa liên kết Google, liên kết ngay
      user.googleId = googleId;
      await user.save();
    }

    // Tạo access token
    const accessToken = jwt.sign(
      { userId: user._id },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL },
    );

    // Tạo refresh token
    const refreshToken = crypto.randomBytes(64).toString("hex");

    // Tạo session mới
    await Session.create({
      userId: user._id,
      refreshToken,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL),
    });

    // Trả refresh token về trong cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: REFRESH_TOKEN_TTL,
    });

    // Trả access token về trong response
    return res.status(200).json({
      message: `User ${user.displayName} đã logged in với Google!`,
      accessToken,
      user: {
        _id: user._id,
        email: user.email,
        displayName: user.displayName,
      },
    });
  } catch (error) {
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
      "open-crm-chat-sso-dev-secret",
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

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

    const accessToken = await issueSessionTokens(res, user, {
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

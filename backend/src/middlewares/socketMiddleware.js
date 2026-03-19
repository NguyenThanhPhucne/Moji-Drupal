import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import User from "../models/User.js";

const MONGO_ID_REGEX = /^[0-9a-fA-F]{24}$/;

const isMongoObjectId = (value) => MONGO_ID_REGEX.test(String(value || ""));

const verifySocketToken = (token) => {
  try {
    return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch (error) {
    console.warn("Socket token verification failed:", error?.message || error);
    return null;
  }
};

const findUserByDecodedToken = async (decoded) => {
  let user = null;

  if (isMongoObjectId(decoded?.userId)) {
    user = await User.findById(decoded.userId).select("-hashedPassword");
  }

  if (!user && decoded?.username) {
    user = await User.findOne({ username: decoded.username }).select(
      "-hashedPassword",
    );
  }

  const drupalIdNumber = Number(decoded?.userId);
  if (!user && Number.isInteger(drupalIdNumber)) {
    user = await User.findOne({ drupalId: drupalIdNumber }).select(
      "-hashedPassword",
    );
  }

  return user;
};

const syncDrupalUser = async (decoded) => {
  if (!decoded?.username) {
    return null;
  }

  const drupalIdNumber = Number(decoded.userId);

  try {
    return await User.create({
      username: decoded.username,
      email: decoded.email || `${decoded.username}@drupal.local`,
      displayName: decoded.displayName || decoded.username,
      drupalId: Number.isInteger(drupalIdNumber) ? drupalIdNumber : undefined,
      hashedPassword: `drupal-linked-${randomUUID()}`,
      avatarUrl: null,
    });
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    return User.findOne({
      $or: [
        { username: decoded.username },
        ...(Number.isInteger(drupalIdNumber)
          ? [{ drupalId: drupalIdNumber }]
          : []),
      ],
    }).select("-hashedPassword");
  }
};

export const socketAuthMiddleware = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Unauthorized - Token không tồn tại"));
    }

    const decoded = verifySocketToken(token);
    if (!decoded) {
      return next(new Error("Unauthorized - Token lỗi"));
    }

    let user = await findUserByDecodedToken(decoded);

    if (!user) {
      try {
        user = await syncDrupalUser(decoded);
      } catch (error) {
        console.error("Socket user sync failed:", error?.message || error);
        return next(new Error("Socket user sync failed"));
      }
    }

    if (!user) {
      return next(new Error("User chưa được đồng bộ"));
    }

    socket.user = user;
    next();
  } catch (error) {
    console.error("Socket Auth Error:", error);
    next(new Error("Unauthorized"));
  }
};

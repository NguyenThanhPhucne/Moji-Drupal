import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import User from "../models/User.js";
import { getCachedData, setCachedData } from "../libs/redis.js";

const MONGO_ID_REGEX = /^[0-9a-fA-F]{24}$/;

const isMongoObjectId = (value) => MONGO_ID_REGEX.test(String(value || ""));

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch {
    // Silently reject — invalid/expired tokens are expected traffic, not errors.
    return null;
  }
};

const findUserByDecodedToken = async (decodedUser) => {
  let user = null;

  if (isMongoObjectId(decodedUser?.userId)) {
    user = await User.findById(decodedUser?.userId).select("-hashedPassword");
  }

  if (!user && decodedUser?.username) {
    user = await User.findOne({ username: decodedUser.username }).select(
      "-hashedPassword",
    );
  }

  const drupalIdNumber = Number(decodedUser?.userId);
  if (!user && Number.isInteger(drupalIdNumber)) {
    user = await User.findOne({ drupalId: drupalIdNumber }).select(
      "-hashedPassword",
    );
  }

  return user;
};

const syncDrupalUser = async (decodedUser) => {
  if (!decodedUser?.username) {
    return null;
  }

  const drupalIdNumber = Number(decodedUser?.userId);

  try {
    return await User.create({
      username: decodedUser.username,
      email: decodedUser.email || `${decodedUser.username}@drupal.local`,
      displayName: decodedUser.displayName || decodedUser.username,
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
        { username: decodedUser.username },
        ...(Number.isInteger(drupalIdNumber)
          ? [{ drupalId: drupalIdNumber }]
          : []),
      ],
    }).select("-hashedPassword");
  }
};

export const protectedRoute = async (req, res, next) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Không tìm thấy access token" });
    }

    const decodedUser = verifyAccessToken(token);
    if (!decodedUser) {
      return res
        .status(403)
        .json({ message: "Token không hợp lệ hoặc hết hạn" });
    }

    let user = null;

    // 1. Try Redis cache first if we have a resolved userId or username
    const cacheKey = decodedUser.userId 
      ? `auth_profile:${decodedUser.userId}` 
      : decodedUser.username 
        ? `auth_profile:uname_${decodedUser.username}` 
        : null;

    if (cacheKey) {
      const cachedProfile = await getCachedData(cacheKey);
      if (cachedProfile) {
        user = cachedProfile;
      }
    }

    // 2. Fallback to DB
    if (!user) {
      user = await findUserByDecodedToken(decodedUser);

      // Save to cache for next time (1 hour TTL)
      if (user && cacheKey) {
        // we convert to lean object if not already to safely cache
        const userObj = user.toObject ? user.toObject() : user;
        await setCachedData(cacheKey, userObj, 3600);
      }
    }

    if (!user && decodedUser?.username) {
      console.log(
        `[Sync] User mới từ Drupal: ${decodedUser.username} (ID: ${decodedUser.userId}). Đang tạo...`,
      );

      try {
        user = await syncDrupalUser(decodedUser);
      } catch (error) {
        console.error("User auto-sync failed:", error);
        return res.status(500).json({ message: "Lỗi đồng bộ user" });
      }
    }

    if (!user) {
      return res.status(401).json({ message: "Phiên đăng nhập không hợp lệ" });
    }

    if (user.isBanned) {
      return res.status(403).json({ message: "Tài khoản của bạn đã bị khóa." });
    }

    req.user = user;
    // Keep decoded token data for RBAC checks downstream.
    req.decodedUser = decodedUser;
    req.authRoles = Array.isArray(decodedUser?.roles) ? decodedUser.roles : [];
    next();
  } catch (error) {
    console.error("Lỗi authMiddleware:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Chưa xác thực" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này" });
    }

    next();
  };
};

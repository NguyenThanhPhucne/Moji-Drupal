import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const socketAuthMiddleware = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Unauthorized - Token không tồn tại"));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (err) {
      return next(new Error("Unauthorized - Token lỗi"));
    }

    let user = null;

    // Tìm theo ID Mongo
    if (
      decoded.userId &&
      decoded.userId.toString().match(/^[0-9a-fA-F]{24}$/)
    ) {
      user = await User.findById(decoded.userId).select("-hashedPassword");
    }

    // Tìm theo Username (Drupal)
    if (!user && decoded.username) {
      user = await User.findOne({ username: decoded.username }).select(
        "-hashedPassword",
      );
    }

    // Nếu vẫn chưa có (do API chưa kịp sync), thử tìm lần cuối
    if (!user && decoded.username) {
      user = await User.findOne({ username: decoded.username });
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

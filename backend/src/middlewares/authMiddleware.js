import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protectedRoute = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Không tìm thấy access token" });
    }

    // 1. Giải mã Token
    let decodedUser;
    try {
      decodedUser = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (err) {
      return res
        .status(403)
        .json({ message: "Token không hợp lệ hoặc hết hạn" });
    }

    let user = null;

    // 2. Tìm User: Ưu tiên tìm theo ID MongoDB (cho user cũ)
    if (
      decodedUser.userId &&
      decodedUser.userId.toString().match(/^[0-9a-fA-F]{24}$/)
    ) {
      user = await User.findById(decodedUser.userId).select("-hashedPassword");
    }

    // 3. Tìm theo Username (cho user từ Drupal)
    if (!user && decodedUser.username) {
      user = await User.findOne({ username: decodedUser.username }).select(
        "-hashedPassword",
      );
    }

    // 4. Tìm theo Drupal ID (QUAN TRỌNG cho hybrid architecture)
    if (!user && decodedUser.userId && Number.isInteger(decodedUser.userId)) {
      user = await User.findOne({ drupalId: decodedUser.userId }).select(
        "-hashedPassword",
      );
    }

    // 5. AUTO-SYNC: Nếu chưa có -> TỰ ĐỘNG TẠO MỚI (Khắc phục lỗi 500)
    if (!user && decodedUser.username) {
      console.log(
        `[Sync] User mới từ Drupal: ${decodedUser.username} (ID: ${decodedUser.userId}). Đang tạo...`,
      );
      try {
        user = await User.create({
          username: decodedUser.username,
          email: decodedUser.email || `${decodedUser.username}@drupal.local`,
          displayName: decodedUser.displayName || decodedUser.username,
          drupalId: decodedUser.userId, // Lưu Drupal ID
          hashedPassword: "linked_with_drupal_jwt",
          avatarUrl: null,
        });
      } catch (err) {
        if (err.code === 11000) {
          user = await User.findOne({
            $or: [
              { username: decodedUser.username },
              { drupalId: decodedUser.userId },
            ],
          });
        } else {
          return res.status(500).json({ message: "Lỗi đồng bộ user" });
        }
      }
    }

    if (!user) {
      return res.status(404).json({ message: "User không tồn tại" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Lỗi authMiddleware:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

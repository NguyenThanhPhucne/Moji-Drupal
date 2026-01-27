// Script để fix users cũ: thêm drupalId hoặc xóa placeholders
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  displayName: String,
  drupalId: Number,
  hashedPassword: String,
  avatarUrl: String,
});

const User = mongoose.model("User", userSchema);

async function fixUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
    console.log("✅ Connected to MongoDB");

    // 1. Tìm tất cả users
    const allUsers = await User.find({});
    console.log(`\n📊 Tổng số users: ${allUsers.length}`);

    for (const user of allUsers) {
      console.log(`\n👤 User: ${user.username} (${user._id})`);
      console.log(`   Email: ${user.email}`);
      console.log(`   drupalId: ${user.drupalId || "CHƯA CÓ"}`);

      // Nếu là placeholder user (drupal_X)
      if (user.username.startsWith("drupal_")) {
        const match = user.username.match(/drupal_(\d+)/);
        if (match && !user.drupalId) {
          const drupalId = parseInt(match[1]);
          console.log(`   🔧 Cập nhật drupalId = ${drupalId}`);
          await User.updateOne({ _id: user._id }, { $set: { drupalId } });
        }
      }
    }

    // 2. Hiển thị users sau khi fix
    console.log("\n\n=== USERS SAU KHI FIX ===");
    const fixedUsers = await User.find({});
    for (const user of fixedUsers) {
      console.log(`👤 ${user.username} (drupalId: ${user.drupalId || "N/A"})`);
    }

    console.log("\n\n✅ Hoàn thành! Bạn có thể:");
    console.log("1. Đăng xuất và đăng nhập lại");
    console.log("2. Hoặc xóa các placeholder users cũ nếu muốn");

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

fixUsers();

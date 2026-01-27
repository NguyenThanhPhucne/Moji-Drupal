// Quick test: Check current user in MongoDB
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  displayName: String,
  drupalId: Number,
  hashedPassword: String,
});

const User = mongoose.model("User", userSchema);

async function checkCurrentUser() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
    console.log("✅ Connected to MongoDB\n");

    // Tìm user với drupalId
    const usersWithDrupalId = await User.find({ drupalId: { $exists: true } });

    console.log("👥 USERS VỚI DRUPAL ID:");
    usersWithDrupalId.forEach((u) => {
      console.log(`  - ${u.username} (drupalId: ${u.drupalId}, _id: ${u._id})`);
    });

    console.log("\n👥 USERS KHÔNG CÓ DRUPAL ID:");
    const usersWithoutDrupalId = await User.find({
      drupalId: { $exists: false },
    }).limit(5);
    usersWithoutDrupalId.forEach((u) => {
      console.log(`  - ${u.username} (_id: ${u._id})`);
    });

    console.log("\n\n💡 HƯỚNG DẪN:");
    console.log(
      "1. Nếu user bạn KHÔNG có drupalId → ĐĂNG XUẤT và ĐĂNG NHẬP LẠI",
    );
    console.log("2. Sau khi login lại, user mới sẽ có drupalId");
    console.log("3. Bây giờ tạo conversation sẽ hoạt động đúng!");

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkCurrentUser();

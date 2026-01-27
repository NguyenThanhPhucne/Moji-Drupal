// Debug: Check specific users
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  displayName: String,
  drupalId: Number,
});

const User = mongoose.model("User", userSchema);

async function debugUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
    console.log("✅ Connected\n");

    // Check specific IDs from logs
    const userA = await User.findById("69787348c48581c85923cd2a");
    const userB = await User.findById("69787361c48581c85923cd30");

    console.log("👤 USER A (aaaaa):");
    if (userA) {
      console.log(`   _id: ${userA._id}`);
      console.log(`   username: ${userA.username}`);
      console.log(`   displayName: ${userA.displayName}`);
      console.log(`   drupalId: ${userA.drupalId || "❌ KHÔNG CÓ"}`);
    } else {
      console.log("   ❌ KHÔNG TÌM THẤY!");
    }

    console.log("\n👤 USER B (bbbbb):");
    if (userB) {
      console.log(`   _id: ${userB._id}`);
      console.log(`   username: ${userB.username}`);
      console.log(`   displayName: ${userB.displayName}`);
      console.log(`   drupalId: ${userB.drupalId || "❌ KHÔNG CÓ"}`);
    } else {
      console.log("   ❌ KHÔNG TÌM THẤY!");
    }

    // Find all users named aaaaa or bbbbb
    console.log("\n\n📋 TẤT CẢ USERS TÊN 'aaaaa':");
    const allAAAA = await User.find({ username: "aaaaa" });
    allAAAA.forEach((u) => {
      console.log(
        `   - _id: ${u._id}, drupalId: ${u.drupalId || "NONE"}, displayName: ${u.displayName}`,
      );
    });

    console.log("\n📋 TẤT CẢ USERS TÊN 'bbbbb':");
    const allBBBB = await User.find({ username: "bbbbb" });
    allBBBB.forEach((u) => {
      console.log(
        `   - _id: ${u._id}, drupalId: ${u.drupalId || "NONE"}, displayName: ${u.displayName}`,
      );
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

debugUsers();

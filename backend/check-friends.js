// Check Friend data and User data
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

const friendSchema = new mongoose.Schema({
  userA: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  userB: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

const User = mongoose.model("User", userSchema);
const Friend = mongoose.model("Friend", friendSchema);

async function checkFriends() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
    console.log("✅ Connected to MongoDB\n");

    // Check users
    console.log("📋 ALL USERS:");
    const users = await User.find().select("_id username displayName drupalId");
    users.forEach((u) => {
      console.log(
        `  - ${u.username} (displayName: "${u.displayName}", drupalId: ${u.drupalId || "N/A"}, _id: ${u._id})`,
      );
    });

    console.log("\n📋 ALL FRIENDSHIPS:");
    const friendships = await Friend.find()
      .populate("userA", "username displayName drupalId")
      .populate("userB", "username displayName drupalId");

    if (friendships.length === 0) {
      console.log("  ❌ NO FRIENDSHIPS FOUND");
    } else {
      friendships.forEach((f) => {
        console.log(`\n  Friendship:`);
        console.log(`    UserA: ${f.userA?.username} (${f.userA?._id})`);
        console.log(`    UserB: ${f.userB?.username} (${f.userB?._id})`);
      });
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkFriends();

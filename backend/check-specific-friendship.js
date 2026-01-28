// Check specific friendship between admin and drupal_4
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

async function checkSpecificFriendship() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
    console.log("✅ Connected to MongoDB\n");

    const admin = await User.findOne({ username: "admin" });
    const drupal4 = await User.findOne({ drupalId: 4 });

    console.log("👤 ADMIN USER:");
    console.log(`  username: ${admin.username}`);
    console.log(`  displayName: ${admin.displayName}`);
    console.log(`  _id: ${admin._id}`);

    console.log("\n👤 DRUPAL_4 USER:");
    console.log(`  username: ${drupal4.username}`);
    console.log(`  displayName: ${drupal4.displayName}`);
    console.log(`  drupalId: ${drupal4.drupalId}`);
    console.log(`  _id: ${drupal4._id}`);

    // Check friendship
    const friendship = await Friend.findOne({
      $or: [
        { userA: admin._id, userB: drupal4._id },
        { userA: drupal4._id, userB: admin._id },
      ],
    });

    console.log("\n🤝 FRIENDSHIP STATUS:");
    if (friendship) {
      console.log(`  ✅ FOUND: ${friendship._id}`);
      console.log(`  UserA: ${friendship.userA}`);
      console.log(`  UserB: ${friendship.userB}`);
    } else {
      console.log(`  ❌ NOT FOUND`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkSpecificFriendship();

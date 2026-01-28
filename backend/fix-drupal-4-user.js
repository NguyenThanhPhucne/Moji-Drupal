// Fix user drupal_4 displayName
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

async function fixUser() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
    console.log("✅ Connected to MongoDB\n");

    const user = await User.findOne({ drupalId: 4 });

    if (!user) {
      console.log("❌ User with drupalId 4 not found");
      return;
    }

    console.log("📋 BEFORE:");
    console.log(`  username: ${user.username}`);
    console.log(`  displayName: ${user.displayName}`);
    console.log(`  drupalId: ${user.drupalId}`);

    // Update displayName from Drupal data
    user.displayName = "Bo Dong";
    user.username = "syncuser"; // Also fix username
    await user.save();

    console.log("\n✅ AFTER:");
    console.log(`  username: ${user.username}`);
    console.log(`  displayName: ${user.displayName}`);
    console.log(`  drupalId: ${user.drupalId}`);

    await mongoose.disconnect();
    console.log("\n✅ Done!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

fixUser();

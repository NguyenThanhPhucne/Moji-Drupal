// Check duplicate users
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

async function checkDuplicates() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
    console.log("✅ Connected to MongoDB\n");

    // Find both syncuser and drupal_4
    const syncuser = await User.findOne({ username: "syncuser" });
    const drupal4 = await User.findOne({ drupalId: 4 });

    console.log("👤 SYNCUSER:");
    console.log(`  _id: ${syncuser._id}`);
    console.log(`  username: ${syncuser.username}`);
    console.log(`  displayName: ${syncuser.displayName}`);
    console.log(`  drupalId: ${syncuser.drupalId || "N/A"}`);

    console.log("\n👤 DRUPAL_4:");
    console.log(`  _id: ${drupal4._id}`);
    console.log(`  username: ${drupal4.username}`);
    console.log(`  displayName: ${drupal4.displayName}`);
    console.log(`  drupalId: ${drupal4.drupalId}`);

    if (syncuser._id.toString() === drupal4._id.toString()) {
      console.log("\n✅ SAME USER (no duplicate)");
    } else {
      console.log("\n❌ DIFFERENT USERS (duplicate!)");
      console.log("\n💡 SOLUTION:");
      console.log("  1. Delete drupal_4 placeholder user");
      console.log("  2. Update syncuser to have drupalId: 4");
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkDuplicates();

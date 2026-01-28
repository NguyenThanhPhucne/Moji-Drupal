// Fix duplicate user issue
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

const conversationSchema = new mongoose.Schema({
  type: String,
  participants: [{ userId: mongoose.Schema.Types.ObjectId }],
});

const friendSchema = new mongoose.Schema({
  userA: mongoose.Schema.Types.ObjectId,
  userB: mongoose.Schema.Types.ObjectId,
});

const User = mongoose.model("User", userSchema);
const Conversation = mongoose.model("Conversation", conversationSchema);
const Friend = mongoose.model("Friend", friendSchema);

async function fixDuplicate() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
    console.log("✅ Connected to MongoDB\n");

    const syncuser = await User.findOne({ username: "syncuser" });
    const drupal4 = await User.findOne({ drupalId: 4 });

    console.log("📋 STEP 1: Update conversations using drupal_4");
    const convResult = await Conversation.updateMany(
      { "participants.userId": drupal4._id },
      { $set: { "participants.$[elem].userId": syncuser._id } },
      { arrayFilters: [{ "elem.userId": drupal4._id }] },
    );
    console.log(`✅ Updated ${convResult.modifiedCount} conversations`);

    console.log("\n📋 STEP 2: Update friendships using drupal_4");
    const friendResultA = await Friend.updateMany(
      { userA: drupal4._id },
      { $set: { userA: syncuser._id } },
    );
    const friendResultB = await Friend.updateMany(
      { userB: drupal4._id },
      { $set: { userB: syncuser._id } },
    );
    console.log(
      `✅ Updated ${friendResultA.modifiedCount + friendResultB.modifiedCount} friendships`,
    );

    console.log("\n📋 STEP 3: Delete placeholder user drupal_4");
    await User.findByIdAndDelete(drupal4._id);
    console.log(`✅ Deleted placeholder user ${drupal4._id}`);

    console.log("\n📋 STEP 4: Update syncuser with drupalId");
    syncuser.drupalId = 4;
    await syncuser.save();
    console.log(`✅ Updated syncuser ${syncuser._id} with drupalId: 4`);

    console.log("\n✅ ALL DONE! User syncuser now has drupalId: 4");

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

fixDuplicate();

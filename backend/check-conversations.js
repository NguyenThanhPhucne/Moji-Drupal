// Check conversations
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const conversationSchema = new mongoose.Schema({
  type: String,
  participants: [
    {
      userId: mongoose.Schema.Types.ObjectId,
      joinedAt: Date,
    },
  ],
  lastMessage: {
    text: String,
    senderId: mongoose.Schema.Types.ObjectId,
  },
  lastMessageAt: Date,
});

const userSchema = new mongoose.Schema({
  username: String,
  displayName: String,
  drupalId: Number,
});

const Conversation = mongoose.model("Conversation", conversationSchema);
const User = mongoose.model("User", userSchema);

async function checkConversations() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
    console.log("✅ Connected\n");

    const userA = "69787348c48581c85923cd2a";
    const userB = "69787361c48581c85923cd30";

    // Find conversation between these 2 users
    const convs = await Conversation.find({
      type: "direct",
      "participants.userId": { $all: [userA, userB] },
    })
      .populate("participants.userId", "username displayName drupalId")
      .populate("lastMessage.senderId", "username displayName");

    console.log(
      `🔍 Tìm thấy ${convs.length} conversation(s) giữa aaaaa và bbbbb:\n`,
    );

    for (const conv of convs) {
      console.log(`📝 Conversation ID: ${conv._id}`);
      console.log(`   Type: ${conv.type}`);
      console.log(`   Participants:`);
      conv.participants.forEach((p) => {
        const user = p.userId;
        console.log(
          `      - ${user.username} (${user.displayName}) [drupalId: ${user.drupalId}, _id: ${user._id}]`,
        );
      });
      if (conv.lastMessage) {
        console.log(`   Last Message: "${conv.lastMessage.text}"`);
        console.log(
          `   From: ${conv.lastMessage.senderId?.username || "unknown"}`,
        );
      }
      console.log("");
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkConversations();

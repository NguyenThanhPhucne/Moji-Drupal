// Check RAW conversation
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function checkRawConv() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
    console.log("✅ Connected\n");

    const userA = new mongoose.Types.ObjectId("69787348c48581c85923cd2a");
    const userB = new mongoose.Types.ObjectId("69787361c48581c85923cd30");

    // Find RAW
    const convs = await mongoose.connection.db
      .collection("conversations")
      .find({
        type: "direct",
        "participants.userId": { $all: [userA, userB] },
      })
      .toArray();

    console.log(`🔍 Tìm thấy ${convs.length} conversation(s):\n`);

    for (const conv of convs) {
      console.log(`📝 Conversation ID: ${conv._id}`);
      console.log(`   Type: ${conv.type}`);
      console.log(
        `   Participants:`,
        JSON.stringify(conv.participants, null, 2),
      );
      console.log(`   LastMessage:`, JSON.stringify(conv.lastMessage, null, 2));
      console.log("");
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkRawConv();

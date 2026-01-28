// Test script to check conversations and participants
import mongoose from "mongoose";
import Conversation from "./src/models/Conversation.js";
import User from "./src/models/User.js";
import dotenv from "dotenv";

dotenv.config();

async function testData() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
    console.log("✅ Connected to MongoDB");

    // 1. Check total conversations
    const convCount = await Conversation.countDocuments();
    console.log(`\n📊 Total conversations: ${convCount}`);

    // 2. Get all conversations with populate
    const conversations = await Conversation.find()
      .populate({
        path: "participants.userId",
        select: "_id displayName avatarUrl drupalId",
      })
      .lean();

    console.log(`\n🔍 Conversations details:`);
    conversations.forEach((conv, idx) => {
      console.log(`\n[${idx + 1}] ID: ${conv._id}`);
      console.log(`    Type: ${conv.type}`);
      console.log(`    Participants count: ${conv.participants?.length || 0}`);

      if (conv.participants && conv.participants.length > 0) {
        conv.participants.forEach((p, pIdx) => {
          console.log(
            `      [${pIdx + 1}] User: ${p.userId?.displayName || "Unknown"} (ID: ${p.userId?._id})`,
          );
        });
      } else {
        console.log(`      ⚠️ No participants`);
      }
    });

    // 3. Check if participants.userId field exists
    const sampleConv = conversations[0];
    if (sampleConv) {
      console.log(`\n📋 Sample conversation raw data:`);
      console.log(JSON.stringify(sampleConv, null, 2).substring(0, 500));
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

testData();

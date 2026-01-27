import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const mongoUri = process.env.MONGO_URI;

async function testGroupCreation() {
  try {
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Test case: Tạo group với memberIds = [6, 7] (Drupal IDs)
    console.log("\n📝 Simulating group creation with Drupal IDs:");
    console.log("memberIds: [6, 7]");
    
    const User = mongoose.model("User", new mongoose.Schema({
      username: String,
      drupalId: Number
    }));

    // Find users by drupalId
    const user6 = await User.findOne({ drupalId: 6 });
    const user7 = await User.findOne({ drupalId: 7 });

    console.log("\n🔍 Users found:");
    console.log("User drupalId=6:", user6 ? `MongoDB _id: ${user6._id}` : "NOT FOUND");
    console.log("User drupalId=7:", user7 ? `MongoDB _id: ${user7._id}` : "NOT FOUND");

    if (!user6 || !user7) {
      console.log("\n❌ PROBLEM: Users not found in MongoDB!");
      console.log("Frontend gửi drupalId (6, 7), nhưng backend cần MongoDB ObjectId");
    } else {
      console.log("\n✅ Mapping successful!");
      console.log("Backend should convert: [6, 7] → [" + user6._id + ", " + user7._id + "]");
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

testGroupCreation();

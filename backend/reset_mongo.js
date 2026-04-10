import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const reset = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
    console.log("🔥 Đã kết nối MongoDB...");

    const db = mongoose.connection.db;
    const collections = await db.collections();

    for (const collection of collections) {
      await collection.deleteMany({});
      console.log(`🧹 Đã dọn sạch collection: ${collection.collectionName}`);
    }

    console.log("✅ XÓA SẠCH DATABASE THÀNH CÔNG!");
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

reset();

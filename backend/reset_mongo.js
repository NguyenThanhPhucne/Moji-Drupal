// reset_mongo.js
require("dotenv").config();
const mongoose = require("mongoose");

const reset = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
    console.log("🔥 Đã kết nối MongoDB...");

    // Xóa sạch tin nhắn và hội thoại
    await mongoose.connection.collection("messages").deleteMany({});
    await mongoose.connection.collection("conversations").deleteMany({});

    // Tùy chọn: Xóa luôn User bên Mongo để nó tự Sync lại từ Drupal
    // await mongoose.connection.collection('users').deleteMany({});

    console.log("✅ Đã xóa sạch: Messages, Conversations.");
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

reset();

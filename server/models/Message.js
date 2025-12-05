const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  room: { type: String, required: true },
  author: { type: String, required: true },
  authorPic: { type: String, default: "" }, // <--- NEW FIELD
  type: { type: String, default: "text" },
  message: { type: String, required: true },
  time: { type: String, required: true },
  isEdited: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Message", MessageSchema);
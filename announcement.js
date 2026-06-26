import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema({
  title: String,
  content: { type: String, required: true },
  category: String,
  date: String,
  hash: { type: String, unique: true },
  images: [String],
});

export default mongoose.model("Announcement", announcementSchema);
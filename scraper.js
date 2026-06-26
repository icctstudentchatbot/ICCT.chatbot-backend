import express from "express";
import puppeteer from "puppeteer";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";
import Announcement from "./models/announcement.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ======================
// DATABASE
// ======================

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB Atlas Connected");
    console.log("📦 Database Name:", mongoose.connection.db.databaseName);

    const test = await Announcement.create({
      title: "TEST",
      content: "TEST CONTENT " + Date.now(),
      category: "test",
      hash: crypto.randomUUID(),
      images: [],
    });

    console.log("🧪 TEST DOCUMENT SAVED:", test._id);

    scrapeFacebook();
    setInterval(scrapeFacebook, 10 * 60 * 1000);
  })
  .catch((err) => {
    console.error("❌ MongoDB Error:", err);
  });

// ======================
// FACEBOOK SCRAPER
// ======================

const FB_URL = "https://www.facebook.com/IM4ICCT/";

function cleanText(text) {
  return text
    .replace(/See more/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function categorizePost(text) {
  const lower = text.toLowerCase();

  if (lower.includes("sip") || lower.includes("student internship"))
    return "internship";

  if (lower.includes("sog")) return "sog";
  if (lower.includes("enrollment")) return "enrollment";
  if (lower.includes("tuition") || lower.includes("fees") || lower.includes("payment"))
    return "fees";

  if (
    lower.includes("event") ||
    lower.includes("seminar") ||
    lower.includes("orientation") ||
    lower.includes("program")
  )
    return "events";

  if (lower.includes("blackboard")) return "blackboard";
  if (lower.includes("portal")) return "portal";
  if (lower.includes("scholarship")) return "scholarship";

  return "general";
}

async function scrapeFacebook() {
  let browser;

  try {
    console.log("\n🔎 Checking Facebook...");

    console.log("MONGO STATE:", mongoose.connection.readyState);

    browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    );

    await page.goto(FB_URL, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // ======================
    // SCROLL
    // ======================
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, 2500));
      await new Promise((r) => setTimeout(r, 2000));
    }

    await new Promise((r) => setTimeout(r, 3000));

    // ======================
    // EXTRACT
    // ======================
    const posts = await page.evaluate(() => {
      const data = [];

      document.querySelectorAll("div[role='article']").forEach((article) => {
        const text = article.innerText || "";

        const images = [];

        article.querySelectorAll("img").forEach((img) => {
          const src = img?.src;

          if (
            src &&
            src.startsWith("http") &&
            !src.includes("emoji") &&
            !src.includes("static.xx") &&
            !src.includes("profile")
          ) {
            images.push(src);
          }
        });

        if (text && text.length > 30) {
          data.push({ text, images });
        }
      });

      return data;
    });

    console.log("📄 POSTS FOUND:", posts.length);

    // ======================
    // SAVE TO DB (DEBUG MODE)
    // ======================
    for (const item of posts) {
      const post = cleanText(item.text);

      if (!post || post.length < 20) {
        console.log("❌ SKIPPED EMPTY POST");
        continue;
      }

      const hash = crypto.createHash("md5").update(post).digest("hex");

      console.log("\n➡️ PROCESSING POST:");
      console.log(post.substring(0, 80));
      console.log("HASH:", hash);

      try {
        const exists = await Announcement.findOne({ hash });

        if (exists) {
          console.log("⏭ DUPLICATE SKIPPED");
          continue;
        }

        console.log("➡️ INSERTING INTO MONGO...");

        const result = await Announcement.create({
          title: post.substring(0, 80),
          content: post,
          category: categorizePost(post),
          date: new Date().toLocaleDateString(),
          hash,
          images: item.images || [],
        });

        console.log("💾 SAVED SUCCESSFULLY:", result._id);
      } catch (err) {
        console.error("❌ MONGO SAVE ERROR:");
        console.error(err);
      }
    }

    await browser.close();
    console.log("✅ SCRAPE COMPLETE\n");

  } catch (err) {
    console.error("❌ SCRAPER ERROR:");
    console.error(err);

    if (browser) await browser.close();
  }
}

// ======================
// API
// ======================

app.get("/announcements/search", async (req, res) => {
  const q = req.query.q || "";

  const data = await Announcement.find({
    content: { $regex: q, $options: "i" },
  }).sort({ createdAt: -1 });

  res.json(data);
});

// ======================
// SERVER
// ======================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
});

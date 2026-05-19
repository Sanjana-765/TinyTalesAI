require('dotenv').config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const nodemailer = require("nodemailer");
const { promises: dns } = require("dns");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";
const DB_PATH = path.join(__dirname, "tinytales.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  image TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS story_counts (
  user_id INTEGER PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

async function isDeliverableEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
  if (!emailRegex.test(email)) return false;

  const domain = email.split("@")[1].toLowerCase();
  const blockedTypoDomains = new Set([
    "fmail.com",
    "gmial.com",
    "gamil.com",
    "yaho.com",
    "hotnail.com",
    "outllok.com"
  ]);
  if (blockedTypoDomains.has(domain)) return false;

  try {
    const mx = await dns.resolveMx(domain);
    if (mx && mx.length > 0) return true;
  } catch {
    // fallback below; do not hard-fail on DNS transient errors
  }

  try {
    const [a, aaaa] = await Promise.allSettled([dns.resolve4(domain), dns.resolve6(domain)]);
    const hasA = a.status === "fulfilled" && a.value.length > 0;
    const hasAAAA = aaaa.status === "fulfilled" && aaaa.value.length > 0;
    if (hasA || hasAAAA) return true;
    // If DNS cannot verify in this environment, don't block legitimate users.
    return true;
  } catch {
    return true;
  }
}

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

async function sendThankYouEmail(email) {
  const transporter = getTransporter();
  if (!transporter) return;
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Thank you for logging in to TinyTales AI",
    text: "Thank you for logging in to TinyTales AI. We are excited to help you create magical stories.",
    html: "<p>Thank you for logging in to <strong>TinyTales AI</strong>.</p><p>We are excited to help you create magical stories.</p>"
  });
}

async function validateCredentials(email, password, res) {
  if (!(await isDeliverableEmail(email))) {
    res.status(400).json({ error: "Please enter a valid, deliverable email address." });
    return false;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return false;
  }
  return true;
}

function issueToken(userId, email) {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "7d" });
}

app.post("/api/auth/signup", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!(await validateCredentials(email, password, res))) return;

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "Account already exists. Please sign in." });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, hash);
  const userId = result.lastInsertRowid;
  db.prepare("INSERT OR IGNORE INTO story_counts (user_id, count) VALUES (?, 0)").run(userId);
  const token = issueToken(userId, email);
  sendThankYouEmail(email).catch(() => {});
  res.status(201).json({ token, email, message: "Account created successfully." });
});

app.post("/api/auth/signin", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!(await validateCredentials(email, password, res))) return;

  const existing = db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email);
  if (!existing) {
    return res.status(404).json({ error: "No account found. Please create an account." });
  }
  const ok = bcrypt.compareSync(password, existing.password_hash);
  if (!ok) return res.status(401).json({ error: "Incorrect password." });

  const token = issueToken(existing.id, email);
  sendThankYouEmail(email).catch(() => {});
  res.json({ token, email, message: "Signed in successfully." });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!(await validateCredentials(email, password, res))) return;

  const existing = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email);
  let userId;
  let message;

  if (!existing) {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, hash);
    userId = result.lastInsertRowid;
    db.prepare("INSERT OR IGNORE INTO story_counts (user_id, count) VALUES (?, 0)").run(userId);
    message = "Account created and logged in.";
  } else {
    const ok = bcrypt.compareSync(password, existing.password_hash);
    if (!ok) return res.status(401).json({ error: "Incorrect password." });
    userId = existing.id;
    message = "Logged in successfully.";
  }

  const token = issueToken(userId, email);
  sendThankYouEmail(email).catch(() => {});
  res.json({ token, email, message });
});

app.delete("/api/auth/delete-account", authMiddleware, (req, res) => {
  const result = db.prepare("DELETE FROM users WHERE id = ?").run(req.user.userId);
  if (result.changes === 0) return res.status(404).json({ error: "Account not found." });
  res.json({ ok: true });
});

app.post("/api/generate-story", authMiddleware, async (req, res) => {
  const base64Data = String(req.body?.base64Data || "");
  const mediaType = String(req.body?.mediaType || "");
  const userHint = String(req.body?.userHint || "");
  const ageSettings = req.body?.ageSettings || { age: "6-8", sentenceRule: "Be 5-7 sentences long", guidance: "Use simple storybook language." };

  if (!base64Data || !mediaType) {
    return res.status(400).json({ error: "Missing image data." });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "Server missing GROQ_API_KEY environment variable." });
  }

  const hintText = userHint
    ? `The child (or parent) says the drawing shows: "${userHint}". Use this as extra context. `
    : "";

  const prompt = `${hintText}You are TinyTales AI, a warm and imaginative storyteller for children aged ${ageSettings.age}.
Look carefully at this child's drawing and write a short, joyful moral story inspired by what you see.

Rules you MUST follow:
- Write like a real storybook: jump straight into the story world with character names and events
- NEVER mention the drawing, artwork, or image. Do not use phrases like "In this drawing", "The child drew", "In the uploaded image", "As seen in the artwork" or "The picture shows"
- Give the main character a proper name (e.g. "Leo the lion" not just "the lion")
- ${ageSettings.sentenceRule}
- Adjust story complexity for ages ${ageSettings.age}: ${ageSettings.guidance}
- ONLY write about what you actually see in the image. Do not invent unrelated characters or settings.
- If you cannot clearly see the image, write a general nature-themed story.
- End with a gentle moral lesson
- Keep language warm and suitable for ages ${ageSettings.age}

You MUST respond with ONLY a raw JSON object. No explanation, no extra text, no markdown, nothing before or after the JSON.
{"title":"A creative story title","body":"A children's story based strictly on what you see in this image, matching the requested age range. No meta-references.","moral":"Moral: One gentle lesson."}`;

  try {
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64Data}` } },
              { type: "text", text: prompt }
            ]
          }
        ]
      })
    });

    const data = await groqResponse.json().catch(() => ({}));
    if (!groqResponse.ok) {
      return res.status(groqResponse.status).json({ error: data?.error?.message || "Story generation failed." });
    }
    const rawText = data?.choices?.[0]?.message?.content?.trim() || "";
    const clean = rawText.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
    const story = JSON.parse(clean);
    res.json({ story });
  } catch {
    res.status(500).json({ error: "Story generation request failed." });
  }
});

app.get("/api/me", authMiddleware, (req, res) => {
  const storyCount = db.prepare("SELECT count FROM story_counts WHERE user_id = ?").get(req.user.userId)?.count || 0;
  res.json({ email: req.user.email, storyCount });
});

app.post("/api/story-count/increment", authMiddleware, (req, res) => {
  db.prepare(`
    INSERT INTO story_counts (user_id, count) VALUES (?, 1)
    ON CONFLICT(user_id) DO UPDATE SET count = count + 1
  `).run(req.user.userId);
  const storyCount = db.prepare("SELECT count FROM story_counts WHERE user_id = ?").get(req.user.userId)?.count || 0;
  res.json({ storyCount });
});

app.get("/api/stories", authMiddleware, (req, res) => {
  const stories = db.prepare(`
    SELECT CAST(id AS TEXT) AS id, image, title, text, created_at
    FROM stories
    WHERE user_id = ?
    ORDER BY id DESC
  `).all(req.user.userId);
  res.json({ stories });
});

app.post("/api/stories", authMiddleware, (req, res) => {
  const image = String(req.body?.image || "").trim();
  const title = String(req.body?.title || "").trim();
  const text = String(req.body?.text || "").trim();
  if (!image || !title || !text) return res.status(400).json({ error: "Missing story fields." });

  const duplicate = db.prepare(`
    SELECT id FROM stories
    WHERE user_id = ? AND title = ? AND text = ?
  `).get(req.user.userId, title, text);
  if (duplicate) return res.status(409).json({ error: "Story already saved." });

  const result = db.prepare(`
    INSERT INTO stories (user_id, image, title, text)
    VALUES (?, ?, ?, ?)
  `).run(req.user.userId, image, title, text);

  res.status(201).json({ id: String(result.lastInsertRowid) });
});

app.delete("/api/stories/:id", authMiddleware, (req, res) => {
  const result = db.prepare("DELETE FROM stories WHERE id = ? AND user_id = ?").run(req.params.id, req.user.userId);
  if (result.changes === 0) return res.status(404).json({ error: "Story not found." });
  res.json({ ok: true });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`TinyTales server running at http://localhost:${PORT}`);
});

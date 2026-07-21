import "dotenv/config";
import cors from "cors";
import express from "express";
import OpenAI from "openai";
import { mountCloudRoutes } from "./cloud.js";

const app = express();
const allowedOrigins = [
  /^chrome-extension:\/\//,
  /^https:\/\/app\.tinkr\.com$/,
  /^http:\/\/localhost:3000$/
];
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.some(re => re.test(origin))) callback(null, true);
    else callback(new Error("CORS blocked"));
  }
}));
app.use(express.json({ limit: "200kb" }));
app.use(express.static(new URL("./public", import.meta.url).pathname));

const schema = {
  type: "object", additionalProperties: false,
  required: ["summary", "operations"],
  properties: {
    summary: { type: "string" },
    operations: { type: "array", maxItems: 8, items: {
      type: "object", additionalProperties: false, required: ["type"],
      properties: {
        type: { type: "string", enum: ["update_text", "set_styles", "hide", "insert_component"] },
        text: { type: "string" },
        styles: { type: "object", additionalProperties: { type: "string" } },
        component: { type: "string", enum: ["cta", "testimonial", "feature"] }
      }
    }}
  }
};

const PATCH_SYSTEM_PROMPT = `You are tinkr's design co-designer. Return only safe, bounded patches for the selected element. Never produce JavaScript, event handlers, URLs, form changes, or actions outside this element. Preserve intent and accessibility. Honor design tokens when provided.

Respond with ONLY valid JSON matching this schema (no markdown, no prose):
${JSON.stringify(schema)}`;

function parsePatchJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const raw = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(raw);
}

app.post("/api/patch", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "OPENAI_API_KEY is not configured on the tinkr server." });
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined
  });
  const payload = { prompt: req.body?.prompt, element: req.body?.element, tokens: req.body?.tokens };
  if (!payload.prompt || !payload.element) return res.status(400).json({ error: "prompt and selected element are required" });
  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "MBZUAI-IFM/K2-Think-v2",
      messages: [
        { role: "system", content: PATCH_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) }
      ],
      stream: false
    });
    const content = response.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "AI returned empty response" });
    res.json(parsePatchJson(content));
  } catch (error) {
    res.status(502).json({ error: error?.message || "AI patch generation failed" });
  }
});
app.get("/health", (_req, res) => res.json({ ok: true }));
mountCloudRoutes(app);
app.get("/review/:token", (_req, res) => res.sendFile(new URL("./public/review.html", import.meta.url).pathname));
app.listen(Number(process.env.PORT || 8787), () => console.log("tinkr AI server listening"));

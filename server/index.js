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

app.post("/api/patch", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "OPENAI_API_KEY is not configured on the Tinkr server." });
  const client = new OpenAI();
  const payload = { prompt: req.body?.prompt, element: req.body?.element };
  if (!payload.prompt || !payload.element) return res.status(400).json({ error: "prompt and selected element are required" });
  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6",
      input: [
        { role: "system", content: "You are Tinkr's design co-designer. Return only safe, bounded patches for the selected element. Never produce JavaScript, event handlers, URLs, form changes, or actions outside this element. Preserve intent and accessibility. Honor design tokens when provided." },
        { role: "user", content: JSON.stringify(payload) }
      ],
      text: { format: { type: "json_schema", name: "tinkr_patch", strict: true, schema } }
    });
    res.json(JSON.parse(response.output_text));
  } catch (error) { res.status(502).json({ error: error?.message || "AI patch generation failed" }); }
});
app.get("/health", (_req, res) => res.json({ ok: true }));
mountCloudRoutes(app);
app.get("/review/:token", (_req, res) => res.sendFile(new URL("./public/review.html", import.meta.url).pathname));
app.listen(Number(process.env.PORT || 8787), () => console.log("Tinkr AI server listening"));

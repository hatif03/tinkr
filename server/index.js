import "dotenv/config";
import cors from "cors";
import express from "express";
import OpenAI from "openai";
import { mountCloudRoutes } from "./cloud.js";
import { createAiPatchHandler, getAiCapabilities } from "./ai.js";

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

app.get("/api/ai/capabilities", (_req, res) => res.json(getAiCapabilities()));
app.post("/api/patch", createAiPatchHandler({ OpenAI }));
app.get("/health", (_req, res) => res.json({ ok: true, ai: getAiCapabilities() }));
mountCloudRoutes(app);
app.get("/review/:token", (_req, res) => res.sendFile(new URL("./public/review.html", import.meta.url).pathname));
app.use((error, _req, res, _next) => {
  if (error?.type === "entity.too.large" || error?.status === 413) {
    return res.status(413).json({ error: "This tinkr draft is too large to sync. It remains saved locally.", code: "DRAFT_TOO_LARGE", retryable: false });
  }
  if (error?.message === "CORS blocked") {
    return res.status(403).json({ error: "This origin is not allowed to call the tinkr API.", code: "CORS_BLOCKED", retryable: false });
  }
  const status = Number(error?.status) >= 400 ? Number(error.status) : 500;
  return res.status(status).json({ error: "The tinkr API could not complete this request.", code: "API_ERROR", retryable: status >= 500 });
});
app.listen(Number(process.env.PORT || 8787), () => console.log("tinkr AI server listening"));

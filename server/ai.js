import { randomUUID } from "node:crypto";

export const AI_PATCH_SCHEMA_VERSION = "2026-07-21";
export const SAFE_COMPONENTS = Object.freeze(["cta", "testimonial", "feature"]);
export const SAFE_STYLE_PROPERTIES = Object.freeze([
  "color", "background", "backgroundColor", "fontFamily", "fontSize", "fontWeight", "fontStyle",
  "lineHeight", "letterSpacing", "textAlign", "textTransform", "textDecoration", "textDecorationLine",
  "textOverflow", "whiteSpace", "overflow", "display", "opacity", "borderRadius", "borderColor",
  "borderWidth", "borderStyle", "boxShadow", "padding", "paddingTop", "paddingRight", "paddingBottom",
  "paddingLeft", "margin", "marginTop", "marginRight", "marginBottom", "marginLeft", "gap", "width",
  "height", "minWidth", "minHeight", "maxWidth", "maxHeight", "objectFit", "objectPosition", "filter",
  "justifyContent", "alignItems", "flexDirection", "flexWrap", "gridTemplateColumns", "gridTemplateRows",
  "gridAutoFlow", "visibility"
]);

const SAFE_STYLE_SET = new Set(SAFE_STYLE_PROPERTIES);
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_MODEL = "MBZUAI-IFM/K2-Think-v2";
const DANGEROUS_STYLE_VALUE = /(?:url\s*\(|expression\s*\(|javascript\s*:|@import|behavior\s*:|-moz-binding|[;{}<>])/i;

export const patchSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "operations"],
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 400 },
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        oneOf: [
          {
            type: "object", additionalProperties: false,
            required: ["type", "text"],
            properties: { type: { const: "update_text" }, text: { type: "string", minLength: 1, maxLength: 3_000 } }
          },
          {
            type: "object", additionalProperties: false,
            required: ["type", "styles"],
            properties: { type: { const: "set_styles" }, styles: { type: "object", minProperties: 1, maxProperties: 20 } }
          },
          {
            type: "object", additionalProperties: false,
            required: ["type"],
            properties: { type: { const: "hide" } }
          },
          {
            type: "object", additionalProperties: false,
            required: ["type", "component"],
            properties: { type: { const: "insert_component" }, component: { enum: SAFE_COMPONENTS } }
          }
        ]
      }
    }
  }
};

export class AiValidationError extends Error {
  constructor(message, code = "AI_INVALID_REQUEST", status = 400) {
    super(message);
    this.name = "AiValidationError";
    this.code = code;
    this.status = status;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function assertPlainObject(value, label, code = "AI_INVALID_REQUEST", status = 400) {
  if (!isPlainObject(value)) throw new AiValidationError(`${label} must be an object.`, code, status);
  return value;
}

function assertNoUnknownKeys(value, keys, label, code = "AI_INVALID_REQUEST", status = 400) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new AiValidationError(`${label} contains an unsupported field: ${key}.`, code, status);
  }
}

function requiredString(value, label, { min = 1, max = 1_000, code = "AI_INVALID_REQUEST", status = 400 } = {}) {
  if (typeof value !== "string") throw new AiValidationError(`${label} must be text.`, code, status);
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new AiValidationError(`${label} must be between ${min} and ${max} characters.`, code, status);
  }
  return text;
}

function optionalString(value, label, max = 1_000) {
  if (value === undefined || value === null) return undefined;
  return requiredString(value, label, { min: 0, max });
}

function readTimeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.max(1_000, Math.min(MAX_TIMEOUT_MS, Math.round(parsed)));
}

function providerName(baseURL) {
  if (!baseURL) return "OpenAI-compatible provider";
  try {
    return new URL(baseURL).hostname || "OpenAI-compatible provider";
  } catch {
    return "OpenAI-compatible provider";
  }
}

export function getAiConfig(env = process.env) {
  const baseURL = String(env.OPENAI_BASE_URL || "").trim() || undefined;
  return {
    configured: Boolean(String(env.OPENAI_API_KEY || "").trim()),
    baseURL,
    provider: providerName(baseURL),
    model: String(env.OPENAI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    timeoutMs: readTimeout(env.TINKR_AI_TIMEOUT_MS)
  };
}

export function getAiCapabilities(env = process.env) {
  const config = getAiConfig(env);
  return {
    // This endpoint intentionally does not spend a provider request merely to
    // probe health. It reports configuration truth; request-time failures are
    // returned with concrete AI_* codes below.
    status: config.configured ? "configured" : "not_configured",
    configured: config.configured,
    providerHealth: "not_checked",
    provider: config.provider,
    model: config.model,
    timeoutMs: config.timeoutMs,
    patchSchemaVersion: AI_PATCH_SCHEMA_VERSION,
    safeOperations: ["update_text", "set_styles", "hide", "insert_component"],
    supportsPreview: true,
    supportsCancellation: true
  };
}

function compactTokens(tokens) {
  if (tokens === undefined || tokens === null) return {};
  assertPlainObject(tokens, "tokens");
  const entries = Object.entries(tokens);
  if (entries.length > 50) throw new AiValidationError("tokens may contain at most 50 values.");
  const result = {};
  for (const [name, value] of entries) {
    if (!/^--tinkr-[a-z0-9-]{1,64}$/i.test(name)) continue;
    const text = optionalString(value, `token ${name}`, 256);
    if (text !== undefined && !DANGEROUS_STYLE_VALUE.test(text)) result[name] = text;
  }
  return result;
}

function compactElement(element) {
  assertPlainObject(element, "element");
  const selector = optionalString(element.selector, "element.selector", 1_200);
  const tag = optionalString(element.tag, "element.tag", 32);
  if (!tag) throw new AiValidationError("element.tag is required.");
  const text = optionalString(element.text, "element.text", 1_200) || "";
  const parent = optionalString(element.parent, "element.parent", 32);
  const layout = isPlainObject(element.layout) ? element.layout : {};
  const styles = isPlainObject(element.styles) ? element.styles : {};
  const finiteDimension = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(100_000, Math.round(Number(value)))) : undefined;

  // Deliberately omit element.html. The AI only needs the selected element's
  // semantic and visual summary; forwarding raw DOM can include unrelated data.
  return {
    ...(selector ? { selector } : {}),
    tag: tag.toLowerCase(),
    text,
    ...(parent ? { parent: parent.toLowerCase() } : {}),
    layout: {
      ...(finiteDimension(layout.width) !== undefined ? { width: finiteDimension(layout.width) } : {}),
      ...(finiteDimension(layout.height) !== undefined ? { height: finiteDimension(layout.height) } : {}),
      ...(optionalString(layout.display, "element.layout.display", 64) ? { display: optionalString(layout.display, "element.layout.display", 64) } : {}),
      ...(optionalString(layout.position, "element.layout.position", 64) ? { position: optionalString(layout.position, "element.layout.position", 64) } : {})
    },
    styles: Object.fromEntries(Object.entries(styles).slice(0, 24).flatMap(([name, value]) => {
      const textValue = optionalString(value, `element.styles.${name}`, 256);
      return textValue === undefined ? [] : [[name, textValue]];
    }))
  };
}

function compactSelectionFingerprint(fingerprint) {
  if (fingerprint === undefined || fingerprint === null) return null;
  assertPlainObject(fingerprint, "selectionFingerprint");
  const selector = optionalString(fingerprint.selector, "selectionFingerprint.selector", 1_200);
  const tag = optionalString(fingerprint.tag, "selectionFingerprint.tag", 32);
  const text = optionalString(fingerprint.text, "selectionFingerprint.text", 160);
  return { ...(selector ? { selector } : {}), ...(tag ? { tag: tag.toLowerCase() } : {}), ...(text ? { text } : {}) };
}

export function validateAiRequest(body) {
  assertPlainObject(body, "AI request");
  const prompt = requiredString(body.prompt, "prompt", { min: 1, max: 2_000 });
  const requestId = body.requestId === undefined || body.requestId === null
    ? randomUUID()
    : requiredString(body.requestId, "requestId", { min: 1, max: 128 });
  if (!/^[a-zA-Z0-9._:-]+$/.test(requestId)) throw new AiValidationError("requestId contains unsupported characters.");

  return {
    requestId,
    prompt,
    element: compactElement(body.element),
    tokens: compactTokens(body.tokens),
    selectionFingerprint: compactSelectionFingerprint(body.selectionFingerprint)
  };
}

function validateStyleMap(styles) {
  assertPlainObject(styles, "set_styles.styles", "AI_INVALID_RESPONSE", 502);
  const entries = Object.entries(styles);
  if (!entries.length || entries.length > 20) {
    throw new AiValidationError("set_styles.styles must contain between 1 and 20 values.", "AI_INVALID_RESPONSE", 502);
  }
  const result = {};
  for (const [property, rawValue] of entries) {
    if (!SAFE_STYLE_SET.has(property)) {
      throw new AiValidationError(`set_styles does not support ${property}.`, "AI_INVALID_RESPONSE", 502);
    }
    const value = requiredString(rawValue, `set_styles.${property}`, { min: 1, max: 256, code: "AI_INVALID_RESPONSE", status: 502 });
    if (DANGEROUS_STYLE_VALUE.test(value)) {
      throw new AiValidationError(`set_styles.${property} contains an unsafe value.`, "AI_INVALID_RESPONSE", 502);
    }
    result[property] = value;
  }
  return result;
}

function validateOperation(operation) {
  assertPlainObject(operation, "operation", "AI_INVALID_RESPONSE", 502);
  const type = requiredString(operation.type, "operation.type", { min: 1, max: 64, code: "AI_INVALID_RESPONSE", status: 502 });
  if (type === "update_text") {
    assertNoUnknownKeys(operation, ["type", "text"], "update_text", "AI_INVALID_RESPONSE", 502);
    return { type, text: requiredString(operation.text, "update_text.text", { min: 1, max: 3_000, code: "AI_INVALID_RESPONSE", status: 502 }) };
  }
  if (type === "set_styles") {
    assertNoUnknownKeys(operation, ["type", "styles"], "set_styles", "AI_INVALID_RESPONSE", 502);
    return { type, styles: validateStyleMap(operation.styles) };
  }
  if (type === "hide") {
    assertNoUnknownKeys(operation, ["type"], "hide", "AI_INVALID_RESPONSE", 502);
    return { type };
  }
  if (type === "insert_component") {
    assertNoUnknownKeys(operation, ["type", "component"], "insert_component", "AI_INVALID_RESPONSE", 502);
    const component = requiredString(operation.component, "insert_component.component", { min: 1, max: 64, code: "AI_INVALID_RESPONSE", status: 502 });
    if (!SAFE_COMPONENTS.includes(component)) {
      throw new AiValidationError("insert_component must use an approved tinkr component.", "AI_INVALID_RESPONSE", 502);
    }
    return { type, component };
  }
  throw new AiValidationError(`Unsupported AI operation: ${type}.`, "AI_INVALID_RESPONSE", 502);
}

export function validateAiPatch(value) {
  assertPlainObject(value, "AI response", "AI_INVALID_RESPONSE", 502);
  assertNoUnknownKeys(value, ["summary", "operations"], "AI response", "AI_INVALID_RESPONSE", 502);
  const summary = requiredString(value.summary, "summary", { min: 1, max: 400, code: "AI_INVALID_RESPONSE", status: 502 });
  if (!Array.isArray(value.operations) || !value.operations.length || value.operations.length > 8) {
    throw new AiValidationError("operations must contain between 1 and 8 patches.", "AI_INVALID_RESPONSE", 502);
  }
  const operations = value.operations.map(validateOperation);
  if (operations.filter(operation => operation.type === "insert_component").length > 1) {
    throw new AiValidationError("AI may insert at most one component per preview.", "AI_INVALID_RESPONSE", 502);
  }
  return { summary, operations };
}

export function parsePatchJson(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new AiValidationError("AI returned an empty response.", "AI_INVALID_RESPONSE", 502);
  }
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  try {
    return JSON.parse(fenced ? fenced[1].trim() : trimmed);
  } catch {
    throw new AiValidationError("AI returned invalid JSON.", "AI_INVALID_RESPONSE", 502);
  }
}

export const PATCH_SYSTEM_PROMPT = `You are tinkr's design co-designer. Return only a safe, bounded patch preview for the currently selected element. Never produce JavaScript, event handlers, URLs, form changes, credentials, page actions, selectors, or targets. Operations always apply to the current selection; an inserted component is added once beside that selection.

Only use these operations: update_text, set_styles, hide, insert_component. set_styles may only use safe visual CSS properties. insert_component may only use cta, testimonial, or feature. Use no more than one insert_component operation.

Respond with ONLY valid JSON matching this schema (no markdown, no prose):
${JSON.stringify(patchSchema)}`;

export function publicAiError(error, requestId) {
  if (error instanceof AiValidationError) {
    return { status: error.status, body: { error: error.message, code: error.code, retryable: false, requestId } };
  }
  const name = String(error?.name || "");
  const providerStatus = Number(error?.status);
  if (name === "APIConnectionTimeoutError" || name === "AbortError") {
    return { status: 504, body: { error: "The AI provider timed out. Try again with a shorter request.", code: "AI_TIMEOUT", retryable: true, requestId } };
  }
  if (providerStatus === 401 || providerStatus === 403) {
    return { status: 502, body: { error: "The configured AI provider rejected the server credentials.", code: "AI_PROVIDER_AUTH", retryable: false, requestId } };
  }
  if (providerStatus === 429) {
    return { status: 429, body: { error: "The AI provider is rate-limiting requests. Try again shortly.", code: "AI_RATE_LIMITED", retryable: true, requestId } };
  }
  if (providerStatus >= 400 && providerStatus < 500) {
    return { status: 502, body: { error: "The AI provider rejected this generation request.", code: "AI_PROVIDER_REJECTED", retryable: false, requestId } };
  }
  if (providerStatus >= 500) {
    return { status: 502, body: { error: "The AI provider is temporarily unavailable.", code: "AI_PROVIDER_UNAVAILABLE", retryable: true, requestId } };
  }
  if (name === "APIConnectionError" || /network|fetch/i.test(String(error?.message || ""))) {
    return { status: 503, body: { error: "Could not reach the configured AI provider.", code: "AI_NETWORK_ERROR", retryable: true, requestId } };
  }
  return { status: 502, body: { error: "AI patch generation failed. Try again.", code: "AI_GENERATION_FAILED", retryable: true, requestId } };
}

export function createAiPatchHandler({ OpenAI, env = process.env }) {
  return async (req, res) => {
    let payload;
    try {
      payload = validateAiRequest(req.body);
    } catch (error) {
      const requestId = typeof req.body?.requestId === "string" ? req.body.requestId.slice(0, 128) : undefined;
      const mapped = publicAiError(error, requestId);
      return res.status(mapped.status).json(mapped.body);
    }

    const config = getAiConfig(env);
    if (!config.configured) {
      return res.status(503).json({
        error: "AI is not configured on this tinkr server.",
        code: "AI_NOT_CONFIGURED",
        retryable: false,
        requestId: payload.requestId
      });
    }

    const abortController = new AbortController();
    const abortIfClientLeaves = () => {
      if (!res.writableEnded) abortController.abort();
    };
    req.once("aborted", abortIfClientLeaves);
    res.once("close", abortIfClientLeaves);

    try {
      const client = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        baseURL: config.baseURL,
        maxRetries: 0,
        timeout: config.timeoutMs
      });
      const response = await client.chat.completions.create({
        model: config.model,
        messages: [
          { role: "system", content: PATCH_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ prompt: payload.prompt, element: payload.element, tokens: payload.tokens, selectionFingerprint: payload.selectionFingerprint }) }
        ],
        stream: false
      }, { timeout: config.timeoutMs, signal: abortController.signal });
      const content = response.choices?.[0]?.message?.content;
      const patch = validateAiPatch(parsePatchJson(content));
      if (req.aborted || res.destroyed) return;
      return res.json({
        ...patch,
        requestId: payload.requestId,
        selectionFingerprint: payload.selectionFingerprint,
        patchSchemaVersion: AI_PATCH_SCHEMA_VERSION
      });
    } catch (error) {
      if (req.aborted || res.destroyed) return;
      const mapped = publicAiError(error, payload.requestId);
      return res.status(mapped.status).json(mapped.body);
    } finally {
      req.off("aborted", abortIfClientLeaves);
      res.off("close", abortIfClientLeaves);
    }
  };
}

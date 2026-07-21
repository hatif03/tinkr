import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  AiValidationError,
  createAiPatchHandler,
  getAiCapabilities,
  parsePatchJson,
  publicAiError,
  validateAiPatch,
  validateAiRequest
} from "./ai.js";

const selectedElement = {
  selector: "body > main > section:nth-of-type(1)",
  tag: "section",
  text: "Join the waitlist",
  html: "<section><button>Join the waitlist</button></section>",
  parent: "main",
  layout: { width: 960, height: 420, display: "flex", position: "static" },
  styles: { color: "rgb(255, 255, 255)", backgroundColor: "rgb(0, 0, 0)" }
};

test("accepts a bounded AI request and deliberately omits raw DOM", () => {
  const request = validateAiRequest({
    requestId: "preview-42",
    prompt: "Make this CTA more confident",
    element: selectedElement,
    tokens: { "--tinkr-primary": "#b8ff37" },
    selectionFingerprint: { selector: selectedElement.selector, tag: "section", text: "Join the waitlist" }
  });
  assert.equal(request.requestId, "preview-42");
  assert.equal(request.element.tag, "section");
  assert.equal("html" in request.element, false);
  assert.deepEqual(request.tokens, { "--tinkr-primary": "#b8ff37" });
});

test("validates the only safe operations accepted from a provider", () => {
  const patch = validateAiPatch({
    summary: "Sharper CTA hierarchy.",
    operations: [
      { type: "update_text", text: "Join the early-access list" },
      { type: "set_styles", styles: { backgroundColor: "#b8ff37", borderRadius: "12px" } },
      { type: "insert_component", component: "cta" }
    ]
  });
  assert.equal(patch.operations.length, 3);
});

test("rejects injected styles, arbitrary targets, and repeated component insertion", () => {
  assert.throws(
    () => validateAiPatch({ summary: "Bad", operations: [{ type: "set_styles", styles: { backgroundImage: "url(https://bad.example)" } }] }),
    AiValidationError
  );
  assert.throws(
    () => validateAiPatch({ summary: "Bad", operations: [{ type: "update_text", text: "Hello", selector: "body" }] }),
    AiValidationError
  );
  assert.throws(
    () => validateAiPatch({ summary: "Bad", operations: [{ type: "insert_component", component: "cta" }, { type: "insert_component", component: "feature" }] }),
    AiValidationError
  );
});

test("reports provider state without exposing the API key", () => {
  const capabilities = getAiCapabilities({
    OPENAI_API_KEY: "secret-value",
    OPENAI_BASE_URL: "https://api.k2think.ai/v1",
    OPENAI_MODEL: "MBZUAI-IFM/K2-Think-v2"
  });
  assert.equal(capabilities.configured, true);
  assert.equal(capabilities.provider, "api.k2think.ai");
  assert.equal(JSON.stringify(capabilities).includes("secret-value"), false);
});

test("maps malformed output and provider timeouts to actionable public errors", () => {
  assert.throws(() => parsePatchJson("not json"), AiValidationError);
  const timeout = publicAiError({ name: "APIConnectionTimeoutError" }, "request-1");
  assert.equal(timeout.status, 504);
  assert.equal(timeout.body.code, "AI_TIMEOUT");
  assert.equal(timeout.body.requestId, "request-1");
});

function request(body) {
  const req = new EventEmitter();
  req.body = body;
  req.aborted = false;
  return req;
}

function response() {
  const res = new EventEmitter();
  res.writableEnded = false;
  res.destroyed = false;
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.body = body; res.writableEnded = true; return res; };
  return res;
}

test("the handler returns an atomic validated preview and never forwards raw HTML", async () => {
  let providerRequest;
  class FakeOpenAI {
    constructor() {
      this.chat = { completions: { create: async request => {
        providerRequest = request;
        return { choices: [{ message: { content: JSON.stringify({ summary: "Improve hierarchy", operations: [{ type: "insert_component", component: "cta" }] }) } }] };
      } } };
    }
  }
  const handler = createAiPatchHandler({
    OpenAI: FakeOpenAI,
    env: { OPENAI_API_KEY: "configured", OPENAI_BASE_URL: "https://api.k2think.ai/v1" }
  });
  const req = request({ requestId: "preview-atomic", prompt: "Add a CTA", element: selectedElement });
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, undefined);
  assert.equal(res.body.requestId, "preview-atomic");
  assert.deepEqual(res.body.operations, [{ type: "insert_component", component: "cta" }]);
  assert.equal(providerRequest.messages[1].content.includes(selectedElement.html), false);
});

test("the handler gives an explicit configuration code without a provider call", async () => {
  const handler = createAiPatchHandler({ OpenAI: class {}, env: {} });
  const res = response();
  await handler(request({ prompt: "Add a CTA", element: selectedElement }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "AI_NOT_CONFIGURED");
});

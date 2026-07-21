const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class FakeElement {
  constructor(tagName, { attrs = {}, text = "" } = {}) {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    this.innerText = text;
    this.textContent = text;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }
}

class FakeDocument {
  constructor(elements, selectors = {}) {
    this.elements = elements;
    this.selectors = selectors;
  }

  querySelectorAll(selector) {
    if (Object.prototype.hasOwnProperty.call(this.selectors, selector)) return this.selectors[selector];
    return this.getElementsByTagName(selector);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getElementsByTagName(tag) {
    return this.elements.filter(element => element.tagName.toLowerCase() === String(tag).toLowerCase());
  }
}

function canvasFor(documentRef) {
  const source = fs.readFileSync(path.join(__dirname, "patch-applicator.js"), "utf8");
  const context = { window: {}, document: documentRef, CSS: { escape: value => value } };
  vm.runInNewContext(source, context, { filename: "patch-applicator.js" });
  return context.window.TinkrCanvas;
}

function ctaFingerprint() {
  return {
    tag: "button",
    stable: [["data-testid", "hero-cta"]],
    text: "Join the waitlist"
  };
}

test("a selector is rejected when its fingerprint no longer matches, then resolves a unique bounded fallback", () => {
  const staleSelectorTarget = new FakeElement("button", { attrs: { "data-testid": "hero-cta" }, text: "Cancel" });
  const intendedTarget = new FakeElement("button", { attrs: { "data-testid": "hero-cta" }, text: "Join the waitlist" });
  const documentRef = new FakeDocument([staleSelectorTarget, intendedTarget], { "#hero-action": [staleSelectorTarget] });
  const canvas = canvasFor(documentRef);

  const resolved = canvas.resolvePatchTarget({ selector: "#hero-action", target: ctaFingerprint() }, documentRef);

  assert.equal(resolved, intendedTarget);
  assert.equal(documentRef.__tinkrPatchResolution.status, "fallback");
});

test("ambiguous fallback candidates never receive a patch", () => {
  const first = new FakeElement("button", { attrs: { "data-testid": "hero-cta" }, text: "Join the waitlist" });
  const second = new FakeElement("button", { attrs: { "data-testid": "hero-cta" }, text: "Join the waitlist" });
  const staleSelectorTarget = new FakeElement("button", { attrs: { "data-testid": "cancel" }, text: "Cancel" });
  const documentRef = new FakeDocument([staleSelectorTarget, first, second], { "#hero-action": [staleSelectorTarget] });
  const canvas = canvasFor(documentRef);

  const resolved = canvas.resolvePatchTarget({ selector: "#hero-action", target: ctaFingerprint() }, documentRef);

  assert.equal(resolved, null);
  assert.equal(documentRef.__tinkrPatchResolution.status, "ambiguous");
});

test("text patches retain a stable selector replay path while still validating tag and stable attributes", () => {
  const original = new FakeElement("button", { attrs: { "data-testid": "hero-cta" }, text: "Get started" });
  const documentRef = new FakeDocument([original], { "#hero-action": [original] });
  const canvas = canvasFor(documentRef);

  const resolved = canvas.resolvePatchTarget({
    type: "update_text",
    selector: "#hero-action",
    // Anchors are captured after editing, so this is intentionally the desired
    // text rather than the page's pre-edit copy.
    target: ctaFingerprint()
  }, documentRef);

  assert.equal(resolved, original);
  assert.equal(documentRef.__tinkrPatchResolution.status, "exact");
});

test("fallback search remains bounded instead of guessing from a large repeated DOM", () => {
  const manyCandidates = Array.from({ length: 241 }, () => new FakeElement("button", {
    attrs: { "data-testid": "hero-cta" },
    text: "Join the waitlist"
  }));
  const documentRef = new FakeDocument(manyCandidates, { "#missing": [] });
  const canvas = canvasFor(documentRef);

  const resolved = canvas.resolvePatchTarget({ selector: "#missing", target: ctaFingerprint() }, documentRef);

  assert.equal(resolved, null);
  assert.equal(documentRef.__tinkrPatchResolution.status, "ambiguous");
  assert.equal(documentRef.__tinkrPatchResolution.truncated, true);
});

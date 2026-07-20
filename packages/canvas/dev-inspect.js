(() => {
  function rgbToHex(value) {
    const m = value?.match(/\d+/g);
    return m?.length >= 3 ? `#${m.slice(0, 3).map(n => Number(n).toString(16).padStart(2, "0")).join("")}` : "#000000";
  }

  function buildDevSpec(el, selectorFor, originalStyle = "") {
    if (!el) return null;
    const computed = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const css = {};
    ["display", "position", "color", "backgroundColor", "fontSize", "fontWeight", "lineHeight", "padding", "margin", "borderRadius", "width", "height", "gap", "flexDirection", "gridTemplateColumns"].forEach(k => {
      css[k] = computed[k];
    });
    const cssText = Object.entries(css).map(([k, v]) => `  ${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}: ${v};`).join("\n");
    return {
      selector: selectorFor(el),
      tag: el.tagName.toLowerCase(),
      box: {
        x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height),
        padding: { t: computed.paddingTop, r: computed.paddingRight, b: computed.paddingBottom, l: computed.paddingLeft },
        margin: { t: computed.marginTop, r: computed.marginRight, b: computed.marginBottom, l: computed.marginLeft }
      },
      css,
      cssText,
      tokens: {
        color: rgbToHex(computed.color),
        backgroundColor: rgbToHex(computed.backgroundColor)
      },
      tailwind: `w-[${Math.round(rect.width)}px] h-[${Math.round(rect.height)}px]`,
      a11y: {
        role: el.getAttribute("role") || null,
        alt: el.getAttribute("alt") || null,
        ariaLabel: el.getAttribute("aria-label") || null
      },
      diff: { before: originalStyle || "(none)", after: el.getAttribute("style") || "(none)" },
      reactSnippet: `<${el.tagName.toLowerCase()} style={{ width: ${Math.round(rect.width)}, height: ${Math.round(rect.height)} }} />`
    };
  }

  function formatDevSpec(spec) {
    if (!spec) return "Select an element for Dev Mode specs.";
    if (typeof spec === "string") return spec;
    return [
      `Selector: ${spec.selector}`,
      `Tag: ${spec.tag}`,
      `\nBox: ${spec.box.width} × ${spec.box.height} @ (${spec.box.x}, ${spec.box.y})`,
      `\nComputed CSS:\n${spec.cssText}`,
      `\nTailwind-ish: ${spec.tailwind}`,
      `\nInline diff:\n- ${spec.diff.before}\n+ ${spec.diff.after}`,
      `\nA11y: role=${spec.a11y.role || "—"}, alt=${spec.a11y.alt || "—"}`
    ].join("\n");
  }

  window.TinkrCanvas = window.TinkrCanvas || {};
  window.TinkrCanvas.buildDevSpec = buildDevSpec;
  window.TinkrCanvas.formatDevSpec = formatDevSpec;
})();

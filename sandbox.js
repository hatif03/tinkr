const allowed = new Set(["set_styles", "update_text", "insert_component", "hide"]);
window.addEventListener("message", event => {
  if (event.data?.type !== "TINKR_RUN_LAB") return;
  const output = [], run = { setStyles: styles => output.push({ type: "set_styles", styles }), setText: text => output.push({ type: "update_text", text: String(text) }), insert: component => output.push({ type: "insert_component", component }), hide: () => output.push({ type: "hide" }), token: name => event.data.context?.tokens?.[name] };
  try {
    const execute = new Function("tinkr", "context", "params", `"use strict"; const fetch=undefined, XMLHttpRequest=undefined, WebSocket=undefined, chrome=undefined; ${event.data.code}`);
    execute(Object.freeze(run), Object.freeze(event.data.context || {}), Object.freeze(event.data.params || {}));
    const operations = output.filter(op => allowed.has(op.type));
    event.source.postMessage({ type: "TINKR_LAB_RESULT", requestId: event.data.requestId, operations }, "*");
  } catch (error) { event.source.postMessage({ type: "TINKR_LAB_RESULT", requestId: event.data.requestId, error: error.message }, "*"); }
});

(() => {
  const uid = () => crypto.randomUUID();

  function ink(name, fallback) {
    const root = document.getElementById("tinkr-root");
    if (!root) return fallback;
    const v = getComputedStyle(root).getPropertyValue(name).trim();
    return v || fallback;
  }

  function defaultStroke() { return ink("--tk-ink-vector", "#a8b4ff"); }
  function defaultFill() { return "rgba(168,180,255,0.15)"; }

  function starPoints(cx, cy, outerR, innerR, points = 5) {
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (Math.PI / points) * i - Math.PI / 2;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }

  function polygonPoints(cx, cy, r, sides = 6) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = (2 * Math.PI / sides) * i - Math.PI / 2;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }

  function pointsToD(points, closed = true) {
    if (!points.length) return "";
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length; i++) d += ` L ${points[i][0]} ${points[i][1]}`;
    if (closed) d += " Z";
    return d;
  }

  function bezierToD(nodes, closed = false) {
    if (!nodes.length) return "";
    let d = `M ${nodes[0].x} ${nodes[0].y}`;
    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const cur = nodes[i];
      const cpx = prev.cp2x ?? prev.x;
      const cpy = prev.cp2y ?? prev.y;
      const cpx2 = cur.cp1x ?? cur.x;
      const cpy2 = cur.cp1y ?? cur.y;
      d += ` C ${cpx} ${cpy}, ${cpx2} ${cpy2}, ${cur.x} ${cur.y}`;
    }
    if (closed && nodes.length > 2) d += " Z";
    return d;
  }

  function simplifyPencil(points, tolerance = 2) {
    return window.TinkrCanvas?.smoothPolyline
      ? window.TinkrCanvas.smoothPolyline(points.map(([x, y]) => ({ x, y })), tolerance).map(p => [p.x, p.y])
      : points;
  }

  function createShape(type, x, y, w, h, opts = {}) {
    const fill = opts.fill || defaultFill();
    const stroke = opts.stroke || defaultStroke();
    const id = uid();
    let d = "";
    let points = null;
    const cx = x + w / 2, cy = y + h / 2;
    if (type === "rect") return { id, type, x, y, w, h, fill, stroke, d: null };
    if (type === "ellipse") {
      d = `M ${cx - w / 2} ${cy} A ${w / 2} ${h / 2} 0 1 0 ${cx + w / 2} ${cy} A ${w / 2} ${h / 2} 0 1 0 ${cx - w / 2} ${cy}`;
      return { id, type, x, y, w, h, fill, stroke, d };
    }
    if (type === "line") {
      points = [[x, y], [x + w, y + h]];
      return { id, type, x, y, w, h, fill: "none", stroke, d: pointsToD(points, false), points };
    }
    if (type === "arrow") {
      const x2 = x + w, y2 = y + h;
      const angle = Math.atan2(y2 - y, x2 - x);
      const head = 12;
      points = [[x, y], [x2, y2], [x2 - head * Math.cos(angle - 0.4), y2 - head * Math.sin(angle - 0.4)], [x2, y2], [x2 - head * Math.cos(angle + 0.4), y2 - head * Math.sin(angle + 0.4)]];
      return { id, type, x, y, w, h, fill: "none", stroke, d: pointsToD([[x, y], [x2, y2]], false), points, arrow: true };
    }
    if (type === "polygon") {
      points = polygonPoints(cx, cy, Math.min(w, h) / 2, 6);
      return { id, type, x, y, w, h, fill, stroke, d: pointsToD(points), points };
    }
    if (type === "star") {
      points = starPoints(cx, cy, Math.min(w, h) / 2, Math.min(w, h) / 4);
      return { id, type, x, y, w, h, fill, stroke, d: pointsToD(points), points };
    }
    if (type === "image") {
      return { id, type: "image", x, y, w, h, fill: "none", stroke, href: opts.href || "", d: null };
    }
    return { id, type: "rect", x, y, w, h, fill, stroke };
  }

  function renderLayer(layer) {
    const sw = ink("--tk-stroke-width-pencil", "2");
    const cap = 'stroke-linecap="round" stroke-linejoin="round"';
    if (layer.type === "rect") {
      return `<rect data-vector-id="${layer.id}" x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}" fill="${layer.fill}" stroke="${layer.stroke}" stroke-width="${sw}" ${cap}/>`;
    }
    if (layer.type === "image" && layer.href) {
      return `<image data-vector-id="${layer.id}" href="${layer.href}" x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}"/>`;
    }
    if (layer.type === "textPath" && layer.d) {
      return `<path data-vector-id="${layer.id}" id="path-${layer.id}" d="${layer.d}" fill="none" stroke="${layer.stroke || defaultStroke()}" stroke-width="1" opacity="0.3"/>
        <text data-vector-id="${layer.id}" fill="${layer.fill || ink('--tk-text', '#f6f7fa')}" font-size="${layer.fontSize || 14}" font-family="Inter, sans-serif">
          <textPath href="#path-${layer.id}" startOffset="0">${layer.text || "Text on path"}</textPath>
        </text>`;
    }
    if (layer.d) {
      return `<path data-vector-id="${layer.id}" d="${layer.d}" fill="${layer.fill || "none"}" stroke="${layer.stroke}" stroke-width="${sw}" ${cap}/>`;
    }
    return "";
  }

  function hitTestNode(nodes, px, py, radius = 8) {
    if (!nodes?.length) return -1;
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (Math.hypot(nodes[i].x - px, nodes[i].y - py) <= radius) return i;
    }
    return -1;
  }

  function moveNode(nodes, index, x, y) {
    if (index < 0 || !nodes[index]) return nodes;
    const n = nodes[index];
    const dx = x - n.x, dy = y - n.y;
    n.x = x; n.y = y;
    if (n.cp1x != null) { n.cp1x += dx; n.cp1y += dy; }
    if (n.cp2x != null) { n.cp2x += dx; n.cp2y += dy; }
    return nodes;
  }

  function deleteNode(nodes, index) {
    if (index < 0) return nodes;
    return nodes.filter((_, i) => i !== index);
  }

  function hitTest(layer, px, py) {
    if (layer.type === "rect" || layer.type === "image") {
      return px >= layer.x && px <= layer.x + layer.w && py >= layer.y && py <= layer.y + layer.h;
    }
    if (layer.points?.length) {
      const xs = layer.points.map(p => p[0]), ys = layer.points.map(p => p[1]);
      return px >= Math.min(...xs) - 8 && px <= Math.max(...xs) + 8 && py >= Math.min(...ys) - 8 && py <= Math.max(...ys) + 8;
    }
    return px >= layer.x && px <= layer.x + (layer.w || 0) && py >= layer.y && py <= layer.y + (layer.h || 0);
  }

  function booleanUnion(a, b) {
    if (!a || !b) return a || b;
    return { ...a, id: uid(), type: "path", d: `${a.d || pointsToD(a.points || [])} ${b.d || pointsToD(b.points || [])}`, fill: a.fill, stroke: a.stroke };
  }

  window.TinkrCanvas = window.TinkrCanvas || {};
  Object.assign(window.TinkrCanvas, {
    uid, createShape, renderLayer, hitTest, bezierToD, pointsToD, simplifyPencil, booleanUnion,
    starPoints, polygonPoints, hitTestNode, moveNode, deleteNode, defaultStroke, defaultFill
  });
})();

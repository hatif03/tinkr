(() => {
  const uid = () => crypto.randomUUID();

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
    if (points.length <= 2) return points;
    const out = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const [x0, y0] = out[out.length - 1];
      const [x1, y1] = points[i];
      if (Math.hypot(x1 - x0, y1 - y0) >= tolerance) out.push(points[i]);
    }
    out.push(points[points.length - 1]);
    return out;
  }

  function createShape(type, x, y, w, h, opts = {}) {
    const fill = opts.fill || "rgba(124,233,255,0.2)";
    const stroke = opts.stroke || "#7ce9ff";
    const id = uid();
    let d = "";
    let points = null;
    const cx = x + w / 2, cy = y + h / 2;
    if (type === "rect") {
      return { id, type, x, y, w, h, fill, stroke, d: null };
    }
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
    return { id, type: "rect", x, y, w, h, fill, stroke };
  }

  function renderLayer(layer) {
    if (layer.type === "rect") {
      return `<rect data-vector-id="${layer.id}" x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}" fill="${layer.fill}" stroke="${layer.stroke}" stroke-width="2"/>`;
    }
    if (layer.d) {
      return `<path data-vector-id="${layer.id}" d="${layer.d}" fill="${layer.fill || "none"}" stroke="${layer.stroke}" stroke-width="2"/>`;
    }
    return "";
  }

  function hitTest(layer, px, py) {
    if (layer.type === "rect") {
      return px >= layer.x && px <= layer.x + layer.w && py >= layer.y && py <= layer.y + layer.h;
    }
    if (layer.points?.length) {
      const xs = layer.points.map(p => p[0]), ys = layer.points.map(p => p[1]);
      const minX = Math.min(...xs) - 8, maxX = Math.max(...xs) + 8;
      const minY = Math.min(...ys) - 8, maxY = Math.max(...ys) + 8;
      return px >= minX && px <= maxX && py >= minY && py <= maxY;
    }
    return px >= layer.x && px <= layer.x + (layer.w || 0) && py >= layer.y && py <= layer.y + (layer.h || 0);
  }

  function booleanUnion(a, b) {
    if (!a || !b) return a || b;
    const merged = { ...a, id: uid(), type: "path", d: `${a.d || pointsToD(a.points || [])} ${b.d || pointsToD(b.points || [])}`, fill: a.fill, stroke: a.stroke };
    return merged;
  }

  window.TinkrCanvas = window.TinkrCanvas || {};
  Object.assign(window.TinkrCanvas, {
    uid, createShape, renderLayer, hitTest, bezierToD, pointsToD, simplifyPencil, booleanUnion, starPoints, polygonPoints
  });
})();

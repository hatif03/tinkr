(() => {
  const DIST_PENCIL = 3.5;
  const DIST_PEN = 0;

  function ink(name, fallback) {
    const root = document.getElementById("tinkr-root");
    if (!root) return fallback;
    const v = getComputedStyle(root).getPropertyValue(name).trim();
    return v || fallback;
  }

  function dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function perpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    if (dx === 0 && dy === 0) return dist(point, lineStart);
    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy);
    const proj = { x: lineStart.x + t * dx, y: lineStart.y + t * dy };
    return dist(point, proj);
  }

  function smoothPolyline(points, tolerance = 2.5) {
    if (points.length <= 2) return points.slice();
    let maxDist = 0;
    let index = 0;
    const end = points.length - 1;
    for (let i = 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[0], points[end]);
      if (d > maxDist) { maxDist = d; index = i; }
    }
    if (maxDist > tolerance) {
      const left = smoothPolyline(points.slice(0, index + 1), tolerance);
      const right = smoothPolyline(points.slice(index), tolerance);
      return left.slice(0, -1).concat(right);
    }
    return [points[0], points[end]];
  }

  function polylineToSmoothPath(points) {
    if (points.length < 2) return "";
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  }

  function createStrokeSession(mode) {
    return {
      mode,
      points: [],
      minDist: mode === "pencil" ? DIST_PENCIL : DIST_PEN,
      raf: null,
      pending: null
    };
  }

  function addPoint(session, x, y) {
    const pt = { x, y };
    if (!session.points.length) {
      session.points.push(pt);
      return true;
    }
    const last = session.points[session.points.length - 1];
    if (dist(last, pt) >= session.minDist) {
      session.points.push(pt);
      return true;
    }
    return false;
  }

  function schedulePoint(session, x, y, onUpdate) {
    session.pending = { x, y };
    if (session.raf) return;
    session.raf = requestAnimationFrame(() => {
      session.raf = null;
      if (session.pending) {
        const changed = addPoint(session, session.pending.x, session.pending.y);
        session.pending = null;
        if (changed) onUpdate?.();
      }
    });
  }

  function finishStroke(session) {
    if (session.raf) cancelAnimationFrame(session.raf);
    session.raf = null;
    if (session.pending) {
      addPoint(session, session.pending.x, session.pending.y);
      session.pending = null;
    }
    const simplified = smoothPolyline(session.points, session.mode === "pencil" ? 2.5 : 1);
    const d = polylineToSmoothPath(simplified);
    return { d, points: simplified, mode: session.mode };
  }

  function renderStrokePreview(session) {
    if (!session?.points?.length) return "";
    const stroke = session.mode === "pencil"
      ? ink("--tk-ink-pencil", "#9aa4b8")
      : ink("--tk-ink-pen", "#76e7ff");
    const width = session.mode === "pencil"
      ? ink("--tk-stroke-width-pencil", "2")
      : ink("--tk-stroke-width-pen", "1.5");
    const pts = session.points.slice();
    if (session.pending) pts.push(session.pending);
    const d = pts.length >= 3 ? polylineToSmoothPath(pts) : pts.length === 2
      ? `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`
      : pts.length === 1 ? `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 0.01} ${pts[0].y}` : "";
    if (!d) return "";
    return `<path class="tinkr-stroke-preview" d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  function renderPenPreview(nodes, activeIndex = -1) {
    if (!nodes?.length) return "";
    const pen = ink("--tk-ink-pen", "#76e7ff");
    const anchor = ink("--tk-ink-pen-anchor", "#c9ff46");
    const width = ink("--tk-stroke-width-pen", "1.5");
    let html = "";
    const TC = window.TinkrCanvas;
    if (nodes.length > 1 && TC?.bezierToD) {
      html += `<path d="${TC.bezierToD(nodes)}" fill="none" stroke="${pen}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 4"/>`;
    }
    nodes.forEach((n, i) => {
      if (n.cp1x != null && n.cp1y != null) {
        html += `<line x1="${n.x}" y1="${n.y}" x2="${n.cp1x}" y2="${n.cp1y}" stroke="${pen}" stroke-width="1" opacity="0.6"/>`;
        html += `<circle cx="${n.cp1x}" cy="${n.cp1y}" r="3" fill="${pen}" opacity="0.8"/>`;
      }
      if (n.cp2x != null && n.cp2y != null) {
        html += `<line x1="${n.x}" y1="${n.y}" x2="${n.cp2x}" y2="${n.cp2y}" stroke="${pen}" stroke-width="1" opacity="0.6"/>`;
        html += `<circle cx="${n.cp2x}" cy="${n.cp2y}" r="3" fill="${pen}" opacity="0.8"/>`;
      }
      html += `<circle cx="${n.x}" cy="${n.y}" r="4" fill="${i === 0 ? anchor : pen}" stroke="#101116" stroke-width="1"/>`;
    });
    if (activeIndex >= 0 && nodes[activeIndex]) {
      const n = nodes[activeIndex];
      html += `<circle cx="${n.x}" cy="${n.y}" r="6" fill="none" stroke="${anchor}" stroke-width="2"/>`;
    }
    return html;
  }

  window.TinkrCanvas = window.TinkrCanvas || {};
  Object.assign(window.TinkrCanvas, {
    createStrokeSession, addPoint, schedulePoint, finishStroke,
    smoothPolyline, polylineToSmoothPath, renderStrokePreview, renderPenPreview, strokeInk: ink
  });
})();

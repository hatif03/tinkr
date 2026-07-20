(() => {
  const DIST_PENCIL = 2;
  const DIST_PEN = 0;
  const TENSION = 8;

  function ink(name, fallback) {
    const root = document.getElementById("tinkr-root");
    if (!root) return fallback;
    const v = getComputedStyle(root).getPropertyValue(name).trim();
    return v || fallback;
  }

  function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }

  function polylineToLinePath(points) {
    if (!points.length) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) d += ` L ${points[i].x} ${points[i].y}`;
    return d;
  }

  function chaikinOnce(points) {
    if (points.length < 3) return points.slice();
    const out = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i], p1 = points[i + 1];
      out.push({ x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 });
      out.push({ x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 });
    }
    out.push(points[points.length - 1]);
    return out;
  }

  function polylineToSmoothPath(points, tension = TENSION) {
    if (points.length < 2) return "";
    if (points.length === 2) return polylineToLinePath(points);
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / tension;
      const cp1y = p1.y + (p2.y - p0.y) / tension;
      const cp2x = p2.x - (p3.x - p1.x) / tension;
      const cp2y = p2.y - (p3.y - p1.y) / tension;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  }

  function strokeLength(points) {
    let len = 0;
    for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
    return len;
  }

  function createStrokeSession(mode) {
    return { mode, points: [], minDist: mode === "pencil" ? DIST_PENCIL : DIST_PEN, raf: null, pending: null, shiftAxis: null };
  }

  function addPoint(session, x, y) {
    const pt = { x, y };
    if (!session.points.length) { session.points.push(pt); return true; }
    const last = session.points[session.points.length - 1];
    if (dist(last, pt) >= session.minDist) { session.points.push(pt); return true; }
    return false;
  }

  function constrainShift(last, x, y) {
    const dx = x - last.x, dy = y - last.y;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return { x, y };
    if (Math.abs(dx) >= Math.abs(dy)) return { x, y: last.y };
    return { x: last.x, y };
  }

  function schedulePoint(session, x, y, onUpdate, opts = {}) {
    let px = x, py = y;
    if (opts.shiftKey && session.points.length) {
      const last = session.points[session.points.length - 1];
      ({ x: px, y: py } = constrainShift(last, x, y));
    }
    session.pending = { x: px, y: py };
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

  function finishStroke(session, opts = {}) {
    if (session.raf) cancelAnimationFrame(session.raf);
    session.raf = null;
    if (session.pending) {
      addPoint(session, session.pending.x, session.pending.y);
      session.pending = null;
    }
    const raw = session.points.slice();
    if (raw.length < 2) return { d: "", points: raw, mode: session.mode };
    const len = strokeLength(raw);
    const highFidelity = opts.fidelity === "high" || raw.length < 30 || len < 120;
    if (highFidelity) {
      return { d: polylineToLinePath(raw), points: raw, mode: session.mode };
    }
    const softened = chaikinOnce(raw);
    return { d: polylineToSmoothPath(softened, TENSION), points: softened, mode: session.mode };
  }

  function renderStrokePreview(session) {
    if (!session?.points?.length) return "";
    const stroke = session.mode === "pencil" ? ink("--tk-ink-pencil", "#9aa4b8") : ink("--tk-ink-pen", "#76e7ff");
    const width = session.mode === "pencil" ? ink("--tk-stroke-width-pencil", "2") : ink("--tk-stroke-width-pen", "1.5");
    const pts = session.points.slice();
    if (session.pending) pts.push(session.pending);
    const d = polylineToLinePath(pts);
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
    polylineToLinePath, polylineToSmoothPath, renderStrokePreview, renderPenPreview, strokeInk: ink
  });
})();

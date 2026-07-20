(() => {
  const svg = (paths, label) =>
    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><title>${label}</title>${paths}</svg>`;

  const ICONS = {
    move: svg('<path d="m4 4 4 4-4 4M20 4l-4 4 4 4"/>', "Move"),
    frame: svg('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>', "Frame"),
    shape: svg('<rect x="5" y="5" width="14" height="14" rx="1"/>', "Shape"),
    line: svg('<path d="M5 19 19 5"/>', "Line"),
    arrow: svg('<path d="M5 12h12M13 6l6 6-6 6"/>', "Arrow"),
    ellipse: svg('<ellipse cx="12" cy="12" rx="8" ry="6"/>', "Ellipse"),
    polygon: svg('<path d="m12 3 7 4v10l-7 4-7-4V7l7-4Z"/>', "Polygon"),
    star: svg('<path d="m12 3 2.5 7.5H3l6 4.5-2.5 7.5L12 17l5.5 5.5L15 15l6-4.5h-7.5L12 3Z"/>', "Star"),
    section: svg('<path d="M4 6h16M4 12h16M4 18h10"/>', "Section"),
    textPath: svg('<path d="M4 16c4-6 8 6 16 0"/><path d="M5 5h14M12 5v14"/>', "Text on path"),
    pen: svg('<path d="m4 20 4-.8L19 8l-3-3L5 16l-1 4Z"/><path d="m14.5 6.5 3 3"/>', "Pen"),
    pencil: svg('<path d="M14 4l6 6-10 10H4v-6L14 4Z"/><path d="m13 5 6 6"/>', "Pencil"),
    text: svg('<path d="M5 5h14M12 5v14M8 19h8"/>', "Text"),
    hand: svg('<path d="M8 11V5a1.5 1.5 0 0 1 3 0v5V3.5a1.5 1.5 0 0 1 3 0V10V5a1.5 1.5 0 0 1 3 0v6l1-1a1.6 1.6 0 0 1 2.3 2.3l-3.7 4A5 5 0 0 1 13 18H11a5 5 0 0 1-5-5v-2a1.5 1.5 0 0 1 2 0Z"/>', "Hand"),
    comment: svg('<path d="M5 5h14v10H9l-4 4V5Z"/>', "Comment"),
    present: svg('<path d="m9 6 9 6-9 6V6Z" fill="currentColor" stroke="none"/>', "Present"),
    motion: svg('<path d="M3 12h14"/><path d="M12 8v8"/><path d="m10 10 2-2 2 2-2 2-2-2Z" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>', "Motion"),
    devMode: svg('<path d="M8 8 4 12l4 4M16 8l4 4-4 4"/><path d="M14 4 10 20"/>', "Dev Mode"),
    resource: svg('<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/>', "Resources"),
    eyedropper: svg('<path d="m4 20 4-4"/><path d="m14 4 6 6"/><path d="m6 14 4 4"/><path d="M17 3l4 4-2 2-4-4 2-2Z"/>', "Eyedropper"),
    image: svg('<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m4 16 5-5 4 4 3-3 4 4"/>', "Image"),
    scale: svg('<path d="M4 14V4h10"/><path d="M14 4l6 6"/><path d="M10 10l10 10"/>', "Scale"),
    slice: svg('<path d="M4 4v16M20 4v16"/><path d="M4 12h16"/>', "Slice"),
    play: svg('<path d="m9 6 9 6-9 6V6Z"/>', "Play"),
    vectorMove: svg('<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 5v3M12 16v3M5 12h3M16 12h3"/>', "Move point"),
    vectorBend: svg('<path d="M4 16c4-8 8 8 16-4"/><circle cx="4" cy="16" r="2" fill="currentColor"/><circle cx="20" cy="12" r="2" fill="currentColor"/>', "Bend"),
    vectorClose: svg('<path d="M4 12a8 8 0 1 0 8-8"/><path d="m4 4 4 4-4 4"/>', "Close path"),
    vectorDelete: svg('<path d="M5 5l14 14M19 5 5 19"/>', "Delete point")
  };

  window.TinkrCanvas = window.TinkrCanvas || {};
  Object.assign(window.TinkrCanvas, { ICONS });
})();

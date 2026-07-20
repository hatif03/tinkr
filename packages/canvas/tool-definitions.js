(() => {
  const svg = (paths, label) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><title>${label}</title>${paths}</svg>`;
  const ICONS = {
    move: svg('<path d="m12 3 2 2-1 1h3v3l1-1 2 2-2 2-1-1v3h-3l1 1-2 2-2-2 1-1H8v-3l-1 1-2-2 2-2 1 1V6h3l-1-1 2-2Z"/>', 'Move'),
    frame: svg('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>', 'Frame'),
    shape: svg('<rect x="5" y="5" width="14" height="14" rx="1"/>', 'Shape'),
    pen: svg('<path d="m4 20 4-.8L19 8l-3-3L5 16l-1 4Z"/><path d="m14.5 6.5 3 3"/>', 'Pen'),
    text: svg('<path d="M5 5h14M12 5v14M8 19h8"/>', 'Text'),
    hand: svg('<path d="M8 11V5a1.5 1.5 0 0 1 3 0v5V3.5a1.5 1.5 0 0 1 3 0V10V5a1.5 1.5 0 0 1 3 0v6l1-1a1.6 1.6 0 0 1 2.3 2.3l-3.7 4A5 5 0 0 1 13 18H11a5 5 0 0 1-5-5v-2a1.5 1.5 0 0 1 2 0Z"/>', 'Hand'),
    comment: svg('<path d="M5 5h14v10H9l-4 4V5Z"/>', 'Comment'),
    play: svg('<path d="m9 6 9 6-9 6V6Z"/>', 'Present'),
    motion: svg('<path d="M4 16c3-9 6 9 10 0 2-4 3-4 6-4"/>', 'Motion'),
    resource: svg('<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/>', 'Resources')
  };
  const TOOL_GROUPS = {
    move: { label: 'Move', icon: ICONS.move, variants: [{ id: 'select', label: 'Move', shortcut: 'V' }, { id: 'hand', label: 'Hand tool', shortcut: 'H' }, { id: 'scale', label: 'Scale', shortcut: 'K' }] },
    region: { label: 'Region', icon: ICONS.frame, variants: [{ id: 'frame', label: 'Frame', shortcut: 'F' }, { id: 'section', label: 'Section', shortcut: 'Shift+S' }, { id: 'slice', label: 'Slice', shortcut: 'S' }] },
    shape: { label: 'Shape', icon: ICONS.shape, variants: [{ id: 'rect', label: 'Rectangle', shortcut: 'R' }, { id: 'line', label: 'Line', shortcut: 'L' }, { id: 'arrow', label: 'Arrow', shortcut: 'Shift+L' }, { id: 'ellipse', label: 'Ellipse', shortcut: 'O' }, { id: 'polygon', label: 'Polygon', shortcut: '' }, { id: 'star', label: 'Star', shortcut: '' }] },
    draw: { label: 'Draw', icon: ICONS.pen, variants: [{ id: 'pen', label: 'Pen', shortcut: 'P' }, { id: 'pencil', label: 'Pencil', shortcut: 'Shift+P' }] },
    text: { label: 'Text', icon: ICONS.text, variants: [{ id: 'text', label: 'Text', shortcut: 'T' }, { id: 'textPath', label: 'Text on path', shortcut: '' }] }
  };
  const SHORTCUTS = {};
  Object.entries(TOOL_GROUPS).forEach(([group, g]) => g.variants.forEach(v => { if (v.shortcut) SHORTCUTS[v.shortcut.toLowerCase()] = { group, variant: v.id }; }));
  window.TinkrCanvas = window.TinkrCanvas || {};
  Object.assign(window.TinkrCanvas, { TOOL_GROUPS, SHORTCUTS, ICONS });
})();

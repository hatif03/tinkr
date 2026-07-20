export const TINKR_APP_URL = process.env.NEXT_PUBLIC_TINKR_APP_URL || process.env.TINKR_APP_URL || "http://localhost:3000";
export const TINKR_API_URL = process.env.NEXT_PUBLIC_TINKR_API_URL || process.env.TINKR_API_URL || "http://localhost:8787";

export const CURSOR_COLORS = ["#b8ff37", "#7ce9ff", "#ff9da2", "#c4a1ff", "#ffb347", "#6ee7b7"];

export const DEFAULT_TOKENS = {
  "--tinkr-primary": "#b8ff37",
  "--tinkr-surface": "#13151c",
  "--tinkr-text": "#f7f7fa",
  "--tinkr-muted": "#9d9da7",
  "--tinkr-radius": "12px",
  "--tinkr-gap": "16px"
};

export const COMPONENT_LIBRARY = {
  cta: { label: "CTA block", category: "marketing" },
  testimonial: { label: "Testimonial", category: "marketing" },
  feature: { label: "Feature card", category: "marketing" },
  wireframe: { label: "Wireframe frame", category: "layout" },
  section: { label: "Section marker", category: "layout" },
  hero: { label: "Hero block", category: "marketing" },
  nav: { label: "Nav bar", category: "layout" },
  card: { label: "Card", category: "components" }
};

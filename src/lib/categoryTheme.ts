interface Theme {
  from: string;
  to: string;
}

export const categoryTheme: Record<string, Theme> = {
  "seat-covers": { from: "#3a2418", to: "#6b4128" },
  "floor-mats": { from: "#14332a", to: "#1f5c46" },
  "car-care": { from: "#0d3b42", to: "#1a6b74" },
  "audio-dashcams": { from: "#241b42", to: "#4a2f7a" },
  "gps-security": { from: "#12283a", to: "#23507a" },
  fragrances: { from: "#3a2030", to: "#6b3655" },
  "bike-guards": { from: "#22262b", to: "#3f464e" },
  "bike-covers": { from: "#16233a", to: "#28406b" },
  "workshop-essentials": { from: "#3a1710", to: "#7a2a15" },
  comfort: { from: "#332417", to: "#5c422a" },
};

export function getCategoryTheme(slug: string): Theme {
  return categoryTheme[slug] ?? { from: "#181d21", to: "#334750" };
}

export function categoryGradient(slug: string) {
  const t = getCategoryTheme(slug);
  return `linear-gradient(135deg, ${t.from}, ${t.to})`;
}

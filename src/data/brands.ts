import type { Brand } from "./types";

export const brands: Brand[] = [
  { slug: "4n-mats", name: "4N Mats", blurb: "India's widest range of car & bike mats" },
  { slug: "wurth", name: "Würth", blurb: "German-engineered workshop consumables" },
  { slug: "waxpol", name: "Waxpol", blurb: "Car care, polish & detailing" },
  { slug: "dolphin", name: "Dolphin", blurb: "Premium tailored seat covers" },
  { slug: "sony", name: "Sony", blurb: "In-car entertainment & audio" },
  { slug: "jbl", name: "JBL", blurb: "Touchscreen receivers & speakers" },
  { slug: "nakamichi", name: "Nakamichi", blurb: "High-fidelity car audio" },
  { slug: "pricol", name: "Pricol", blurb: "Cameras & driver-assist electronics" },
  { slug: "qubo", name: "Qubo", blurb: "Dashcams & smart car gadgets" },
  { slug: "wheels-eye", name: "Wheels Eye", blurb: "GPS tracking & fleet security" },
  { slug: "godrej", name: "Godrej", blurb: "Aer car fragrance range" },
  { slug: "vedashree", name: "Vedashree", blurb: "Traditional & modern car perfumes" },
  { slug: "pv-max", name: "PV Max", blurb: "Chrome finishing & keychains" },
  { slug: "pathak", name: "Pathak", blurb: "Two-wheeler stands & footrests" },
];

export const brandBySlug = (slug: string) => brands.find((b) => b.slug === slug);

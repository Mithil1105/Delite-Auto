import type { Category } from "./types";

export const categories: Category[] = [
  {
    slug: "seat-covers",
    name: "Seat Covers",
    tagline: "Leatherette & fabric, tailored per model",
    vehicle: "car",
    icon: "Armchair",
  },
  {
    slug: "floor-mats",
    name: "Floor & Boot Mats",
    tagline: "7D/9D fit, waterproof, anti-skid",
    vehicle: "car",
    icon: "Grid2x2",
  },
  {
    slug: "car-care",
    name: "Car Care",
    tagline: "Polishes, shampoos & detailing kits",
    vehicle: "car",
    icon: "SprayCan",
  },
  {
    slug: "audio-dashcams",
    name: "Audio & Dashcams",
    tagline: "Touchscreens, speakers, AHD cameras",
    vehicle: "car",
    icon: "Radio",
  },
  {
    slug: "gps-security",
    name: "GPS & Security",
    tagline: "Live tracking & anti-theft alerts",
    vehicle: "universal",
    icon: "MapPin",
  },
  {
    slug: "fragrances",
    name: "Fragrances",
    tagline: "Cabin scents that actually last",
    vehicle: "car",
    icon: "Wind",
  },
  {
    slug: "bike-guards",
    name: "Guards & Crash Protection",
    tagline: "Fenders, crash bars, footrests",
    vehicle: "bike",
    icon: "ShieldCheck",
  },
  {
    slug: "bike-covers",
    name: "Bike Covers & Locks",
    tagline: "Weatherproof covers, cable locks",
    vehicle: "bike",
    icon: "Lock",
  },
  {
    slug: "workshop-essentials",
    name: "Workshop Essentials",
    tagline: "Wurth tools, pastes & consumables",
    vehicle: "universal",
    icon: "Wrench",
  },
  {
    slug: "comfort",
    name: "Comfort & Ergonomics",
    tagline: "Armrests, cushions, neck rests",
    vehicle: "car",
    icon: "Sofa",
  },
  {
    slug: "helmets",
    name: "Helmets",
    tagline: "Full-face, half-face & modular, ISI marked",
    vehicle: "bike",
    icon: "HardHat",
  },
  {
    slug: "saddlebags",
    name: "Saddlebags",
    tagline: "Tank bags, panniers & tail bags",
    vehicle: "bike",
    icon: "Backpack",
  },
];

export const categoryBySlug = (slug: string) =>
  categories.find((c) => c.slug === slug);

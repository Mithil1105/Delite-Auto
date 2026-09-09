# Delite Auto Homepage — Figma vs. Implementation Gap Analysis

Prepared as a handoff summary (e.g. to paste into another AI assistant) describing what was
asked for, what's been built, and where the current implementation still falls short.

**Correction (2026-09-08, written after the rest of this file):** the sections below claiming
`public/images/products/*.png` was "never wired into the site" and that `Product` has "no code
path" to a real photo are **wrong** — they missed `src/lib/productImages.ts` and
`src/lib/categoryImages.ts`, two existing lookup tables (product-id → photo path, and
category-slug → representative photo) that `src/components/ProductArt.tsx` already reads from.
Real photos already render on Shop, Product Detail, and every Home product carousel for 37 of 39
catalog products (per `README.md`) — composited over a themed gradient tile, which is what
earlier screenshots in this session actually showed, not "generated CSS/icon art" as claimed
below. Only the **category icon strip** (`CategoryIconStrip.tsx`) is still hardcoded to generic
Lucide icons despite `categoryImages.ts` already having real photos for several of its categories
(`seat-covers`, `floor-mats`, `audio-dashcams`, `bike-guards`) ready to use. Treat every claim
below about "no image field" / "no code path" / "44 unused photos" as superseded by this note —
left in place rather than rewritten so this file stays an honest record of what was actually
believed and said at each point.

## Project context

- **Site**: Delite Auto Accessories — an Indian car/bike accessories e-commerce site (seat
  covers, floor mats, audio systems, helmets, etc.), built in React + TypeScript + Vite +
  Tailwind CSS.
- **Task**: rebuild the Home page (and global Header/Footer) to match a Figma prototype the user
  shared as screenshots. No Figma file/API/MCP access was ever available — `WebFetch` on the
  Figma proto link only returned the SPA shell, not real content. Everything below was built by
  eye from static screenshots the user pasted into chat.
- **Branch**: `figma`.

## What the Figma screenshots show (expected)

Two areas of the homepage were shared as reference screenshots:

### 1. Hero banner

- Navy/blue textured background with a subtle grid pattern.
- Center: italic "Tired To Loose," then bold "UPGRADE" (white) / "YOUR RIDE" (yellow), then
  "Premium Brown Textured Design" subtitle, then a yellow pill "Shop Now" button.
- **Left side**: an orange Hyundai Creta (SUV), photographed at a 3/4 angle, with **three
  separate car seat-cover product photos fanned out and overlapping in front of it** (black
  leatherette, grey/silver leatherette, black-with-orange-piping leatherette) — real product
  photography, not icons or illustrations.
- **Right side**: a cluster of two-three motorcycles/scooters (one dark scooter, one red
  motorcycle, one white motorcycle, overlapping each other), with **three saddlebag/seat-cushion
  product photos fanned in front of them** (orange checkered pattern, black-and-white checkered,
  dark maroon quilted) — again, real product photography.

### 2. "Shop by Cars" / "Shop by Bikes" banner

- A single **full-bleed, edge-to-edge** section directly below the hero, split by one continuous
  **diagonal seam** — bright blue on the left (~55-60% width), white on the right — not two
  separate rounded cards with a gap between them.
- Left (blue) panel: "Shop by Cars" heading in white with a right-arrow icon, a thin underline
  divider, and a white SUV (Volkswagen Tiguan-like) sitting at the bottom of the panel.
- Right (white) panel: "Shop by Bikes" heading in black with a right-arrow icon (circular blue
  badge), a thin underline divider, and a grey scooter sitting at the bottom of the panel.

### 3. Category icon strip (directly below the banner)

- A horizontal scrollable strip of ~7 categories, each shown as a **real product photo thumbnail
  inside a circle** (a seat cover, a bike seat, floor mats, handlebar grips, a car stereo unit, a
  touchscreen head unit, a bike crash guard) — not generic Lucide icon glyphs.

### 4. "Trending on Car & Bike" product carousel

- Product cards with a **real, full-color photo of the actual vehicle** as the card image (e.g.
  a maroon Activa125, a blue TVS Jupiter, a white Chetak C3503, a grey/white Ola S1 Pro), each
  labelled "BIKE SEAT COVERS" as the category eyebrow, plus name, color swatches, star rating,
  price/MRP, and an "Add to Cart" button — i.e. the product photo is a real photo of the
  motorcycle/scooter model the seat cover fits, not a generated card.

## What was actually implemented

### Hero (`src/components/Hero.tsx`)

- First pass: a stock Pixabay car photo (a white BMW convertible) and a stock Pixabay
  motorcycle photo (a rider in full leathers on a sport bike), with a **hand-drawn CSS/icon
  "seat fan"** (colored rounded-rectangle divs with a Lucide `Armchair` icon inside) standing in
  for the three fanned seat covers. This was flagged by the user as not matching the reference.
- Second pass: discovered that `public/images/products/*.png` (44 files) already contains real,
  alpha-cut product photography for this business's own catalog (branded "Delite" / "Dolphin
  Accessories" / "4N Mats") that was never wired into the site (the `Product` TypeScript type has
  no `image` field — see Known issues). Repurposed:
  - `products/442.png` (real photo behind the "Dolphin Orbit Seat Cover — Hyundai Creta" catalog
    entry, black leatherette) → hero `seat-black.png`.
  - `products/508.png` (real photo behind "…— Mahindra XUV700", grey/beige leatherette) → hero
    `seat-grey.png`.
  - `products/117.png` (a real 4N Mats headrest-pillow pair, black) → hero `pillow-black.png`.
  - `products/10.png` (a real, riderless Honda-style scooter) → replaced the stock rider photo
    as the new `bike.png`.
  - The car photo (`car.png`) is **still the stock white BMW convertible** — no equivalent real
    SUV photo exists in the product catalog folder.
- `Hero.tsx`'s `AccessoryCluster` component fans these real photos (2 seat covers on the car
  side, 1 pillow-pair photo on the bike side) at the base of each vehicle image using CSS
  rotation/translation + drop-shadow, replacing the old icon-based `SeatFan`.

### "Shop by Cars / Shop by Bikes" (`src/pages/Home.tsx`)

- Rebuilt from two separate `rounded-2xl` cards (each independently clipped, sitting in a padded
  `container-page` grid with a gap between them) into **one full-bleed section**: a single CSS
  grid row with no outer container/max-width, only the left column has a `clip-path` polygon, and
  because the two columns sit flush with zero gap, the diagonal cut reveals the white column
  directly behind it — producing one continuous seam.
- Fixed a follow-up bug where the vehicle images could overflow past the bottom of their panel on
  narrower viewports (height was previously driven only by width-scaled image size): added
  `overflow-hidden` on each panel, an explicit `max-height` (not just `max-width`) on each
  vehicle image, and a blurred-ellipse "ground shadow" div behind each vehicle.
- Reuses the same `car.png` / `bike.png` files as the Hero (so the bike-side automatically picked
  up the new real scooter photo).

### Design canvas (separate deliverable)

- Also built a static "Delite Auto Homepage" design canvas (Claude Design / Artifact) recreating
  the Hero + Shop-by-Cars/Bikes sections with the same real photos and exact Tailwind design
  tokens (colors, fonts, spacing) pulled from `tailwind.config.js` / `src/index.css`, so the user
  can visually drag/restyle it instead of only reviewing code changes.

### Not touched yet

- The **category icon strip** (`src/components/home/CategoryIconStrip.tsx`) still renders
  generic Lucide icon glyphs (`Car`, `Bike`, `Grid2x2`, `Grip`, `Radio`, `Monitor`,
  `ShieldCheck`) inside colored circles — not real product-photo thumbnails.
- The **"Trending on Car & Bike" / "Find Your Perfect Vehicles" carousels**
  (`src/components/home/HomeProductCard.tsx`) still render via a `ProductArt` component
  (procedurally generated gradient background + icon), not real photos.

## Where I'm stuck / open problems

1. **No Figma access at all.** The Figma prototype link the user has cannot be read via
   `WebFetch` (returns only the SPA shell, no layer/asset data), and there's no Figma
   MCP/API/plugin connected in this environment. Every visual decision has been made by eye from
   static PNG screenshots pasted into chat, which is inherently lossy (no exact colors, spacing,
   or font metrics; can't extract embedded images from the screenshots as files).

2. **No real photo for the hero SUV.** The reference shows a specific orange Hyundai Creta at a
   specific angle; the only vehicle photos available in the repo (`public/images/products/`) are
   generic accessory catalog shots (a matte-grey Honda-style scooter, a Mahindra XUV300, a Tata
   Punch-like SUV on a road with sky background — not isolated/cutout, not orange, not a Creta).
   Currently still using an unrelated stock BMW convertible photo.

3. **No real photo for the bike-side "cluster of 2-3 motorcycles."** The reference shows a
   scooter + red motorcycle + white motorcycle overlapping as one group; only single-vehicle
   photos are available.

4. **No matching saddlebag/seat-cushion photos for the bike-side accessory fan.** The reference
   shows orange-checkered, black-and-white-checkered, and maroon saddlebag/seat-cushion products;
   the only bike-adjacent accessory photos in the catalog folder are a black headrest-pillow pair
   (already used) — not saddlebags, not those colors/patterns.

5. **Watermark on the seat-cover photos.** The two real seat-cover photos now used in the hero
   (`products/442.png`, `products/508.png`) carry a tiled "Dolphin Accessories" watermark baked
   into the source image (this is the *supplier's* catalog watermark, not the client's own
   branding). It's faintly visible in the hero at the sizes used. Removing it would require real
   photo editing/inpainting, which hasn't been attempted.

6. **No real thumbnails for the category icon strip.** Matching all 7 categories (car seat
   covers, bike seat covers, car mats, handlebar grips, audio system, monitors/head-units, steel
   guards) to a clean, correctly-cropped real photo would require auditing the 44-photo catalog
   folder for a fit per category — car mats and monitors have decent matches
   (`products/12.png`/`13.png` for mats, `products/397.png`/`499.png` for touchscreen head
   units), but "handlebar grips" and "steel guard" have no clean match in the current asset set.

7. **No real photos for the "Trending" carousel's named bike models.** The reference shows
   specific, recognizable scooter models in specific colors (Activa125 maroon, TVS Jupiter blue,
   Chetak C3503 white, Ola S1 Pro grey) used as the product-card image for bike seat-cover
   listings. This is a different problem from the hero/category work: it needs either (a) real
   stock photos of those exact models in those exact colors, which don't exist in the repo and
   are unlikely to be free/licensable as generic stock (they're manufacturer marketing photos),
   or (b) a structural change — adding an `image` field to the `Product` TypeScript type and
   wiring `HomeProductCard`/`ProductArt` to render a real `<img>` when one exists, falling back to
   the current generated art otherwise.

8. **Architectural gap, not just an asset gap.** `src/data/types.ts`'s `Product` interface has no
   `image` field at all — every product card on the entire site (not just Home) renders through
   `ProductArt`, a procedural "gradient background + Lucide icon" component. Even where a
   perfectly good real photo exists in `public/images/products/`, there's currently no code path
   that would display it on a product card. Wiring that up (schema change + mapping real photos
   to the right `Product.id`s + fallback logic) is a bigger, structural change beyond "swap an
   image file."

## What would help

- Either the actual Figma file/export access (layers, exact colors/spacing, and — most
  importantly — the original exported product photography used in the mock), **or**
- A batch of real, licensed, isolated (transparent-background) product photos: one orange
  SUV, a 2-3-bike cluster shot, three car seat-cover colors, three bike saddlebag/cushion colors,
  and category thumbnails for handlebar grips and steel guards, **or**
- Explicit sign-off to keep using stylized/placeholder art for whatever can't be sourced, framed
  honestly as a stand-in rather than a mismatch to chase indefinitely.

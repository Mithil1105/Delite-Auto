# Delite Auto — Website Redesign Demo

A from-scratch React + Vite rebuild of deliteauto.com, built for a client demo. Product/brand data is
mock content modeled on the real catalog, with real product photography sourced from the client's own
existing site. Swap in fresh copy, more photos and a backend when this moves past the demo stage.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS (v3)
- React Router v7
- lucide-react icons
- Custom lightweight i18n (English / Hindi / Gujarati)

## Run it

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173` by default.

```bash
npm run build    # production build to dist/
npm run preview  # preview the production build locally
```

## Structure

- `src/data/` — mock catalog (products, categories, brands, testimonials) and site/business info. Edit
  `src/data/site.ts` to change contact details, hours, or the founder story facts used across the site.
- `src/components/` — shared UI (header, footer, product card, hero, etc.)
- `src/pages/` — one file per route (Home, Shop, Product Detail, About, Brands, Contact, Cart, legal pages)
- `src/context/CartContext.tsx` — cart + wishlist state, persisted to `localStorage`
- `src/i18n/` — language system: `en.ts` / `hi.ts` / `gu.ts` dictionaries (typed against `en.ts`'s shape),
  `LanguageContext.tsx` (provider + `t()` hook, persisted to `localStorage`), and `LanguageSwitcher.tsx`
  (the EN / हिं / ગુજ control in the header)

## Language support

All UI chrome, section copy, category names, the founder story, contact/legal pages, and form labels are
translated into Hindi and Gujarati. Product names, descriptions, specs and testimonial quotes stay in
English by design — matching how most Indian multi-lingual e-commerce catalogs actually work. To add a
string: add the key to `src/i18n/en.ts` first (it's the type source), then mirror it in `hi.ts` and
`gu.ts` — TypeScript will error if a language file is missing a key.

## Images

`src/lib/productImages.ts` and `src/lib/categoryImages.ts` map specific product/category slugs to real
photos in `public/images/products/`, downloaded from the client's live catalog (matched by exact product
name where possible) and run through `scripts/remove-bg.mjs` — a local, dependency-free (besides `sharp`)
background-removal pass that flood-fills the studio background from the image edges, so every photo drops
onto the category-tinted gradient tile as a clean cutout instead of a white/grey box.

37 of the 39 catalog products with a real-world counterpart on the client's site got a matched photo.
Two products (`p03`, and the armrest/cushion pair `p04`/`p38`) and one (`p48`) are intentionally left on
the icon-on-gradient fallback — their source images on the live site turned out to be a dead-image
placeholder, technical line-diagrams instead of photos, and an invoice scan, respectively. Showing the
generic icon art is better than shipping a wrong or broken photo. To re-run the background removal after
adding more source photos to `public/images/products/`: `node scripts/remove-bg.mjs`.

Anything without a mapped photo falls back to the icon-on-gradient `ProductArt` treatment (themed per
category in `src/lib/categoryTheme.ts`), so the catalog never shows a broken image.

## Notes

- The cart/checkout flow is UI-only — no payment processing is wired up.
- The contact form is UI-only — submitting shows a confirmation state but doesn't send anywhere.

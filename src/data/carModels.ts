/**
 * Car models shown in the home page's "Shop by Your Car" section and on /cars and /cars/:slug.
 *
 * NOT Odoo data. Odoo has no per-car fitment (only 1 of 355 products carries a "Model" attribute),
 * so a car page finds its accessories by matching the model name against Odoo product names:
 * `query` goes to the catalog's name search, then `match` drops loose substring hits. That covers
 * products named for the model (mats, seat covers) and multi-model listings that name it (e.g.
 * bulbs "for Swift, Dzire, ..."). If Odoo gains real fitment values, switch the car page to the
 * `fitment` filter instead. See Documentations MD/shop-by-car-models.md.
 *
 * Images: public/images/cars/<slug>.webp — transparent cut-outs, all supplied by the client (the Creta
 * has its number plate removed). The optional `credit` field and the /cars "Photo credits" block are kept
 * for any future image that needs attribution; none do now.
 */
export interface CarPhotoCredit {
  author: string;
  license: string;
  /** Commons file page */
  url: string;
}

export interface CarModel {
  slug: string;
  make: string;
  name: string;
  image: string;
  /** Sent to the catalog name search (a single token). */
  query: string;
  /** Applied client-side to product names after the search, to drop incidental substring matches. */
  match: RegExp;
  credit?: CarPhotoCredit;
}

export const carModels: CarModel[] = [
  {
    slug: "hyundai-creta", make: "Hyundai", name: "Creta", image: "/images/cars/hyundai-creta.webp",
    query: "creta", match: /\bcreta\b/i,
  },
  {
    slug: "toyota-innova-hycross", make: "Toyota", name: "Innova Hycross", image: "/images/cars/toyota-innova-hycross.webp",
    query: "innova", match: /innova/i,
  },
  {
    slug: "maruti-swift", make: "Maruti Suzuki", name: "Swift", image: "/images/cars/maruti-swift.webp",
    query: "swift", match: /\bswift\b/i,
  },
  {
    slug: "maruti-ertiga", make: "Maruti Suzuki", name: "Ertiga", image: "/images/cars/maruti-ertiga.webp",
    query: "ertiga", match: /\bertiga\b/i,
  },
  {
    slug: "mahindra-thar", make: "Mahindra", name: "Thar", image: "/images/cars/mahindra-thar.webp",
    query: "thar", match: /\bthar\b/i,
  },
  {
    slug: "mahindra-xuv-3xo", make: "Mahindra", name: "XUV 3XO", image: "/images/cars/mahindra-xuv-3xo.webp",
    query: "3xo", match: /3xo/i,
  },
  {
    slug: "kia-seltos", make: "Kia", name: "Seltos", image: "/images/cars/kia-seltos.webp",
    query: "seltos", match: /seltos/i,
  },
  {
    slug: "tata-nexon", make: "Tata", name: "Nexon", image: "/images/cars/tata-nexon.webp",
    query: "nexon", match: /nexon/i,
  },
  {
    slug: "maruti-brezza", make: "Maruti Suzuki", name: "Brezza", image: "/images/cars/maruti-brezza.webp",
    query: "brezza", match: /brezza/i,
  },
  {
    slug: "maruti-baleno", make: "Maruti Suzuki", name: "Baleno", image: "/images/cars/maruti-baleno.webp",
    query: "baleno", match: /baleno/i,
  },
  {
    slug: "maruti-fronx", make: "Maruti Suzuki", name: "Fronx", image: "/images/cars/maruti-fronx.webp",
    query: "fronx", match: /fronx/i,
  },
  {
    slug: "honda-amaze", make: "Honda", name: "Amaze", image: "/images/cars/honda-amaze.webp",
    query: "amaze", match: /amaze/i,
  },
];

export const carModelBySlug = (slug: string | undefined): CarModel | undefined => carModels.find((m) => m.slug === slug);

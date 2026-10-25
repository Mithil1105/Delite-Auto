/**
 * The Deals & Offers page's sections — the single list both the storefront (src/pages/Deals.tsx)
 * and the admin editor (src/admin/pages/website/Deals.tsx) are driven by.
 *
 * Each section is a CMS row on the "deals" page (see supabase/migrations/20261022120000_deals_page_cms.sql):
 * its `visible` flag is the on/off feature switch the client controls, `display_order` is its
 * position, and `content` holds the editable settings below. The defaults here are what the page
 * uses when a row/field is missing (including before that migration is applied), so keep them in
 * step with the migration's seed values. See Documentations MD/deals-and-offers-page.md.
 */

export type DealsFieldKind = "text" | "textarea" | "url" | "image" | "datetime" | "boolean" | "number" | "productIds" | "category" | "combos" | "select";

export interface DealsField {
  key: string;
  label: string;
  kind: DealsFieldKind;
  help?: string;
  /** productIds: max picks; number: max value */
  max?: number;
  /** select: the choices (the first is the default). */
  options?: { value: string; label: string }[];
}

export interface DealsSectionDef {
  key: string;
  label: string;
  /** One line shown under the section name in the admin. */
  description: string;
  /** Shown as a warning in the admin editor for this section (data prerequisites etc.). */
  notice?: string;
  defaultVisible: boolean;
  defaultOrder: number;
  /** Default content, used for any field the admin hasn't set. */
  defaults: Record<string, unknown>;
  fields: DealsField[];
}

/** Key of the page-level settings row (not a visible section). */
export const DEALS_SETTINGS_KEY = "settings";

export const DEALS_SECTIONS: DealsSectionDef[] = [
  {
    key: DEALS_SETTINGS_KEY,
    label: "Page settings",
    description: "Master switch for the whole Deals & Offers page.",
    defaultVisible: true,
    defaultOrder: 5,
    defaults: { pageEnabled: true },
    fields: [{ key: "pageEnabled", label: "Show the Deals & Offers page and its menu/footer links", kind: "boolean" }],
  },
  {
    key: "message-strip",
    label: "Message strip",
    description: "A thin announcement bar at the top, e.g. free delivery or a coupon code.",
    notice: "Display only: a coupon code shown here must also exist in your checkout (Odoo) to actually work.",
    defaultVisible: false,
    defaultOrder: 8,
    defaults: {},
    fields: [
      { key: "text", label: "Message", kind: "text" },
      { key: "code", label: "Coupon code (optional)", kind: "text" },
      { key: "link", label: "Link (optional)", kind: "url" },
    ],
  },
  {
    key: "hero",
    label: "Top banner",
    description: "The page's headline banner.",
    defaultVisible: true,
    defaultOrder: 10,
    defaults: {
      style: "gradient",
      title: "Deals & Offers",
      subtitle: "Smart buys for your car and bike, picked by the Delite team.",
      ctaLabel: "Shop everything",
      ctaLink: "/shop",
    },
    fields: [
      {
        key: "style",
        label: "Banner style",
        kind: "select",
        options: [
          { value: "gradient", label: "Text on a coloured banner (image optional, faded behind)" },
          { value: "image", label: "Image only — your banner picture, full width" },
        ],
        help: "Choose “Image only” to replace the whole banner with a picture you designed. Heading and button below are then ignored; the picture links to the button link if one is set.",
      },
      { key: "image", label: "Banner image (desktop)", kind: "image", help: "For “Image only”, use a wide picture, about 2400 × 700 px." },
      { key: "mobileImage", label: "Banner image for phones (optional)", kind: "image", help: "A taller or squarer version shown on small screens, e.g. 1200 × 900 px. Falls back to the desktop image." },
      { key: "imageAlt", label: "Image description (for accessibility)", kind: "text" },
      { key: "title", label: "Heading", kind: "text" },
      { key: "subtitle", label: "Sub-heading", kind: "textarea" },
      { key: "ctaLabel", label: "Button label", kind: "text" },
      { key: "ctaLink", label: "Button link (also where an image-only banner goes when clicked)", kind: "url" },
    ],
  },
  {
    key: "campaign",
    label: "Timed campaign",
    description: "A festival or sale banner that appears only between a start and end date, with an optional countdown.",
    defaultVisible: false,
    defaultOrder: 20,
    defaults: { showCountdown: true },
    fields: [
      { key: "title", label: "Heading", kind: "text" },
      { key: "subtitle", label: "Sub-heading", kind: "textarea" },
      { key: "image", label: "Banner image (optional)", kind: "image" },
      { key: "ctaLabel", label: "Button label", kind: "text" },
      { key: "ctaLink", label: "Button link", kind: "url" },
      { key: "startsAt", label: "Starts at (blank = right away)", kind: "datetime" },
      { key: "endsAt", label: "Ends at (blank = no end)", kind: "datetime" },
      { key: "showCountdown", label: "Show a countdown to the end", kind: "boolean" },
    ],
  },
  {
    key: "hot-picks",
    label: "Hot picks",
    description: "Products you choose to feature. Falls back to your Featured Products list when empty.",
    defaultVisible: true,
    defaultOrder: 40,
    defaults: { title: "Hot picks" },
    fields: [
      { key: "title", label: "Heading", kind: "text" },
      { key: "productIds", label: "Products", kind: "productIds", max: 12, help: "Leave empty to use the Featured Products list from Merchandising." },
    ],
  },
  {
    key: "offer-category",
    label: "On offer (Odoo category)",
    description: "Everything in one Odoo category. Put products on offer by adding them to that category in Odoo.",
    defaultVisible: false,
    defaultOrder: 50,
    defaults: { title: "On offer", maxItems: 12 },
    fields: [
      { key: "title", label: "Heading", kind: "text" },
      { key: "categoryId", label: "Odoo category", kind: "category" },
      { key: "maxItems", label: "How many to show", kind: "number", max: 24 },
    ],
  },
  {
    key: "budget",
    label: "Shop by budget",
    description: "Price-band buttons that open the shop filtered to that price range.",
    defaultVisible: true,
    defaultOrder: 60,
    defaults: {
      title: "Shop by budget",
      bands: "Under ₹500|0|500\nUnder ₹1,000|0|1000\nUnder ₹2,000|0|2000\nUnder ₹5,000|0|5000\n₹5,000 & above|5000|",
    },
    fields: [
      { key: "title", label: "Heading", kind: "text" },
      { key: "bands", label: "Price bands — one per line: Label | from | to", kind: "textarea", help: "Example: Under ₹1,000|0|1000. Leave the last number empty for “and above”." },
    ],
  },
  {
    key: "car-offers",
    label: "Offers for your car",
    description: "Car tiles that open each model's accessories page.",
    defaultVisible: true,
    defaultOrder: 70,
    defaults: { title: "Offers for your car", limit: 8 },
    fields: [
      { key: "title", label: "Heading", kind: "text" },
      { key: "limit", label: "How many cars to show", kind: "number", max: 12 },
    ],
  },
  {
    key: "new-arrivals",
    label: "New arrivals",
    description: "Newly added products. Falls back to your New Arrivals list when empty.",
    defaultVisible: true,
    defaultOrder: 80,
    defaults: { title: "New arrivals" },
    fields: [
      { key: "title", label: "Heading", kind: "text" },
      { key: "productIds", label: "Products", kind: "productIds", max: 12, help: "Leave empty to use the New Arrivals list from Merchandising." },
    ],
  },
  {
    key: "top-rated",
    label: "Top rated by customers",
    description: "Products with the best average review rating.",
    notice: "Only counts approved customer reviews. Demo reviews are ignored unless you tick the option below, so this stays empty until real reviews arrive.",
    defaultVisible: false,
    defaultOrder: 90,
    defaults: { title: "Top rated by customers", minReviews: 5, includeDemo: false },
    fields: [
      { key: "title", label: "Heading", kind: "text" },
      { key: "minReviews", label: "Minimum reviews a product needs", kind: "number", max: 50 },
      { key: "includeDemo", label: "Also count demo (seeded) reviews", kind: "boolean" },
    ],
  },
  {
    key: "biggest-savings",
    label: "Biggest savings",
    description: "Products ranked by how far the price is below the original price (MRP).",
    notice: "No product in Odoo has an original price (MRP) yet, so this stays empty. It starts working as soon as products have one.",
    defaultVisible: false,
    defaultOrder: 100,
    defaults: { title: "Biggest savings" },
    fields: [{ key: "title", label: "Heading", kind: "text" }],
  },
  {
    key: "combos",
    label: "Combo picks",
    description: "Hand-picked sets of 2–4 products shown together, with one “Add all to cart” button.",
    notice: "Prices shown are the products' normal prices added up — no combo discount is applied at checkout.",
    defaultVisible: false,
    defaultOrder: 110,
    defaults: { title: "Combo picks" },
    fields: [
      { key: "title", label: "Heading", kind: "text" },
      { key: "combos", label: "Combos", kind: "combos", max: 4 },
    ],
  },
  {
    key: "brand-strip",
    label: "Shop by brand",
    description: "A strip of brand logos (from Odoo) that open each brand's products.",
    defaultVisible: true,
    defaultOrder: 120,
    defaults: { title: "Shop by brand", limit: 12 },
    fields: [
      { key: "title", label: "Heading", kind: "text" },
      { key: "limit", label: "How many brands to show", kind: "number", max: 28 },
    ],
  },
  {
    key: "whatsapp",
    label: "WhatsApp quote button",
    description: "A call-to-action for bulk, dealer or combo pricing that opens WhatsApp.",
    defaultVisible: false,
    defaultOrder: 130,
    defaults: {
      title: "Need a better price on a bigger order?",
      text: "Message us on WhatsApp for bulk, dealer and combo pricing.",
      message: "Hi Delite, I'd like a quote for: ",
    },
    fields: [
      { key: "title", label: "Heading", kind: "text" },
      { key: "text", label: "Text", kind: "textarea" },
      { key: "number", label: "WhatsApp number (blank = the shop's main phone number)", kind: "text" },
      { key: "message", label: "Message pre-filled for the customer", kind: "text" },
    ],
  },
];

export const dealsSectionDef = (key: string): DealsSectionDef | undefined => DEALS_SECTIONS.find((s) => s.key === key);

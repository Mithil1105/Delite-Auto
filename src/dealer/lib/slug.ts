/** Dealer product URLs read `/catalog/<name-slug>-<templateId>` (spec §4 `/catalog/:slug`). The numeric id at
 * the end is the only part the server trusts; the readable prefix is cosmetic and can drift safely. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function productPath(product: { name: string; templateId: number }): string {
  const slug = slugify(product.name);
  return `/catalog/${slug ? `${slug}-` : ""}${product.templateId}`;
}

/** The template id at the end of a `/catalog/:slug` segment, or null when there isn't one. */
export function templateIdFromSlug(slug: string | undefined): number | null {
  const m = /(?:^|-)(\d{1,9})$/.exec(slug ?? "");
  return m ? Number(m[1]) : null;
}

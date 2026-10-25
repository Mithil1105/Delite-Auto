import { supabase } from "../../lib/supabaseClient";
import { cleanBlocks, type BlogBlock, type BlogLang, type BlogLayout, type BlogPost, type BlogStatus, type Localized } from "../../lib/blog";

/**
 * Blog posts live in `blog_posts` (see migration 20261022190000). Visibility is enforced by row-level security: the public
 * only ever receives live posts, admins (owner/admin/content) also receive drafts and can write. The public list functions
 * still filter explicitly, because a signed-in admin would otherwise see drafts there too.
 */
interface Row {
  id: string;
  slug: string;
  status: BlogStatus;
  published_at: string | null;
  category: string;
  layout: BlogLayout;
  cover_image: string | null;
  cover_alt: string | null;
  show_products: boolean;
  product_ids: number[] | null;
  title: Record<string, unknown> | null;
  excerpt: Record<string, unknown> | null;
  body: Record<string, unknown> | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
}

const LANGS: BlogLang[] = ["en", "hi", "gu"];

function texts(raw: Record<string, unknown> | null): Localized<string> {
  const out: Localized<string> = {};
  for (const l of LANGS) if (typeof raw?.[l] === "string") out[l] = raw[l] as string;
  return out;
}

function bodies(raw: Record<string, unknown> | null): Localized<BlogBlock[]> {
  const out: Localized<BlogBlock[]> = {};
  for (const l of LANGS) if (raw?.[l] !== undefined) out[l] = cleanBlocks(raw[l]);
  return out;
}

function mapRow(r: Row): BlogPost {
  return {
    id: r.id,
    slug: r.slug,
    status: r.status,
    publishedAt: r.published_at,
    category: r.category,
    layout: r.layout,
    coverImage: r.cover_image,
    coverAlt: r.cover_alt,
    showProducts: r.show_products,
    productIds: r.product_ids ?? [],
    title: texts(r.title),
    excerpt: texts(r.excerpt),
    body: bodies(r.body),
    authorName: r.author_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Live posts, newest first. */
export async function listPublishedPosts(limit = 100): Promise<BlogPost[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Row[]).map(mapRow);
}

/** One post by its web address. Drafts / scheduled posts come back only for a signed-in admin (RLS). */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("blog_posts").select("*").eq("slug", slug).maybeSingle();
  return data ? mapRow(data as Row) : null;
}

// ---- admin ----

export async function listAllPosts(): Promise<BlogPost[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("blog_posts").select("*").order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as Row[]).map(mapRow);
}

export async function getPostById(id: string): Promise<BlogPost | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("blog_posts").select("*").eq("id", id).maybeSingle();
  return data ? mapRow(data as Row) : null;
}

export interface BlogPostInput {
  id?: string;
  slug: string;
  status: BlogStatus;
  publishedAt: string | null;
  category: string;
  layout: BlogLayout;
  coverImage: string | null;
  coverAlt: string | null;
  showProducts: boolean;
  productIds: number[];
  title: Localized<string>;
  excerpt: Localized<string>;
  body: Localized<BlogBlock[]>;
  authorName: string | null;
}

/** Drops empty languages / empty blocks so the database only holds what was really written. */
function compact<T>(map: Localized<T>, keep: (v: T) => boolean): Record<string, T> {
  const out: Record<string, T> = {};
  for (const l of LANGS) {
    const v = map[l];
    if (v !== undefined && keep(v)) out[l] = v;
  }
  return out;
}

export async function savePost(input: BlogPostInput, userId: string): Promise<{ post?: BlogPost; error?: string }> {
  if (!supabase) return { error: "Not connected" };
  const payload = {
    slug: input.slug,
    status: input.status,
    published_at: input.status === "published" ? input.publishedAt ?? new Date().toISOString() : input.publishedAt,
    category: input.category,
    layout: input.layout,
    cover_image: input.coverImage,
    cover_alt: input.coverAlt,
    show_products: input.showProducts,
    product_ids: input.productIds.slice(0, 8),
    title: compact(input.title, (v) => v.trim() !== ""),
    excerpt: compact(input.excerpt, (v) => v.trim() !== ""),
    body: compact(input.body, (v) => v.length > 0),
    author_name: input.authorName,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? supabase.from("blog_posts").update(payload).eq("id", input.id)
    : supabase.from("blog_posts").insert({ ...payload, created_by: userId });
  const { data, error } = await query.select("*").single();
  if (error) {
    if (error.code === "23505") return { error: "That web address is already used by another post. Change it and save again." };
    return { error: "Couldn't save the post. Check your connection and permissions, then try again." };
  }
  return { post: mapRow(data as Row) };
}

export async function deletePost(id: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "Not connected" };
  const { error } = await supabase.from("blog_posts").delete().eq("id", id);
  return error ? { error: "Couldn't delete the post." } : {};
}

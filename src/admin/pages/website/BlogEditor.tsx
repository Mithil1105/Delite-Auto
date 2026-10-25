import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { deletePost, getPostById, savePost } from "../../../services/blog/blogService";
import { BLOG_CATEGORY_PRESETS, BLOG_LANGS, BLOG_LAYOUTS, isLive, isValidSlug, slugify, type BlogBlock, type BlogLang, type BlogLayout, type BlogPost, type Localized } from "../../../lib/blog";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { AdminMediaField, mediaPublicUrl } from "../../components/AdminMediaPicker";
import { AdminProductPicker } from "../../components/AdminProductPicker";
import { BlogBlockEditor } from "../../components/BlogBlockEditor";

const inputClass = "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";

interface Form {
  title: Localized<string>;
  excerpt: Localized<string>;
  body: Localized<BlogBlock[]>;
  slug: string;
  slugTouched: boolean;
  category: string;
  layout: BlogLayout;
  coverImage: string;
  coverAlt: string;
  showProducts: boolean;
  productIds: number[];
  authorName: string;
  status: "draft" | "published";
  publishedAt: string | null;
  scheduleAt: string; // datetime-local value; "" = publish right away
}

const emptyForm = (): Form => ({
  title: {}, excerpt: {}, body: { en: [] }, slug: "", slugTouched: false, category: "Guides", layout: "standard", coverImage: "", coverAlt: "",
  showProducts: false, productIds: [], authorName: "Delite Auto", status: "draft", publishedAt: null, scheduleAt: "",
});

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromPost = (p: BlogPost): Form => ({
  title: p.title, excerpt: p.excerpt, body: { en: [], ...p.body }, slug: p.slug, slugTouched: true, category: p.category, layout: p.layout,
  coverImage: p.coverImage ?? "", coverAlt: p.coverAlt ?? "", showProducts: p.showProducts, productIds: p.productIds, authorName: p.authorName ?? "",
  status: p.status, publishedAt: p.publishedAt, scheduleAt: p.status === "published" ? toLocalInput(p.publishedAt) : "",
});

/** Drops blocks that were added but never filled in. */
function tidy(blocks: BlogBlock[]): BlogBlock[] {
  const out: BlogBlock[] = [];
  for (const b of blocks) {
    if (b.type === "heading" || b.type === "paragraph" || b.type === "quote") {
      if (b.text.trim()) out.push({ ...b, text: b.text.trim() });
    } else if (b.type === "image") {
      if (b.src) out.push(b);
    } else {
      const images = b.images.filter((i) => i.src);
      if (images.length) out.push({ type: "gallery", images });
    }
  }
  return out;
}

/** Admin → Website → Blog → New post / Edit post. Written for non-technical staff: plain labels, no HTML. */
export default function BlogEditor() {
  const { id = "new" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [form, setForm] = useState<Form>(emptyForm);
  const [lang, setLang] = useState<BlogLang>("en");
  const [loaded, setLoaded] = useState(id === "new");
  const [missing, setMissing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const guardDialog = useUnsavedChangesGuard(dirty);

  useEffect(() => {
    if (id === "new") return;
    let cancelled = false;
    getPostById(id).then((p) => {
      if (cancelled) return;
      if (!p) setMissing(true);
      else setForm(fromPost(p));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const change = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };
  const setText = (field: "title" | "excerpt", value: string) => {
    const next = { ...form[field], [lang]: value };
    const patch: Partial<Form> = { [field]: next };
    // The web address follows the English title until someone edits it by hand.
    if (field === "title" && lang === "en" && !form.slugTouched) patch.slug = slugify(value);
    change(patch);
  };
  const setBlocks = (blocks: BlogBlock[]) => change({ body: { ...form.body, [lang]: blocks } });

  const copyFromEnglish = () => {
    change({
      title: { ...form.title, [lang]: form.title.en ?? "" },
      excerpt: { ...form.excerpt, [lang]: form.excerpt.en ?? "" },
      body: { ...form.body, [lang]: structuredClone(form.body.en ?? []) },
    });
    showToast("English text copied — now translate it.");
  };

  const hasContent = (l: BlogLang) => !!(form.title[l]?.trim() || (form.body[l] && form.body[l]!.length > 0));

  const save = async (status: "draft" | "published") => {
    if (!user) return;
    const title = { ...form.title, en: (form.title.en ?? "").trim() };
    if (!title.en) {
      setLang("en");
      showToast("Please add an English title first.", "error");
      return;
    }
    const slug = (form.slug || slugify(title.en) || `post-${Date.now().toString(36)}`).trim().replace(/^-+|-+$/g, "");
    if (!isValidSlug(slug)) {
      showToast("The web address can only use small letters, numbers and single dashes.", "error");
      return;
    }
    const body: Localized<BlogBlock[]> = {};
    for (const l of ["en", "hi", "gu"] as BlogLang[]) body[l] = tidy(form.body[l] ?? []);
    if (status === "published" && (body.en ?? []).length === 0) {
      setLang("en");
      showToast("Add some content to the English article before publishing.", "error");
      return;
    }
    const publishedAt = status === "published" ? (form.scheduleAt ? new Date(form.scheduleAt).toISOString() : form.publishedAt ?? new Date().toISOString()) : form.publishedAt;

    setBusy(true);
    const { post, error } = await savePost(
      {
        id: id === "new" ? undefined : id,
        slug,
        status,
        publishedAt,
        category: form.category.trim() || "Guides",
        layout: form.layout,
        coverImage: form.coverImage || null,
        coverAlt: form.coverAlt.trim() || null,
        showProducts: form.showProducts,
        productIds: form.productIds,
        title,
        excerpt: form.excerpt,
        body,
        authorName: form.authorName.trim() || null,
      },
      user.id
    );
    setBusy(false);
    if (error || !post) {
      showToast(error ?? "Couldn't save the post.", "error");
      return;
    }
    setDirty(false);
    setForm(fromPost(post));
    showToast(status === "published" ? (isLive(post) ? "Published — it is live on the website." : "Scheduled — it will appear on the chosen date.") : "Draft saved");
    logActivity(status === "published" ? "blog.published" : "blog.draft_saved", "blog_post", post.id, { slug: post.slug });
    if (id === "new") navigate(`/admin/website/blog/${post.id}`, { replace: true });
  };

  const remove = async () => {
    if (id === "new") return;
    if (!(await confirm(`Delete "${form.title.en ?? "this post"}"? This can't be undone.`, { title: "Delete this post?", confirmLabel: "Delete post", cancelLabel: "Keep it" }))) return;
    const { error } = await deletePost(id);
    if (error) {
      showToast(error, "error");
      return;
    }
    setDirty(false);
    logActivity("blog.deleted", "blog_post", id, { slug: form.slug });
    navigate("/admin/website/blog", { replace: true });
  };

  if (!loaded) return <div className="p-10 text-[13.5px] text-steel-500">Loading…</div>;
  if (missing) {
    return (
      <div className="p-10 text-[13.5px]">
        That post doesn't exist (or was deleted). <Link to="/admin/website/blog" className="font-semibold text-brand-700 hover:underline">Back to all posts</Link>
      </div>
    );
  }

  const isPublished = form.status === "published";
  const isNew = id === "new";
  const english = lang === "en";

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin/website/blog" className="text-[12.5px] text-steel-500 hover:underline">← All posts</Link>
          <h2 className="font-display text-[13.5px] uppercase">{isNew ? "New post" : "Edit post"}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="text-[12px] text-amber-700">Unsaved changes</span>}
          {!isNew && (
            <a href={`/blog/${form.slug}`} target="_blank" rel="noreferrer" className="btn-outline text-sm">Preview</a>
          )}
          <button type="button" disabled={busy} onClick={() => save("draft")} className="btn-outline text-sm disabled:opacity-50">{isPublished ? "Move back to draft" : "Save draft"}</button>
          <button type="button" disabled={busy} onClick={() => save("published")} className="btn-dark text-sm disabled:opacity-50">{isPublished ? "Update published post" : "Publish"}</button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <div role="tablist" aria-label="Language" className="flex flex-wrap items-center gap-2">
            {BLOG_LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                role="tab"
                aria-selected={lang === l.code}
                onClick={() => setLang(l.code)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-colors ${lang === l.code ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/75 hover:border-ink"}`}
              >
                {l.label}
                <span className={`h-2 w-2 rounded-full ${hasContent(l.code) ? "bg-emerald-500" : "bg-steel-300"}`} aria-label={hasContent(l.code) ? "has content" : "empty"} />
              </button>
            ))}
          </div>
          {!english && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-steel-50 p-3 text-[13px] text-steel-700">
              <span>Leave this language empty and visitors will see the English version.</span>
              <button type="button" onClick={copyFromEnglish} className="btn-outline !px-3 !py-1.5 text-[12px]">Copy the English text here</button>
            </div>
          )}

          <label className={labelClass}>
            Title {english && <span className="text-sale">*</span>}
            <input className={`${inputClass} text-[16px] font-semibold`} value={form.title[lang] ?? ""} maxLength={150} placeholder={english ? "e.g. How to choose the right seat covers" : form.title.en ?? ""} onChange={(e) => setText("title", e.target.value)} />
          </label>
          <label className={labelClass}>
            Short summary (shown on the blog list and in search results)
            <textarea className={`${inputClass} h-auto py-2.5`} rows={3} maxLength={240} value={form.excerpt[lang] ?? ""} placeholder={english ? "One or two sentences that make people want to read it." : form.excerpt.en ?? ""} onChange={(e) => setText("excerpt", e.target.value)} />
          </label>

          <div>
            <h3 className={labelClass}>Article</h3>
            <BlogBlockEditor blocks={form.body[lang] ?? []} onChange={setBlocks} />
          </div>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="card-surface space-y-3 p-4">
            <h3 className="text-[13px] font-semibold">Publishing</h3>
            <p className="text-[13px] text-steel-700">
              Status: <strong>{!isPublished ? "Draft (not on the website)" : isLive({ status: form.status, publishedAt: form.publishedAt }) ? "Published" : "Scheduled"}</strong>
            </p>
            <label className={labelClass}>
              Publish date (optional)
              <input type="datetime-local" className={inputClass} value={form.scheduleAt} onChange={(e) => change({ scheduleAt: e.target.value })} />
            </label>
            <p className="text-[12px] text-steel-500">Leave empty to publish as soon as you click Publish. Pick a future date to schedule it.</p>
            {!isNew && (
              <button type="button" onClick={remove} className="text-[13px] text-sale hover:underline">Delete this post</button>
            )}
          </section>

          <section className="card-surface space-y-3 p-4">
            <h3 className="text-[13px] font-semibold">Cover picture</h3>
            <AdminMediaField label="Picture" value={form.coverImage || undefined} onChange={(path) => change({ coverImage: path ? mediaPublicUrl(path) : "" })} />
            <label className={labelClass}>Picture description (for screen readers)<input className={inputClass} value={form.coverAlt} maxLength={200} onChange={(e) => change({ coverAlt: e.target.value })} /></label>
          </section>

          <section className="card-surface space-y-3 p-4">
            <h3 className="text-[13px] font-semibold">Page layout</h3>
            <div className="space-y-2" role="radiogroup" aria-label="Page layout">
              {BLOG_LAYOUTS.map((l) => (
                <label key={l.value} className={`block cursor-pointer rounded-lg border p-3 transition-colors ${form.layout === l.value ? "border-ink bg-steel-50" : "border-line hover:border-ink"}`}>
                  <input type="radio" name="layout" className="sr-only" checked={form.layout === l.value} onChange={() => change({ layout: l.value })} />
                  <span className="block text-[13.5px] font-semibold">{l.label}</span>
                  <span className="block text-[12px] text-steel-500">{l.hint}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="card-surface space-y-3 p-4">
            <h3 className="text-[13px] font-semibold">Featured products</h3>
            <label className="flex items-start gap-2 text-[13.5px]">
              <input type="checkbox" className="mt-1" checked={form.showProducts} onChange={(e) => change({ showProducts: e.target.checked })} />
              <span>Show products under this article<span className="block text-[12px] text-steel-500">Pick up to 8 products; they appear as a shopping row after the article.</span></span>
            </label>
            {form.showProducts && <AdminProductPicker selectedIds={form.productIds} onChange={(ids) => change({ productIds: ids })} maxItems={8} />}
          </section>

          <section className="card-surface space-y-3 p-4">
            <h3 className="text-[13px] font-semibold">Details</h3>
            <label className={labelClass}>
              Category
              <input className={inputClass} list="blog-categories" value={form.category} maxLength={40} onChange={(e) => change({ category: e.target.value })} />
              <datalist id="blog-categories">{BLOG_CATEGORY_PRESETS.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className={labelClass}>Written by<input className={inputClass} value={form.authorName} maxLength={80} onChange={(e) => change({ authorName: e.target.value })} /></label>
            <label className={labelClass}>
              Web address
              <div className="flex items-center gap-1 text-[13px] normal-case text-steel-500"><span>/blog/</span>
                <input className={`${inputClass} !h-10`} value={form.slug} onChange={(e) => change({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+/, ""), slugTouched: true })} placeholder="created from the English title" />
              </div>
            </label>
          </section>
        </aside>
      </div>
      {confirmDialog}
      {guardDialog}
    </div>
  );
}

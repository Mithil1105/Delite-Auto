import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { deletePost, listAllPosts } from "../../../services/blog/blogService";
import { isLive, pickText, type BlogPost } from "../../../lib/blog";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";

function statusOf(p: BlogPost): { label: string; cls: string } {
  if (p.status === "draft") return { label: "Draft", cls: "bg-steel-100 text-steel-700" };
  return isLive(p) ? { label: "Published", cls: "bg-emerald-100 text-emerald-800" } : { label: "Scheduled", cls: "bg-amber-100 text-amber-900" };
}

/** Admin → Website → Blog: every post, with its status, and the way into the editor. */
export default function BlogList() {
  const navigate = useNavigate();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();
  const { confirm, dialog } = useConfirmDialog();
  const [posts, setPosts] = useState<BlogPost[] | null>(null);

  const load = () => listAllPosts().then(setPosts);
  useEffect(() => {
    load();
  }, []);

  const remove = async (p: BlogPost) => {
    if (!(await confirm(`Delete "${pickText(p.title, "en")}"? This can't be undone.`, { title: "Delete this post?", confirmLabel: "Delete post", cancelLabel: "Keep it" }))) return;
    const { error } = await deletePost(p.id);
    if (error) {
      showToast(error, "error");
      return;
    }
    showToast("Post deleted");
    logActivity("blog.deleted", "blog_post", p.id, { slug: p.slug });
    load();
  };

  return (
    <div className="max-w-4xl p-6 lg:p-10">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-display text-[13.5px] uppercase">Blog</h2>
        <button type="button" onClick={() => navigate("/admin/website/blog/new")} className="btn-dark inline-flex items-center gap-1.5 text-sm">
          <Plus className="h-4 w-4" /> New post
        </button>
      </div>
      <p className="mb-6 text-[13px] text-steel-500">Write articles and guides for the website. Drafts are only visible here; published posts appear on the Blog page and (the latest three) on the home page.</p>

      {posts === null ? (
        <p className="text-[13.5px] text-steel-500">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="text-[13.5px] text-steel-500">No posts yet. Click “New post” to write the first one.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {posts.map((p) => {
            const s = statusOf(p);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <div className="min-w-0 flex-1">
                  <Link to={`/admin/website/blog/${p.id}`} className="block truncate text-[14.5px] font-semibold hover:text-brand-700">{pickText(p.title, "en")}</Link>
                  <div className="mt-0.5 text-[12px] text-steel-500">
                    {p.category} · /blog/{p.slug} · updated {new Date(p.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${s.cls}`}>{s.label}</span>
                <div className="flex items-center gap-3 text-[13px]">
                  <Link to={`/admin/website/blog/${p.id}`} className="font-semibold text-brand-700 hover:underline">Edit</Link>
                  <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" className="text-steel-700 hover:underline">View</a>
                  <button type="button" onClick={() => remove(p)} className="text-sale hover:underline">Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
    </div>
  );
}

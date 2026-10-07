import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Copy, Trash2, ImageOff, Search } from "lucide-react";
import clsx from "clsx";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../context/AuthContext";
import { useActivityLog } from "../../hooks/useActivityLog";
import { useAdminToast } from "../../components/AdminToastProvider";

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const PAGE_SIZE = 40;
const RECENT_WINDOW_DAYS = 30;

type MediaFilter = "all" | "images" | "recent";

interface MediaRow {
  id: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

function publicUrl(path: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL ?? "";
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/marketing-media/${path}`;
}

interface MediaReference {
  source: string;
  status: string;
  label: string;
}

export default function MediaLibrary() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { showToast } = useAdminToast();

  const [items, setItems] = useState<MediaRow[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ item: MediaRow; references: MediaReference[] } | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<MediaFilter>("all");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Server-side search/filter/pagination — this table can grow unbounded (spec #37-38), so this
  // never fetches the whole bucket at once. `append` distinguishes the initial/refresh load (page
  // 0, replaces `items`) from "Load more" (appends the next page).
  const load = useCallback(
    (page: number, append: boolean) => {
      if (!supabase) return;
      if (append) setLoadingMore(true);
      let query = supabase.from("cms_media").select("id, storage_path, filename, mime_type, size_bytes, created_at");
      if (debouncedSearch) query = query.ilike("filename", `%${debouncedSearch}%`);
      if (filter === "images") query = query.ilike("mime_type", "image/%");
      if (filter === "recent") query = query.gte("created_at", new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString());
      query
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
        .then(({ data }) => {
          const rows = (data as MediaRow[] | null) ?? [];
          setItems((prev) => (append ? [...(prev ?? []), ...rows] : rows));
          setHasMore(rows.length === PAGE_SIZE);
          setLoadingMore(false);
        });
    },
    [debouncedSearch, filter]
  );

  useEffect(() => {
    setItems(null);
    load(0, false);
  }, [load]);

  const loadMore = () => {
    const nextPage = Math.floor((items?.length ?? 0) / PAGE_SIZE);
    load(nextPage, true);
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!supabase || !user) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        showToast(`${file.name}: unsupported file type`, "error");
        continue;
      }
      if (file.size > MAX_SIZE_BYTES) {
        showToast(`${file.name}: file too large (max 8MB)`, "error");
        continue;
      }
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage.from("marketing-media").upload(path, file, { contentType: file.type });
      if (uploadError) {
        showToast(`${file.name}: upload failed`, "error");
        continue;
      }
      const { error: insertError } = await supabase.from("cms_media").insert({
        storage_path: path,
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: user.id,
      });
      if (insertError) {
        showToast(`${file.name}: saved to storage but index failed`, "error");
        continue;
      }
      logActivity("media.uploaded", "cms_media", path, { filename: file.name });
    }
    setUploading(false);
    showToast("Upload complete");
    load(0, false);
  };

  // Media-delete safety (#48-49): checks real CMS references (find_media_references RPC — draft
  // AND published, plus promotions) before ever deleting. Referenced media is blocked by default;
  // an admin must explicitly confirm past the warning, never a silent one-click delete.
  const requestRemove = async (item: MediaRow) => {
    if (!supabase) return;
    const { data } = await supabase.rpc("find_media_references", { p_storage_path: item.storage_path });
    setConfirmDelete({ item, references: (data as MediaReference[] | null) ?? [] });
  };

  const confirmRemove = async () => {
    if (!supabase || !confirmDelete) return;
    const { item } = confirmDelete;
    await supabase.storage.from("marketing-media").remove([item.storage_path]);
    await supabase.from("cms_media").delete().eq("id", item.id);
    logActivity("media.removed", "cms_media", item.storage_path, { filename: item.filename, hadReferences: confirmDelete.references.length > 0 });
    setConfirmDelete(null);
    showToast("Removed");
    load(0, false);
  };

  const onCopy = async (item: MediaRow) => {
    await navigator.clipboard.writeText(publicUrl(item.storage_path));
    showToast("URL copied");
  };

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-display uppercase text-[13.5px]">Marketing Media</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-steel-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filename…"
              className="h-8 pl-8 pr-3 border border-line text-[12.5px] w-48 focus:outline-none focus:border-ink"
            />
          </div>
          <div className="inline-flex items-center rounded-full border border-line bg-white p-[3px]">
            {(["all", "images", "recent"] as MediaFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={clsx(
                  "px-3 h-7 rounded-full text-[11.5px] font-semibold capitalize transition-colors",
                  filter === f ? "bg-ink text-white" : "text-steel-500 hover:text-ink"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed ${dragOver ? "border-ink bg-steel-50" : "border-line"} p-10 text-center mb-8 transition-colors`}
      >
        <Upload className="w-6 h-6 text-steel-300 mx-auto mb-2" />
        <p className="text-[13.5px] text-steel-500 mb-3">Drag & drop JPG/PNG/WebP here, up to 8MB each</p>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-outline">
          {uploading ? "Uploading…" : "Choose Files"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
      </div>

      {items === null && <p className="text-[13.5px] text-steel-500">Loading…</p>}
      {items !== null && items.length === 0 && (
        <div className="flex flex-col items-center text-center py-10 text-steel-500">
          <ImageOff className="w-6 h-6 mb-2" />
          <p className="text-[13.5px]">{search || filter !== "all" ? "No media matches your search/filter." : "No media uploaded yet."}</p>
        </div>
      )}
      {items !== null && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {items.map((item) => (
            <div key={item.id} className="card-surface overflow-hidden">
              <div className="aspect-square bg-steel-50">
                <img src={publicUrl(item.storage_path)} alt={item.filename} className="w-full h-full object-cover" />
              </div>
              <div className="p-2.5">
                <div className="text-[11.5px] font-semibold truncate">{item.filename}</div>
                <div className="text-[10.5px] text-steel-500 mb-2">{(item.size_bytes / 1024).toFixed(0)} KB</div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => onCopy(item)} className="text-steel-500 hover:text-ink" aria-label="Copy URL">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => requestRemove(item)} className="text-steel-500 hover:text-sale" aria-label="Remove">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-6">
          <button type="button" onClick={loadMore} disabled={loadingMore} className="btn-outline disabled:opacity-50">
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-[15px] mb-2">Delete "{confirmDelete.item.filename}"?</h3>
            {confirmDelete.references.length > 0 ? (
              <>
                <p className="text-[13px] text-sale font-semibold mb-2">This image is currently used in:</p>
                <ul className="text-[13px] text-steel-600 mb-4 list-disc pl-5">
                  {confirmDelete.references.map((r, i) => (
                    <li key={i} className="capitalize">
                      {r.label} ({r.source.replace("_", " ")}, {r.status})
                    </li>
                  ))}
                </ul>
                <p className="text-[12.5px] text-steel-500 mb-4">Deleting it will break these places. Replace the reference first, or confirm to delete anyway.</p>
              </>
            ) : (
              <p className="text-[13px] text-steel-500 mb-4">No current CMS references found. This can't rule out an external/raw URL reference — only what Delite CMS itself tracks.</p>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setConfirmDelete(null)} className="btn-ghost !px-4 !py-2 text-[12.5px]">Cancel</button>
              <button type="button" onClick={confirmRemove} className="btn-dark !px-4 !py-2 text-[12.5px] !bg-sale hover:!bg-sale/90">
                {confirmDelete.references.length > 0 ? "Delete anyway" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

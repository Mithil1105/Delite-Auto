import { useEffect, useRef, useState } from "react";
import { Upload, ImageOff, X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useActivityLog } from "../hooks/useActivityLog";

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 8 * 1024 * 1024;

interface MediaRow {
  id: string;
  storage_path: string;
  filename: string;
}

export function mediaPublicUrl(path: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL ?? "";
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/marketing-media/${path}`;
}

/**
 * Reusable Browse/Search/Preview/Upload/Select media picker (#50) — replaces raw storage-path
 * text inputs across CMS editors (Promotions, Homepage Categories) with a real picker over the
 * same `cms_media` library the Marketing Media page manages. Selecting or uploading calls
 * `onSelect(storagePath)` and closes; the caller owns saving that path into its own draft.
 */
export function AdminMediaPicker({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (storagePath: string) => void }) {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const [items, setItems] = useState<MediaRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !supabase) return;
    supabase
      .from("cms_media")
      .select("id, storage_path, filename")
      .order("created_at", { ascending: false })
      .then(({ data }) => setItems((data as MediaRow[] | null) ?? []));
  }, [open]);

  if (!open) return null;

  const filtered = (items ?? []).filter((i) => i.filename.toLowerCase().includes(query.toLowerCase()));

  const uploadAndSelect = async (file: File) => {
    if (!supabase || !user) return;
    if (!ALLOWED_TYPES.includes(file.type) || file.size > MAX_SIZE_BYTES) return;
    setUploading(true);
    const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage.from("marketing-media").upload(path, file, { contentType: file.type });
    if (!uploadError) {
      await supabase.from("cms_media").insert({ storage_path: path, filename: file.name, mime_type: file.type, size_bytes: file.size, uploaded_by: user.id });
      logActivity("media.uploaded", "cms_media", path, { filename: file.name });
      onSelect(path);
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="bg-white max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-line">
          <h3 className="font-semibold text-[14px]">Choose Image</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 border-b border-line flex items-center gap-3">
          <input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 h-9 px-3 border border-line text-[13px]" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-outline !px-3 !py-1.5 text-[12.5px] inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading…" : "Upload New"}
          </button>
          <input ref={fileInputRef} type="file" accept={ALLOWED_TYPES.join(",")} className="hidden" onChange={(e) => e.target.files?.[0] && uploadAndSelect(e.target.files[0])} />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {items === null && <p className="text-[13px] text-steel-500 text-center py-8">Loading…</p>}
          {items !== null && filtered.length === 0 && (
            <div className="flex flex-col items-center text-center py-10 text-steel-500">
              <ImageOff className="w-6 h-6 mb-2" />
              <p className="text-[13px]">No media found.</p>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.storage_path)}
                  className="aspect-square bg-steel-50 border border-line hover:border-ink overflow-hidden"
                  title={item.filename}
                >
                  <img src={mediaPublicUrl(item.storage_path)} alt={item.filename} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Small preview + "Choose Image"/"Remove" control pairing a storage-path field with the picker
 * above — the replacement for a raw text input in a CMS editor form. */
export function AdminMediaField({ label, value, onChange }: { label: string; value: string | undefined; onChange: (path: string | undefined) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-steel-500 mb-1.5">{label}</label>
      <div className="flex items-center gap-3">
        {value ? (
          <img src={mediaPublicUrl(value)} alt="" className="w-16 h-16 object-cover border border-line" />
        ) : (
          <div className="w-16 h-16 grid place-items-center border border-dashed border-line text-steel-300">
            <ImageOff className="w-5 h-5" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={() => setPickerOpen(true)} className="btn-outline !px-3 !py-1.5 text-[12px]">
            {value ? "Change Image" : "Choose Image"}
          </button>
          {value && (
            <button type="button" onClick={() => onChange(undefined)} className="text-[11.5px] text-steel-500 hover:text-sale text-left">
              Remove
            </button>
          )}
        </div>
      </div>
      <AdminMediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(path) => {
          onChange(path);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

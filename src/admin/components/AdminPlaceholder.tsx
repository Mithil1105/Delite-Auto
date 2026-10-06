import { Construction } from "lucide-react";

/**
 * Explicitly-labelled "not built yet" state — never a fake-functional stub. Used by every sidebar
 * route marked status: "placeholder" in adminAuth.ts.
 */
export function AdminPlaceholder({ title, note }: { title: string; note?: string }) {
  return (
    <div className="p-6 lg:p-10">
      <div className="card-surface p-10 flex flex-col items-center text-center max-w-lg mx-auto mt-10">
        <Construction className="w-8 h-8 text-steel-300 mb-4" />
        <h2 className="text-lg font-semibold mb-2">{title} — Coming soon</h2>
        <p className="text-[13.5px] text-steel-500">
          {note ?? "This module isn't built yet. It's on the roadmap — see Documentations MD/delite-admin.md for the phased plan."}
        </p>
      </div>
    </div>
  );
}

import type { CmsSectionRow } from "../services/cmsService";
import { HomeSectionPreview } from "./HomeSectionPreview";
import { Hero as HeroPreview, type HeroContentOverride } from "../../components/Hero";
import type { Breakpoint } from "./PreviewFrame";

/**
 * Homepage's center pane — every VISIBLE section composed in draft order inside one scrollable
 * canvas, reusing HomeSectionPreview's per-section rendering (never a second, drifting copy).
 * "hero" is the one section outside HomeSectionPreview's switch — it has its own dedicated
 * component/editor (see SectionInspector's doc comment on inspector scope), so it's rendered here
 * directly instead of being added to that switch just for this one caller.
 */
export function FullHomePreview({
  sections,
  selectedSectionId,
  previewBreakpoint,
}: {
  sections: CmsSectionRow[];
  selectedSectionId: string | null;
  previewBreakpoint: Breakpoint;
}) {
  const visible = sections.filter((s) => s.visible);

  return (
    <div>
      {visible.map((s) => (
        <div
          key={s.sectionId}
          id={`home-preview-section-${s.sectionId}`}
          className={`relative transition-shadow ${selectedSectionId === s.sectionId ? "outline outline-2 outline-offset-[-2px] outline-brand-600 z-10" : ""}`}
        >
          {s.sectionKey === "hero" ? <HeroPreview {...(s.content as HeroContentOverride)} /> : <HomeSectionPreview sectionKey={s.sectionKey} content={s.content} previewBreakpoint={previewBreakpoint} />}
        </div>
      ))}
      {visible.length === 0 && <p className="p-10 text-center text-[13px] text-steel-500">Every section is hidden — nothing to preview.</p>}
    </div>
  );
}

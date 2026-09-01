import { brands } from "../data/brands";

export function BrandMarquee() {
  const loop = [...brands, ...brands];
  return (
    <div className="relative overflow-hidden mask-fade-x">
      <div className="flex gap-3 w-max animate-marquee">
        {loop.map((b, i) => (
          <div
            key={`${b.slug}-${i}`}
            className="shrink-0 px-6 py-4 border border-line bg-white flex items-center justify-center min-w-[160px]"
          >
            <span className="font-display uppercase text-[15px] tracking-tightish text-ink/80">{b.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

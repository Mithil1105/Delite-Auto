type Kind = "instagram" | "facebook" | "youtube";

export function SocialIcon({ kind, className = "w-4 h-4" }: { kind: Kind; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6 };
  if (kind === "instagram") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "facebook") {
    return (
      <svg {...common}>
        <path d="M14 21v-8h3l.5-3.5H14V7.2c0-1 .3-1.7 1.8-1.7H18V2.3C17.6 2.2 16.4 2 15 2c-2.9 0-4.9 1.8-4.9 5v2.5H7V13h3.1v8H14Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2.5" y="6" width="19" height="12" rx="3.5" />
      <path d="M11 9.8v4.4l3.8-2.2Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

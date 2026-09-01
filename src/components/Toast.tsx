import { CheckCircle2 } from "lucide-react";
import { useCart } from "../context/CartContext";

export function Toast() {
  const { toast } = useCart();
  if (!toast) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 bg-ink text-white px-4 py-3 shadow-lift text-[13.5px] font-medium animate-fadeUp">
      <CheckCircle2 className="w-4 h-4 text-accent" />
      {toast}
    </div>
  );
}

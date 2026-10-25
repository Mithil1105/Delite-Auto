import { useEffect } from "react";

function setMeta(name: string, content: string, property = false) {
  const attr = property ? "property" : "name";
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/** Sets the tab title and the description / social-preview tags for a dynamic page (e.g. a blog post). */
export function usePageMeta({ title, description, image }: { title: string; description?: string; image?: string | null }) {
  useEffect(() => {
    if (!title) return;
    document.title = title;
    setMeta("og:title", title, true);
    if (description) {
      setMeta("description", description);
      setMeta("og:description", description, true);
    }
    if (image) setMeta("og:image", image.startsWith("/") ? `${window.location.origin}${image}` : image, true);
  }, [title, description, image]);
}

import { useEffect, useState } from "react";
import { listPublishedPosts } from "../services/blog/blogService";
import type { BlogPost } from "../lib/blog";

/** Live posts, newest first. `null` while loading; [] when there are none (or the lookup failed). */
export function useBlogPosts(limit = 100): BlogPost[] | null {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    listPublishedPosts(limit)
      .then((p) => !cancelled && setPosts(p))
      .catch(() => !cancelled && setPosts([]));
    return () => {
      cancelled = true;
    };
  }, [limit]);
  return posts;
}

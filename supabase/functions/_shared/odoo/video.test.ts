import { describe, expect, it } from "vitest";
import { parseStartSeconds, parseVideoUrl } from "./video";

const ID = "dQw4w9WgXcQ";

describe("parseVideoUrl — YouTube", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}&list=PL123&feature=share`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=abc123`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube-nocookie.com/embed/${ID}`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/live/${ID}`],
    [`youtube.com/watch?v=${ID}`],
    [`//www.youtube.com/embed/${ID}`],
    [`  https://youtu.be/${ID}  `],
  ])("understands %s", (input) => {
    const v = parseVideoUrl(input)!;
    expect(v.provider).toBe("youtube");
    expect(v.videoId).toBe(ID);
    expect(v.embedUrl).toBe(`https://www.youtube-nocookie.com/embed/${ID}?rel=0&modestbranding=1&playsinline=1`);
    expect(v.watchUrl).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(v.thumbnailUrl).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });

  it("keeps a start time", () => {
    const v = parseVideoUrl(`https://youtu.be/${ID}?t=1m30s`)!;
    expect(v.embedUrl).toContain("&start=90");
    expect(v.watchUrl).toBe(`https://www.youtube.com/watch?v=${ID}&t=90s`);
    expect(parseStartSeconds("90")).toBe(90);
    expect(parseStartSeconds("1h2m3s")).toBe(3723);
    expect(parseStartSeconds("abc")).toBeUndefined();
    expect(parseStartSeconds("")).toBeUndefined();
  });

  it("treats a YouTube link without a valid video id as a plain link, never an embed", () => {
    for (const input of ["https://www.youtube.com/@somechannel", "https://www.youtube.com/watch?v=short", `https://www.youtube.com/watch?v=${ID}extra`, "https://www.youtube.com/"]) {
      const v = parseVideoUrl(input)!;
      expect(v.provider).toBe("other");
      expect(v.embedUrl).toBeUndefined();
    }
  });
});

describe("parseVideoUrl — Vimeo", () => {
  it("builds a do-not-track embed", () => {
    for (const input of ["https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789", "https://vimeo.com/channels/staffpicks/123456789"]) {
      const v = parseVideoUrl(input)!;
      expect(v.provider).toBe("vimeo");
      expect(v.videoId).toBe("123456789");
      expect(v.embedUrl).toBe("https://player.vimeo.com/video/123456789?dnt=1");
      expect(v.watchUrl).toBe("https://vimeo.com/123456789");
    }
  });
  it("carries an unlisted-video hash", () => {
    const v = parseVideoUrl("https://vimeo.com/123456789/abcdef1234")!;
    expect(v.embedUrl).toBe("https://player.vimeo.com/video/123456789?dnt=1&h=abcdef1234");
    expect(v.watchUrl).toBe("https://vimeo.com/123456789/abcdef1234");
  });
});

describe("parseVideoUrl — other / unsafe input", () => {
  it("links out (no embed) for unknown sites", () => {
    const v = parseVideoUrl("https://www.dailymotion.com/video/x8abc")!;
    expect(v).toEqual({ provider: "other", watchUrl: "https://www.dailymotion.com/video/x8abc" });
  });

  it("matches hosts exactly — look-alike domains are never embedded", () => {
    for (const input of [`https://youtube.com.evil.example/watch?v=${ID}`, `https://evil.example/youtube.com/watch?v=${ID}`, `https://notyoutu.be/${ID}`, `https://youtube.evil.example/embed/${ID}`]) {
      const v = parseVideoUrl(input)!;
      expect(v.provider).toBe("other");
      expect(v.embedUrl).toBeUndefined();
      expect(v.thumbnailUrl).toBeUndefined();
    }
  });

  it("rejects non-web schemes, empty and oversized values", () => {
    for (const input of ["javascript:alert(1)", "data:text/html,<script>1</script>", "ftp://x.example/a", "", "   ", null, undefined, 42, {}, "https://x.example/" + "a".repeat(600)]) {
      expect(parseVideoUrl(input as unknown)).toBeNull();
    }
  });
});

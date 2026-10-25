import { describe, expect, it } from "vitest";
import { cleanBlocks, isLive, isValidSlug, pickBody, pickText, readingMinutes, slugify } from "./blog";

describe("cleanBlocks", () => {
  it("keeps known blocks and drops unknown / malformed ones", () => {
    const out = cleanBlocks([
      { type: "heading", text: "Hello" },
      { type: "script", text: "<script>" },
      null,
      "x",
      { type: "paragraph", text: 42 },
      { type: "quote", text: "Q", by: "Me" },
    ]);
    expect(out).toEqual([
      { type: "heading", text: "Hello" },
      { type: "paragraph", text: "" },
      { type: "quote", text: "Q", by: "Me" },
    ]);
  });

  it("only allows https or site-relative image URLs", () => {
    const out = cleanBlocks([
      { type: "image", src: "javascript:alert(1)" },
      { type: "image", src: "//evil.example/x.png" },
      { type: "image", src: "http://insecure.example/x.png" },
      { type: "image", src: "https://ok.example/x.png", alt: "A" },
      { type: "image", src: "/images/a.png" },
      { type: "gallery", images: [{ src: "data:image/png;base64,AAAA" }, { src: "https://ok.example/1.png" }] },
      { type: "gallery", images: [{ src: "ftp://x" }] },
    ]);
    expect(out).toEqual([
      { type: "image", src: "https://ok.example/x.png", alt: "A", caption: undefined },
      { type: "image", src: "/images/a.png", alt: undefined, caption: undefined },
      { type: "gallery", images: [{ src: "https://ok.example/1.png", alt: undefined }] },
    ]);
  });

  it("returns an empty list for non-arrays", () => {
    expect(cleanBlocks(undefined)).toEqual([]);
    expect(cleanBlocks({})).toEqual([]);
  });
});

describe("language fallback", () => {
  it("uses the reader's language, else English", () => {
    expect(pickText({ en: "Hello", hi: "नमस्ते" }, "hi")).toBe("नमस्ते");
    expect(pickText({ en: "Hello", hi: "  " }, "hi")).toBe("Hello");
    expect(pickText({ en: "Hello" }, "gu")).toBe("Hello");
    expect(pickText(undefined, "gu")).toBe("");
  });
  it("falls back to the English body when the language has none", () => {
    const en = [{ type: "paragraph" as const, text: "e" }];
    expect(pickBody({ en, hi: [] }, "hi")).toBe(en);
    expect(pickBody({ en, gu: [{ type: "paragraph", text: "g" }] }, "gu")).toEqual([{ type: "paragraph", text: "g" }]);
  });
});

describe("helpers", () => {
  it("slugifies titles", () => {
    expect(slugify("How to choose the RIGHT seat covers!")).toBe("how-to-choose-the-right-seat-covers");
    expect(slugify("  Café — 5 tips  ")).toBe("cafe-5-tips");
    expect(slugify("हिन्दी")).toBe("");
  });
  it("validates slugs", () => {
    expect(isValidSlug("ok-slug-1")).toBe(true);
    for (const bad of ["", "Bad", "a--b", "-a", "a-", "a b", "a/b"]) expect(isValidSlug(bad)).toBe(false);
  });
  it("estimates reading time, minimum one minute", () => {
    expect(readingMinutes([])).toBe(1);
    expect(readingMinutes([{ type: "paragraph", text: Array(600).fill("w").join(" ") }])).toBe(3);
  });
  it("treats a future published date as not live yet", () => {
    const now = Date.parse("2026-10-22T10:00:00Z");
    expect(isLive({ status: "published", publishedAt: "2026-10-22T09:00:00Z" }, now)).toBe(true);
    expect(isLive({ status: "published", publishedAt: "2026-10-23T09:00:00Z" }, now)).toBe(false);
    expect(isLive({ status: "draft", publishedAt: "2026-10-22T09:00:00Z" }, now)).toBe(false);
    expect(isLive({ status: "published", publishedAt: null }, now)).toBe(false);
  });
});

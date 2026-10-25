import { describe, expect, it } from "vitest";
import { videosFirst } from "./videosFirst";
import type { ProductMedia } from "../../data/types";

const photo = (id: string): ProductMedia => ({ id, type: "image", src: `/${id}.jpg`, alt: id });
const video = (id: string): ProductMedia => ({ id, type: "video", src: `/${id}.jpg`, alt: id, video: { provider: "youtube", watchUrl: `https://www.youtube.com/watch?v=${id}` } });

describe("videosFirst", () => {
  it("moves videos to the front and keeps each group's order", () => {
    expect(videosFirst([photo("p1"), photo("p2"), video("v1"), photo("p3"), video("v2")]).map((m) => m.id)).toEqual(["v1", "v2", "p1", "p2", "p3"]);
  });
  it("leaves a photo-only gallery untouched (same array)", () => {
    const media = [photo("a"), photo("b")];
    expect(videosFirst(media)).toBe(media);
  });
  it("handles empty and video-only galleries", () => {
    expect(videosFirst([])).toEqual([]);
    expect(videosFirst([video("v")]).map((m) => m.id)).toEqual(["v"]);
  });
});

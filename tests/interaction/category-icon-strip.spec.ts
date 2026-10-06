import { test, expect, type Page } from "@playwright/test";

/**
 * Homepage CategoryIconStrip — the Figma "category tile" design (bare product art + grey label,
 * no disc/ring/shadow), centered when it fits, horizontally scrollable from the start when it
 * doesn't. See Documentations MD/frontend-foundation-uiux-refactor.md. Asserts on measured
 * geometry (group vs container centre, slot-to-slot consistency), never fixed pixel coordinates.
 */

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
];

const slots = (page: Page) => page.locator(".category-tile-media");

async function railMetrics(page: Page) {
  return page.evaluate(() => {
    const rail = Array.from(document.querySelectorAll<HTMLElement>(".overflow-x-auto")).find((el) => el.querySelector(".category-tile-media"));
    return rail ? { overflow: rail.scrollWidth - rail.clientWidth, scrollLeft: rail.scrollLeft, arrows: rail.parentElement!.querySelectorAll("button[aria-label^='Scroll']").length } : null;
  });
}

test.describe("Homepage CategoryIconStrip", () => {
  test("renders 7 tiles: real images that load, no circle/ring styling", async ({ page }) => {
    await page.goto("/");
    await expect(slots(page).first()).toBeVisible({ timeout: 15000 });
    await expect(slots(page)).toHaveCount(7);
    await slots(page).first().scrollIntoViewIfNeeded();
    const imgs = slots(page).locator("img");
    await expect(imgs).toHaveCount(7);
    await expect.poll(() => imgs.evaluateAll((els) => els.every((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await expect(page.locator(".category-circle-photo, .category-circle-icon")).toHaveCount(0);

    const style = await slots(page).first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { radius: cs.borderRadius, shadow: cs.boxShadow, bg: cs.backgroundColor };
    });
    expect(style.shadow).toBe("none");
    expect(style.radius).toBe("0px");
    expect(style.bg).toBe("rgba(0, 0, 0, 0)");
  });

  for (const vp of VIEWPORTS) {
    test(`desktop ${vp.width}px: centered when it fits, scrolls from the start when it doesn't`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("/");
      await expect(slots(page).first()).toBeVisible({ timeout: 15000 });

      const boxes = await slots(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right, top: r.top, width: r.width, height: r.height })));
      expect(boxes).toHaveLength(7);
      expect(new Set(boxes.map((b) => Math.round(b.height))).size).toBe(1);
      expect(Math.max(...boxes.map((b) => b.top)) - Math.min(...boxes.map((b) => b.top))).toBeLessThanOrEqual(1);

      const metrics = await railMetrics(page);
      expect(metrics).not.toBeNull();
      if (metrics!.overflow <= 1) {
        // Fits: cells fill the container evenly, so the group is centered on it.
        const container = await page.locator(".container-wide").first().boundingBox();
        const groupCenter = (Math.min(...boxes.map((b) => b.left)) + Math.max(...boxes.map((b) => b.right))) / 2;
        expect(Math.abs(groupCenter - (container!.x + container!.width / 2))).toBeLessThanOrEqual(3);
        expect(metrics!.arrows).toBe(0);
      } else {
        // Doesn't fit: first tile reachable at scrollLeft 0, arrows offered.
        expect(metrics!.scrollLeft).toBe(0);
        expect(boxes[0].left).toBeGreaterThanOrEqual(0);
        expect(metrics!.arrows).toBeGreaterThan(0);
      }
    });
  }

  test("mobile 390px: scrolls horizontally from the first tile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(slots(page).first()).toBeVisible({ timeout: 15000 });
    await slots(page).first().scrollIntoViewIfNeeded();
    await expect(slots(page).first()).toBeInViewport();
    const metrics = await railMetrics(page);
    expect(metrics!.overflow).toBeGreaterThan(0);
    expect(metrics!.scrollLeft).toBe(0);
  });

  test("hover changes label colour only — no geometry change, no ring/shadow/transform", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const first = slots(page).first();
    await expect(first).toBeVisible({ timeout: 15000 });
    await first.scrollIntoViewIfNeeded();
    const link = page.locator("a:has(.category-tile-media)").first();

    const read = () =>
      link.evaluate((a) => {
        const media = a.querySelector(".category-tile-media") as HTMLElement;
        const img = media.querySelector("img") as HTMLElement;
        const label = a.querySelector(".category-strip-label") as HTMLElement;
        const r = (el: HTMLElement) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
        return {
          geo: [r(media), r(img), r(label)],
          shadow: [getComputedStyle(media).boxShadow, getComputedStyle(img).boxShadow, getComputedStyle(a).boxShadow],
          outline: getComputedStyle(a).outlineStyle,
          transform: [getComputedStyle(media).transform, getComputedStyle(img).transform],
          labelColor: getComputedStyle(label).color,
        };
      });

    const before = await read();
    await link.hover();
    await page.waitForTimeout(250);
    const after = await read();

    expect(after.geo).toEqual(before.geo);
    expect(after.shadow).toEqual(before.shadow);
    expect(after.transform).toEqual(before.transform);
    expect(after.outline).toBe(before.outline);
    expect(after.outline).toBe("none");
  });
});

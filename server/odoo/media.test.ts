import { describe, expect, it } from "vitest";
import { isWhitelistedMediaRequest, resolveOdooMediaUrl } from "./media";

describe("resolveOdooMediaUrl", () => {
  it("builds a same-origin proxy URL, defaulting to product.template/image_1920", () => {
    expect(resolveOdooMediaUrl(442)).toBe("/api/catalog/media/product.template/442/image_1920");
  });

  it("honors an explicit field/model", () => {
    expect(resolveOdooMediaUrl(901, "image_512", "product.product")).toBe("/api/catalog/media/product.product/901/image_512");
  });
});

describe("isWhitelistedMediaRequest", () => {
  it("accepts a whitelisted model/field pair", () => {
    expect(isWhitelistedMediaRequest("product.template", "image_1920")).toBe(true);
    expect(isWhitelistedMediaRequest("product.product", "image_256")).toBe(true);
  });

  it("rejects an unrelated model — the proxy must not become a general Odoo record reader", () => {
    expect(isWhitelistedMediaRequest("res.partner", "image_1920")).toBe(false);
  });

  it("rejects a field that isn't one of the known image sizes", () => {
    expect(isWhitelistedMediaRequest("product.template", "list_price")).toBe(false);
  });
});

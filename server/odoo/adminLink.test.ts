import { describe, expect, it } from "vitest";
import { buildOdooAdminUrl } from "./adminLink";

describe("buildOdooAdminUrl", () => {
  it("builds the modern (17.0+) record URL by default", () => {
    expect(buildOdooAdminUrl("https://store.odoo.com", "product.template", 442)).toBe(
      "https://store.odoo.com/odoo/product.template/442"
    );
  });

  it("builds the legacy (<=16.0) record URL when requested", () => {
    expect(buildOdooAdminUrl("https://store.odoo.com", "product.template", 442, "legacy")).toBe(
      "https://store.odoo.com/web#model=product.template&id=442&view_type=form"
    );
  });

  it("strips a trailing slash from the base URL", () => {
    expect(buildOdooAdminUrl("https://store.odoo.com/", "product.template", 442)).toBe(
      "https://store.odoo.com/odoo/product.template/442"
    );
  });
});

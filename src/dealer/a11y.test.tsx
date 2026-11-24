// @vitest-environment jsdom
// Automated accessibility check (axe-core, WCAG 2.0/2.1 A + AA) of the dealer portal's public pages.
// jsdom cannot compute real colours, so the colour-contrast rule is skipped here; contrast was set by
// design tokens and still needs a browser pass. Everything else axe can detect statically is enforced.

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { DealerAuthProvider } from "./DealerAuth";
import { PortalBrandProvider } from "./lib/portalBrand";
import { DealerNotFound, ForgotPassword, Landing, Login, PublicContact, SetPassword } from "./pages/public";

async function violations(element: React.ReactElement): Promise<string[]> {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <PortalBrandProvider>
        <DealerAuthProvider>{element}</DealerAuthProvider>
      </PortalBrandProvider>
    </MemoryRouter>,
  );
  document.documentElement.lang = "en";
  document.title = "Dealer portal";
  document.body.innerHTML = `<div id="root">${html}</div>`;
  const result = await axe.run(document.body, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"], rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes[0]?.html.slice(0, 120)}`);
}

describe("dealer public pages meet WCAG A/AA static checks", () => {
  const pages: [string, React.ReactElement][] = [
    ["landing", <Landing />],
    ["login", <Login />],
    ["forgot password", <ForgotPassword />],
    ["invite / set password", <SetPassword mode="invite" />],
    ["contact", <PublicContact />],
    ["not found", <DealerNotFound />],
  ];
  for (const [name, el] of pages) {
    it(name, async () => {
      expect(await violations(el)).toEqual([]);
    });
  }
});

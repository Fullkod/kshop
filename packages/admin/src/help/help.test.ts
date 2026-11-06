import { describe, expect, it } from "vitest";
import { helpContent } from "./content";
import { helpContentRaw } from "./content/raw";
import { helpToMarkdown } from "./generators/markdown";
import { helpToIndex, searchHelp } from "./generators/search-index";
import { helpContextForPath } from "./lib/context";
import { articleAnchor, inScope, visibleTo } from "./lib/help-utils";
import { VOSEO, validateHelpContent } from "./schemas/help";
import { HELP_CONTEXTS, type HelpContent } from "./types";

const clone = (): HelpContent => structuredClone(helpContentRaw);

describe("help content", () => {
  it("is valid as written", () => {
    expect(helpContent.articles.length).toBeGreaterThanOrEqual(20);
  });

  it("has at least one guide for every screen with a «?»", () => {
    const covered = new Set(helpContent.articles.flatMap((a) => a.contexts ?? []));
    expect(HELP_CONTEXTS.filter((c) => !covered.has(c))).toEqual([]);
  });

  it("covers the three audiences", () => {
    for (const audience of ["owner", "staff", "superadmin"] as const) {
      expect(helpContent.articles.some((a) => a.audiences.includes(audience))).toBe(true);
    }
  });

  it("rejects a related guide that does not exist", () => {
    const c = clone();
    c.articles[0]!.related = ["no-such-guide"];
    expect(() => validateHelpContent(c)).toThrow(/no-such-guide/);
  });

  it("rejects an undeclared screenshot and an unused one", () => {
    const c = clone();
    c.articles[0]!.steps[0]!.screenshot = "missing-shot";
    c.screenshots.push({ slug: "orphan-shot", description: "x", route: "/admin", viewport: "desktop" });
    expect(() => validateHelpContent(c)).toThrow(/missing-shot[\s\S]*orphan-shot/);
  });

  it("rejects a guide with one step and duplicated slugs", () => {
    const c = clone();
    c.articles[0]!.steps = c.articles[0]!.steps.slice(0, 1);
    c.articles.push({ ...c.articles[1]! });
    expect(() => validateHelpContent(c)).toThrow(/al menos dos pasos[\s\S]*duplicada/);
  });

  it("rejects routes outside the admin and the superadmin", () => {
    const c = clone();
    c.firstDay[0]!.link = "/cart";
    expect(() => validateHelpContent(c)).toThrow(/ruta del admin/);
  });

  it("flags voseo but not «tú» forms", () => {
    expect(VOSEO.test("Si querés, guardá la foto")).toBe(true);
    expect(VOSEO.test("Si quieres, sube la foto y pulsa «Guardar»")).toBe(false);
    expect(VOSEO.test("Subí un producto y no sale")).toBe(false);
    const c = clone();
    c.faq[0]!.answer = "Mirá el estado del producto.";
    expect(() => validateHelpContent(c)).toThrow(/voseo/);
  });
});

describe("help context and audiences", () => {
  it("maps each screen path to its context", () => {
    const cases: [string, string][] = [
      ["/admin", "home"],
      ["/admin/orders", "orders"],
      ["/admin/orders/3f1c2b9a-1111-4222-8333-444455556666", "order"],
      ["/admin/orders/new", "order-new"],
      ["/admin/orders/customers", "customers"],
      ["/admin/catalog", "products"],
      ["/admin/catalog/products/new", "product"],
      ["/admin/catalog/product-types", "product-types"],
      ["/admin/themes/banners", "themes-banners"],
      ["/admin/themes", "themes"],
      ["/admin/finance/margin", "finance-margin"],
      ["/admin/discounts/vouchers", "vouchers"],
      ["/admin/whatsapp-notifications/log", "whatsapp-log"],
      ["/admin/pos", "pos"],
      ["/admin/pos/closings", "pos-closings"],
      ["/admin/sales", "sales-today"],
      ["/admin/more", "home"],
      ["/admin/team/", "team"],
      ["/superadmin", "superadmin-stores"],
      ["/superadmin/stores/new", "superadmin-store-new"],
      ["/superadmin/stores/abc", "superadmin-store"],
      ["/superadmin/plans", "superadmin-plans"],
    ];
    for (const [path, context] of cases) expect([path, helpContextForPath(path)]).toEqual([path, context]);
  });

  it("shows owners the staff's guides, but not the other way round", () => {
    expect(visibleTo(["staff"], "owner")).toBe(true);
    expect(visibleTo(["owner"], "staff")).toBe(false);
    expect(visibleTo(["owner", "staff"], "superadmin")).toBe(false);
    expect(inScope(["superadmin"], "store")).toBe(false);
    expect(inScope(["owner"], "superadmin")).toBe(false);
  });
});

describe("help generators", () => {
  it("writes every guide with its anchor, and filters by audience", () => {
    const all = helpToMarkdown(helpContent);
    for (const a of helpContent.articles.filter((x) => inScope(x.audiences, "store")))
      expect(all).toContain(`<a id="${articleAnchor(a.slug)}"></a>`);

    expect(all).not.toContain("Quiero dar de alta una tienda");

    const staff = helpToMarkdown(helpContent, { audience: "staff" });
    expect(staff).toContain("# Ayuda de Kshop: Empleado");
    expect(staff).not.toContain("Tengo el catálogo en un Excel");
    expect(staff).toContain("Quiero vender en el mostrador");

    const root = helpToMarkdown(helpContent, { scope: "superadmin" });
    expect(root).toContain("Quiero dar de alta una tienda");
    expect(root).not.toContain("Quiero vender en el mostrador");
    expect(root).not.toContain("Tu primer día");
  });

  it("prefixes screenshots with the given base", () => {
    const md = helpToMarkdown(helpContent, { screenshotBase: "https://kshop.fullkod.com/" });
    expect(md).toContain("](https://kshop.fullkod.com/help/screens/");
  });

  it("finds guides by title and keywords, ignoring accents", () => {
    const index = helpToIndex(helpContent);
    expect(searchHelp(index, "excel")[0]?.slug).toBe("excel-catalog");
    expect(searchHelp(index, "vender mostrador")[0]?.slug).toBe("counter-sale");
    expect(searchHelp(index, "candado")[0]?.slug).toBe("missing-section");
    expect(searchHelp(index, "catalogo").length).toBeGreaterThan(0);
    expect(searchHelp(index, "de la")).toEqual([]);
  });
});

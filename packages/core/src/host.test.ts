import { describe, expect, it } from "vitest";
import { parseHost } from "./host";

const LOCAL = "kshop.localhost:3000";
const PROD = "kshop.fullkod.com";

describe("parseHost", () => {
  it("recognizes the platform host", () => {
    expect(parseHost("kshop.localhost:3000", LOCAL)).toEqual({ kind: "platform" });
    expect(parseHost("KShop.Fullkod.com", PROD)).toEqual({ kind: "platform" });
    expect(parseHost("www.kshop.fullkod.com", PROD)).toEqual({ kind: "platform" });
  });

  it("extracts the store slug from a subdomain", () => {
    expect(parseHost("tienda-a.kshop.localhost:3000", LOCAL)).toEqual({ kind: "store", slug: "tienda-a" });
    expect(parseHost("klaushop.kshop.fullkod.com", PROD)).toEqual({ kind: "store", slug: "klaushop" });
  });

  it("does not treat nested or invalid subdomains as stores", () => {
    expect(parseHost("a.b.kshop.fullkod.com", PROD).kind).toBe("custom");
    expect(parseHost("-bad.kshop.fullkod.com", PROD).kind).toBe("custom");
  });

  it("treats other hosts as custom domains", () => {
    expect(parseHost("klaushop.com", PROD)).toEqual({ kind: "custom", host: "klaushop.com" });
    // Same subdomain on a different port is not the local platform.
    expect(parseHost("tienda-a.kshop.localhost:4000", LOCAL).kind).toBe("custom");
  });
});

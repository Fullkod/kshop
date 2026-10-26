import { describe, expect, it } from "vitest";
import { customDomainInputSchema } from "./custom-domain";
import { hostWithoutPort, parseHost, storePublicOrigin } from "./host";

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

describe("storePublicOrigin", () => {
  it("uses the subdomain without a live custom domain", () => {
    expect(storePublicOrigin({ slug: "tienda-a" }, PROD, "https")).toBe("https://tienda-a.kshop.fullkod.com");
    expect(storePublicOrigin({ slug: "tienda-a", customDomain: null }, LOCAL, "http")).toBe(
      "http://tienda-a.kshop.localhost:3000",
    );
  });

  it("uses the custom domain, with the local port in dev", () => {
    expect(storePublicOrigin({ slug: "a", customDomain: "mitienda.com" }, PROD, "https")).toBe(
      "https://mitienda.com",
    );
    expect(storePublicOrigin({ slug: "a", customDomain: "mitienda.localhost" }, LOCAL, "http")).toBe(
      "http://mitienda.localhost:3000",
    );
  });

  it("strips the port of a host", () => {
    expect(hostWithoutPort("MiTienda.localhost:3000")).toBe("mitienda.localhost");
    expect(hostWithoutPort("mitienda.com")).toBe("mitienda.com");
  });
});

describe("customDomainInputSchema", () => {
  const parse = (domain: string) => customDomainInputSchema.safeParse({ domain });

  it("normalizes what the owner pastes", () => {
    expect(parse("https://WWW.MiTienda.com/inicio").data?.domain).toBe("mitienda.com");
    expect(parse("tienda.mi-negocio.cu.").data?.domain).toBe("tienda.mi-negocio.cu");
  });

  it("rejects what is not a domain", () => {
    expect(parse("mitienda").success).toBe(false);
    expect(parse("mi tienda.com").success).toBe(false);
    expect(parse("-mal.com").success).toBe(false);
  });
});

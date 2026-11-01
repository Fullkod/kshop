import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readCachedAdminState } from "./admin-context";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("readCachedAdminState", () => {
  it("fills the fields an older deploy did not save (the menu crashed on `upgrades`)", () => {
    store.set(
      "kshop.admin.u1.s1",
      JSON.stringify({
        role: "owner",
        enabledModules: ["orders", "not_a_module"],
        isSuperadmin: false,
        storeStatus: "active",
        savedAt: Date.now(),
      }),
    );
    const state = readCachedAdminState("u1", "s1");
    expect(state?.upgrades).toEqual({});
    expect(state?.addonPrices).toEqual({});
    expect(state?.sections).toEqual({});
    expect(state?.stores).toEqual([]);
    expect([...(state?.enabledModules ?? [])]).toEqual(["orders"]);
  });

  it("ignores a copy that is too old or not a boot", () => {
    store.set(
      "kshop.admin.u1.old",
      JSON.stringify({ enabledModules: [], savedAt: Date.now() - 2 * 86_400_000 }),
    );
    store.set("kshop.admin.u1.bad", JSON.stringify({ savedAt: Date.now() }));
    expect(readCachedAdminState("u1", "old")).toBeNull();
    expect(readCachedAdminState("u1", "bad")).toBeNull();
  });
});

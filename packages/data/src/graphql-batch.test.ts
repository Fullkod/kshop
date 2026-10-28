import { parse } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { canBatch, createBatchingFetch, mergeRequests, splitData } from "./graphql-batch";

const productQuery = `query P($id: UUID!) { productsCollection(filter: { id: { eq: $id } }) { edges { node { ...Card } } } }
  fragment Card on Products { id name }`;
const ordersQuery = `query O($storeId: UUID!, $first: Int) { ordersCollection(filter: { storeId: { eq: $storeId } }, first: $first) { totalCount } list: storesCollection { edges { node { id } } } }`;

describe("mergeRequests", () => {
  it("prefixes root fields, variables and fragments so the requests cannot collide", () => {
    const merged = mergeRequests([
      { query: productQuery, variables: { id: "p1" } },
      { query: ordersQuery, variables: { storeId: "s1", first: 5 } },
    ]);
    expect(() => parse(merged.query)).not.toThrow();
    expect(merged.query).toContain("b0_productsCollection: productsCollection");
    expect(merged.query).toContain("fragment b0_Card on Products");
    expect(merged.query).toContain("...b0_Card");
    expect(merged.query).toContain("b1_ordersCollection: ordersCollection");
    expect(merged.query).toContain("b1_list: storesCollection");
    expect(merged.query).toContain("$b0_id: UUID!");
    expect(merged.query).toContain("$b1_first: Int");
    expect(merged.variables).toEqual({ b0_id: "p1", b1_storeId: "s1", b1_first: 5 });
  });

  it("the same query twice stays apart (different prefixes)", () => {
    const merged = mergeRequests([
      { query: productQuery, variables: { id: "a" } },
      { query: productQuery, variables: { id: "b" } },
    ]);
    expect(merged.query).toContain("fragment b0_Card");
    expect(merged.query).toContain("fragment b1_Card");
    expect(merged.variables).toEqual({ b0_id: "a", b1_id: "b" });
  });
});

describe("splitData / canBatch", () => {
  it("gives each request back its own keys", () => {
    const data = { b0_productsCollection: 1, b1_ordersCollection: 2, b1_list: 3 };
    expect(splitData(data, "b0_")).toEqual({ productsCollection: 1 });
    expect(splitData(data, "b1_")).toEqual({ ordersCollection: 2, list: 3 });
  });
  it("never merges mutations or broken documents", () => {
    expect(canBatch({ query: productQuery })).toBe(true);
    expect(canBatch({ query: "mutation { x }" })).toBe(false);
    expect(canBatch({ query: "query {" })).toBe(false);
  });
});

const ok = (payload: unknown) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
const post = (query: string, variables?: Record<string, unknown>) => ({
  method: "POST",
  body: JSON.stringify({ query, variables }),
});

describe("createBatchingFetch", () => {
  it("sends the queries of one moment as one request and splits the answer", async () => {
    const base = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const { query } = JSON.parse(String(init?.body));
      expect(query).toContain("b0_productsCollection");
      expect(query).toContain("b1_ordersCollection");
      return ok({ data: { b0_productsCollection: "P", b1_ordersCollection: "O", b1_list: "L" } });
    });
    const f = createBatchingFetch(base as unknown as typeof fetch);
    const [a, b] = await Promise.all([
      f("https://x/graphql/v1", post(productQuery, { id: "p1" })),
      f("https://x/graphql/v1", post(ordersQuery, { storeId: "s1" })),
    ]);
    expect(base).toHaveBeenCalledTimes(1);
    expect(await a.json()).toEqual({ data: { productsCollection: "P" } });
    expect(await b.json()).toEqual({ data: { ordersCollection: "O", list: "L" } });
  });

  it("sends identical requests once and answers both", async () => {
    const base = vi.fn(async () => ok({ data: { productsCollection: "P" } }));
    const f = createBatchingFetch(base as unknown as typeof fetch);
    const [a, b] = await Promise.all([
      f("https://x/graphql/v1", post(productQuery, { id: "p1" })),
      f("https://x/graphql/v1", post(productQuery, { id: "p1" })),
    ]);
    expect(base).toHaveBeenCalledTimes(1);
    expect(await a.json()).toEqual({ data: { productsCollection: "P" } });
    expect(await b.json()).toEqual({ data: { productsCollection: "P" } });
  });

  it("on GraphQL errors resends one by one, so each caller gets its own result", async () => {
    const base = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const { query } = JSON.parse(String(init?.body));
      if (query.includes("b0_")) return ok({ data: null, errors: [{ message: "boom" }] });
      return query.includes("productsCollection")
        ? ok({ data: null, errors: [{ message: "boom" }] })
        : ok({ data: { ordersCollection: "O" } });
    });
    const f = createBatchingFetch(base as unknown as typeof fetch);
    const [a, b] = await Promise.all([
      f("https://x/graphql/v1", post(productQuery, { id: "p1" })),
      f("https://x/graphql/v1", post(ordersQuery, { storeId: "s1" })),
    ]);
    expect(base).toHaveBeenCalledTimes(3);
    expect((await a.json()).errors[0].message).toBe("boom");
    expect(await b.json()).toEqual({ data: { ordersCollection: "O" } });
  });

  it("an HTTP failure (e.g. 57014) reaches every caller of the batch", async () => {
    const base = vi.fn(async () => new Response(JSON.stringify({ code: "57014" }), { status: 500 }));
    const f = createBatchingFetch(base as unknown as typeof fetch);
    const [a, b] = await Promise.all([
      f("https://x/graphql/v1", post(productQuery, { id: "p1" })),
      f("https://x/graphql/v1", post(ordersQuery, { storeId: "s1" })),
    ]);
    expect(base).toHaveBeenCalledTimes(1);
    expect([a.status, b.status]).toEqual([500, 500]);
  });

  it("mutations go straight through", async () => {
    const base = vi.fn(async () => ok({ data: {} }));
    const f = createBatchingFetch(base as unknown as typeof fetch);
    await f("https://x/graphql/v1", post("mutation { x }"));
    expect(base).toHaveBeenCalledTimes(1);
  });
});

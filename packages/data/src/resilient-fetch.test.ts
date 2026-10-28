import { describe, expect, it, vi } from "vitest";
import { createResilientFetch, RequestTimeoutError } from "./resilient-fetch";

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

const noDelay = () => 0;

describe("createResilientFetch", () => {
  it("retries a read once after a 5xx", async () => {
    const base = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 500))
      .mockResolvedValueOnce(json({ data: 1 }));
    const res = await createResilientFetch(base, { canRetry: () => true, retryDelayMs: noDelay })("/x");
    expect(base).toHaveBeenCalledTimes(2);
    expect(await res.json()).toEqual({ data: 1 });
  });

  it("retries a read once after a GraphQL statement timeout (57014) inside a 200", async () => {
    const base = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({ errors: [{ message: "canceling statement due to statement timeout (57014)" }] }),
      )
      .mockResolvedValueOnce(json({ data: { ok: true } }));
    const res = await createResilientFetch(base, { canRetry: () => true, retryDelayMs: noDelay })("/x");
    expect(base).toHaveBeenCalledTimes(2);
    expect(await res.json()).toEqual({ data: { ok: true } });
  });

  it("never retries more than once", async () => {
    const base = vi.fn<typeof fetch>().mockImplementation(async () => json({}, 503));
    const res = await createResilientFetch(base, { canRetry: () => true, retryDelayMs: noDelay })("/x");
    expect(base).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(503);
  });

  it("does not retry what may not be retried (writes) nor deterministic errors", async () => {
    const write = vi.fn<typeof fetch>().mockResolvedValue(json({}, 500));
    await createResilientFetch(write, { canRetry: () => false, retryDelayMs: noDelay })("/x", {
      method: "POST",
    });
    expect(write).toHaveBeenCalledTimes(1);

    const notFound = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ errors: [{ message: "Unknown field" }] }));
    await createResilientFetch(notFound, { canRetry: () => true, retryDelayMs: noDelay })("/x");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("retries a read once after a network failure", async () => {
    const base = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json({ data: 1 }));
    await createResilientFetch(base, { canRetry: () => true, retryDelayMs: noDelay })("/x");
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("gives up with RequestTimeoutError after the limit and does not retry", async () => {
    const base = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
          ),
      );
    const call = createResilientFetch(base, { timeoutMs: 20, canRetry: () => true, retryDelayMs: noDelay })(
      "/x",
    );
    await expect(call).rejects.toBeInstanceOf(RequestTimeoutError);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("does not retry after the caller aborts", async () => {
    const controller = new AbortController();
    const base = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
          ),
      );
    const call = createResilientFetch(base, { canRetry: () => true, retryDelayMs: noDelay })("/x", {
      signal: controller.signal,
    });
    controller.abort();
    await expect(call).rejects.toMatchObject({ name: "AbortError" });
    expect(base).toHaveBeenCalledTimes(1);
  });
});

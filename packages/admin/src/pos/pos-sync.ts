"use client";

import { POS_BATCH_SIZE } from "@kshop/core";
import { ApiError, type ApiClient } from "@kshop/data";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../session";
import { usePosStorage } from "./PosStatus";
import type { PosStorage, QueuedSale } from "./storage";

// The queue of the phone (PRP pos-offline, phase 5). A sale leaves the queue only with the server's confirmation; a
// refusal keeps it with the reason in view; silence just waits for the next try, which is safe because repeating a sale
// returns the same order.

const RETRY_MS = 60_000;
/** Uploaded sales stay this long for the summary of the day; after that the server is the only copy. */
const KEEP_UPLOADED_MS = 7 * 24 * 60 * 60 * 1000;

export type UploadResult = { uploaded: number; held: number; unreachable: boolean };

export async function uploadPosQueue(
  api: ApiClient,
  storage: PosStorage,
  storeId: string,
  now: () => string = () => new Date().toISOString(),
): Promise<UploadResult> {
  const queue = (await storage.listSales(storeId))
    .filter((s) => !s.uploaded)
    .sort((a, b) => a.sale.soldAt.localeCompare(b.sale.soldAt));
  const result: UploadResult = { uploaded: 0, held: 0, unreachable: false };

  for (let i = 0; i < queue.length; i += POS_BATCH_SIZE) {
    const batch = queue.slice(i, i + POS_BATCH_SIZE);
    let answers;
    try {
      answers = (await api.pos(storeId).uploadSales(batch.map((s) => s.sale))).results;
    } catch (error) {
      // A refusal of the whole request (suspended store, module off, no session): every sale waits with the reason.
      if (error instanceof ApiError && error.status < 500) {
        const held = { code: error.code, message: error.message, at: now() };
        for (const queued of queue.slice(i)) await storage.putSale(storeId, { ...queued, held });
        result.held += queue.length - i;
      } else {
        result.unreachable = true;
      }
      return result;
    }
    for (const answer of answers) {
      const queued = batch.find((s) => s.sale.id === answer.id);
      if (!queued) continue;
      if (answer.status === "recorded") {
        const { held: _held, ...rest } = queued;
        await storage.putSale(storeId, {
          ...rest,
          uploaded: { orderId: answer.orderId, number: answer.number, at: now() },
        });
        result.uploaded += 1;
      } else {
        await storage.putSale(storeId, {
          ...queued,
          held: { code: answer.code, message: answer.message, at: now() },
        });
        result.held += 1;
      }
    }
  }
  return result;
}

export function usePosSales(storeId: string, online: boolean) {
  const { api, session } = useSession();
  const storage = usePosStorage();
  const [sales, setSales] = useState<QueuedSale[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const running = useRef(false);

  const reload = useCallback(async () => {
    const all = await storage.listSales(storeId);
    const cutoff = Date.now() - KEEP_UPLOADED_MS;
    const kept: QueuedSale[] = [];
    for (const sale of all) {
      if (sale.uploaded && new Date(sale.uploaded.at).getTime() < cutoff) {
        await storage.removeSale(storeId, sale.sale.id);
      } else kept.push(sale);
    }
    setSales(kept);
  }, [storage, storeId]);

  const canUpload = online && !!session;

  const sync = useCallback(async () => {
    if (!canUpload || running.current) return;
    running.current = true;
    setSyncing(true);
    try {
      await uploadPosQueue(api, storage, storeId);
    } catch {
      // The phone's own storage failed: the sales stay where they are and the next try reads them again.
    } finally {
      running.current = false;
      setSyncing(false);
      await reload().catch(() => {});
    }
  }, [api, canUpload, reload, storage, storeId]);

  useEffect(() => {
    void Promise.resolve()
      .then(reload)
      .catch(() => setSales([]));
  }, [reload]);

  // When the connection comes back, and every minute in case a try failed or a refusal was solved.
  useEffect(() => {
    if (!canUpload) return;
    void Promise.resolve().then(sync);
    const timer = setInterval(() => void sync(), RETRY_MS);
    return () => clearInterval(timer);
  }, [canUpload, sync]);

  /** Saved first; the upload is a bonus that can fail. The caller only needs the first await to know it is safe. */
  const saved = useCallback(async () => {
    await reload();
    void sync();
  }, [reload, sync]);

  /** A sale still on the phone goes up cancelled: the owner sees the trace (D12). */
  const voidSale = useCallback(
    async (queued: QueuedSale) => {
      await storage.putSale(storeId, { ...queued, sale: { ...queued.sale, voided: true } });
      await saved();
    },
    [saved, storage, storeId],
  );

  return { sales, syncing, canUpload, sync, saved, voidSale };
}

"use client";

import { Alert, Button, Card } from "@kshop/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "../session";
import {
  createIndexedDbPosStorage,
  downloadPosCatalog,
  type PosCatalogSnapshot,
  type PosStorage,
} from "./storage";

/** A catalog older than this is refreshed by itself when there is a connection. */
const STALE_MS = 60 * 60 * 1000;

let webStorage: PosStorage | undefined;

export function usePosStorage(): PosStorage {
  const { config } = useSession();
  return config.posStorage ?? (webStorage ??= createIndexedDbPosStorage());
}

export function usePosCatalog(storeId: string, online: boolean) {
  const { api } = useSession();
  const storage = usePosStorage();
  const [snapshot, setSnapshot] = useState<PosCatalogSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setFailed(false);
    try {
      const next = await downloadPosCatalog(api, storeId);
      await storage.writeCatalog(next);
      setSnapshot(next);
    } catch {
      // What is saved stays: a failed download never empties the counter.
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, [api, storage, storeId]);

  useEffect(() => {
    let cancelled = false;
    void storage
      .readCatalog(storeId)
      .catch(() => null)
      .then((saved) => {
        if (cancelled) return;
        setSnapshot(saved);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storage, storeId]);

  useEffect(() => {
    if (!loaded || !online) return;
    if (!snapshot || Date.now() - new Date(snapshot.savedAt).getTime() > STALE_MS)
      void Promise.resolve().then(refresh);
    // Once per load or reconnection, not after each download.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, online]);

  return { snapshot, loaded, refreshing, failed, refresh };
}

function catalogAge(savedAt: string): string {
  const saved = new Date(savedAt);
  const time = saved.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  const days = Math.floor(
    (new Date().setHours(0, 0, 0, 0) - new Date(saved).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (days === 0) return `de hoy, ${time}`;
  if (days === 1) return `de ayer, ${time}`;
  return `de hace ${days} días`;
}

/** What the phone holds for the counter (phase 3 of the POS; the selling screen comes on top of this). */
export function PosStatus({ storeId, online }: { storeId: string; online: boolean }) {
  const storage = usePosStorage();
  const { snapshot, loaded, refreshing, failed, refresh } = usePosCatalog(storeId, online);
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void storage.listSales(storeId).then(
      (sales) => !cancelled && setPending(sales.length),
      () => !cancelled && setPending(null),
    );
    return () => {
      cancelled = true;
    };
  }, [storage, storeId]);

  const products = useMemo(() => snapshot?.items.length ?? 0, [snapshot]);

  return (
    <Card className="flex flex-col gap-3" data-testid="pos-status">
      <h2 className="text-lg font-semibold">Caja</h2>
      {!online && (
        <Alert data-testid="pos-offline">Sin conexión. Lo guardado en este teléfono sigue disponible.</Alert>
      )}
      {!loaded ? (
        <p className="text-sm text-muted-foreground">Leyendo el teléfono…</p>
      ) : snapshot ? (
        <p className="text-sm" data-testid="pos-catalog">
          Catálogo {catalogAge(snapshot.savedAt)}: {products} productos.
        </p>
      ) : (
        <Alert variant="destructive" data-testid="pos-no-catalog">
          Este teléfono aún no tiene el catálogo.{" "}
          {online ? "Descárgalo para vender." : "Conéctalo a internet una vez."}
        </Alert>
      )}
      {failed && <Alert variant="destructive">No se pudo actualizar el catálogo. Sigue el anterior.</Alert>}
      {pending !== null && (
        <p className="text-sm" data-testid="pos-pending">
          Ventas sin subir: {pending}
        </p>
      )}
      <Button
        variant="outline"
        className="self-start"
        disabled={!online || refreshing}
        onClick={() => void refresh()}
      >
        {refreshing ? "Actualizando…" : "Actualizar catálogo"}
      </Button>
    </Card>
  );
}

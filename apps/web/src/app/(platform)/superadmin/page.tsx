"use client";

import { formatUsd, type StoreStatus } from "@kshop/core";
import { useRealtimeVersion } from "@kshop/admin";
import { ApiError, type PlatformStore } from "@kshop/data";
import {
  Alert,
  Badge,
  Card,
  Chip,
  CircleCheck,
  CirclePause,
  Clock,
  Ellipsis,
  Input,
  type LucideIcon,
  Receipt,
  Search,
  Select,
} from "@kshop/ui";
import Link from "next/link";
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { formatDate, STORE_STATUS_LABELS, storeUrl, SUBSCRIPTION_STATUS_LABELS } from "@/lib/format";
import { useSession } from "@/lib/session";
import { OwnerAccess } from "./OwnerAccess";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The date the store's plan runs out: the end of the trial, else of the paid period. */
function endsAt(store: PlatformStore): string | null {
  return store.subscriptionStatus === "trialing" ? store.trialEndsAt : store.currentPeriodEnd;
}

function endsSoon(store: PlatformStore, now: number): boolean {
  const end = endsAt(store);
  return end !== null && new Date(end).getTime() - now <= 7 * DAY_MS;
}

type Filters = {
  q: string;
  status: "" | StoreStatus;
  plan: string;
  subscription: string;
  owes: boolean;
  soon: boolean;
};

const NO_FILTERS: Filters = { q: "", status: "", plan: "", subscription: "", owes: false, soon: false };

function matches(store: PlatformStore, f: Filters, now: number): boolean {
  const q = f.q.trim().toLowerCase();
  if (q && ![store.name, store.slug, store.owner?.email ?? ""].some((v) => v.toLowerCase().includes(q))) {
    return false;
  }
  if (f.status && store.status !== f.status) return false;
  if (f.plan && store.plan?.code !== f.plan) return false;
  if (f.subscription && store.subscriptionStatus !== f.subscription) return false;
  if (f.owes && store.amountDue <= 0) return false;
  if (f.soon && !endsSoon(store, now)) return false;
  return true;
}

// Superadmin › Tiendas (R12): every store with what matters to bill and support it, read in one statement
// (platform_stores_overview); search, filters and the actions of each store from its row.
export default function SuperadminStoresPage() {
  const { api } = useSession();
  const [stores, setStores] = useState<PlatformStore[] | null>(null);
  // When the list was read: «vence en 7 días» and late invoices are measured from it (no clock in render).
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [accessFor, setAccessFor] = useState<PlatformStore | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  // New stores, status changes and payments show on their own (Realtime).
  const live = useRealtimeVersion("platform");

  useEffect(() => {
    let cancelled = false;
    api.platform
      .listStores()
      .then(({ stores: list }) => {
        if (cancelled) return;
        setNow(Date.now());
        setStores(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "No se pudieron cargar las tiendas.");
      });
    return () => {
      cancelled = true;
    };
  }, [api, live]);

  async function setStatus(store: PlatformStore, status: StoreStatus) {
    setBusyId(store.id);
    setError(null);
    try {
      const { store: updated } = await api.platform.updateStoreStatus(store.id, status);
      setStores((current) => current?.map((s) => (s.id === updated.id ? updated : s)) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cambiar el estado.");
    } finally {
      setBusyId(null);
    }
  }

  const plans = useMemo(
    () => [...new Map((stores ?? []).flatMap((s) => (s.plan ? [[s.plan.code, s.plan.name]] : []))).entries()],
    [stores],
  );
  const shown = useMemo(() => (stores ?? []).filter((s) => matches(s, filters, now)), [stores, filters, now]);
  const owed = (stores ?? []).filter((s) => s.amountDue > 0);
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const actions = (store: PlatformStore) => (
    <StoreActions
      store={store}
      busy={busyId === store.id}
      onStatus={(status) => void setStatus(store, status)}
      onAccess={() => setAccessFor(store)}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Tiendas</h1>
        <p className="text-sm text-muted-foreground">
          Alta, plan, cobro y actividad de cada tienda de la plataforma.
        </p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {stores && stores.length > 0 && (
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4" data-testid="superadmin-kpis">
          <Kpi
            icon={CircleCheck}
            label="Activas"
            value={stores.filter((s) => s.status === "active").length}
            filled
          />
          <Kpi
            icon={Clock}
            label="En prueba"
            value={stores.filter((s) => s.subscriptionStatus === "trialing").length}
          />
          <Kpi
            icon={CirclePause}
            label="Suspendidas"
            value={stores.filter((s) => s.status === "suspended").length}
          />
          <Kpi
            icon={Receipt}
            label="Por cobrar"
            value={formatUsd(owed.reduce((sum, s) => sum + s.amountDue, 0))}
            hint={owed.length ? `${owed.length} ${owed.length === 1 ? "tienda" : "tiendas"}` : undefined}
          />
        </div>
      )}

      {accessFor && (
        <Card className="flex flex-col gap-1" data-testid="row-owner-access">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">
              Acceso del dueño · {accessFor.name}
              <span className="ml-2 text-sm font-normal text-muted-foreground">{accessFor.owner?.email}</span>
            </h2>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setAccessFor(null)}
            >
              Cerrar
            </button>
          </div>
          <OwnerAccess key={accessFor.id} storeId={accessFor.id} storeName={accessFor.name} />
        </Card>
      )}

      {stores && stores.length > 0 && (
        <div className="flex flex-col gap-3" data-testid="store-filters">
          <div className="flex flex-wrap gap-2">
            <label className="relative min-w-0 flex-1 basis-60">
              <span className="sr-only">Buscar tienda</span>
              <Search
                size={16}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={filters.q}
                onChange={(e) => set({ q: e.target.value })}
                placeholder="Nombre, subdominio o email del dueño"
                className="pl-9"
                data-testid="store-search"
              />
            </label>
            <Select
              aria-label="Estado de la tienda"
              value={filters.status}
              onChange={(e) => set({ status: e.target.value as Filters["status"] })}
              className="w-auto"
            >
              <option value="">Todos los estados</option>
              {(Object.keys(STORE_STATUS_LABELS) as StoreStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STORE_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Plan"
              value={filters.plan}
              onChange={(e) => set({ plan: e.target.value })}
              className="w-auto"
            >
              <option value="">Todos los planes</option>
              {plans.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Suscripción"
              value={filters.subscription}
              onChange={(e) => set({ subscription: e.target.value })}
              className="w-auto"
            >
              <option value="">Toda suscripción</option>
              {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip
              active={filters.owes}
              onClick={() => set({ owes: !filters.owes })}
              data-testid="filter-owes"
            >
              Debe dinero
            </Chip>
            <Chip active={filters.soon} onClick={() => set({ soon: !filters.soon })}>
              Vence en 7 días
            </Chip>
            {filtered && (
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => setFilters(NO_FILTERS)}
              >
                Quitar filtros
              </button>
            )}
            <span className="ml-auto text-sm text-muted-foreground">
              {shown.length} de {stores.length}
            </span>
          </div>
        </div>
      )}

      {stores === null && !error && <p className="text-muted-foreground">Cargando…</p>}

      {stores?.length === 0 && (
        <Card className="text-center text-muted-foreground">Todavía no hay tiendas. Crea la primera.</Card>
      )}

      {stores && stores.length > 0 && shown.length === 0 && (
        <Card className="text-center text-muted-foreground">Ninguna tienda coincide con los filtros.</Card>
      )}

      {shown.length > 0 && (
        <>
          {/* Wide screens: one row per store. */}
          <Card className="hidden p-0 lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-surface text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Tienda</th>
                  <th className="px-3 py-3 font-medium">Dueño</th>
                  <th className="px-3 py-3 font-medium">Plan · vence</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 text-right font-medium">Por cobrar</th>
                  <th className="px-3 py-3 font-medium">Actividad</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {shown.map((store) => (
                  <tr
                    key={store.id}
                    className="border-b last:border-0"
                    data-testid={`store-row-${store.slug}`}
                  >
                    <td className="px-4 py-3">
                      <StoreName store={store} />
                    </td>
                    <td className="max-w-52 px-3 py-3">
                      <div className="truncate">{store.owner?.email ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        Entró: {formatDate(store.owner?.lastSignInAt ?? null)}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div>
                        {store.plan?.name ?? "—"}
                        <span className="text-xs text-muted-foreground">
                          {store.subscriptionStatus
                            ? ` · ${SUBSCRIPTION_STATUS_LABELS[store.subscriptionStatus]}`
                            : ""}
                        </span>
                      </div>
                      <div className="text-xs whitespace-nowrap text-muted-foreground">
                        Vence <Ends store={store} now={now} />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge store={store} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Due store={store} now={now} />
                    </td>
                    <td className="px-3 py-3">
                      <div>
                        <span className="font-semibold tabular-nums">{store.orders30d}</span> pedidos 30 d ·{" "}
                        <span className="tabular-nums">{store.products}</span> productos
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Último pedido: {formatDate(store.lastOrderAt)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">{actions(store)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Narrower screens: a card per store with the same data. */}
          <ul className="grid gap-3 md:grid-cols-2 lg:hidden">
            {shown.map((store) => (
              <li key={store.id}>
                <Card className="flex flex-col gap-3" data-testid={`store-card-${store.slug}`}>
                  <div className="flex items-start justify-between gap-2">
                    <StoreName store={store} />
                    {actions(store)}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge store={store} />
                    {store.plan && <Badge variant="outline">{store.plan.name}</Badge>}
                    {store.subscriptionStatus && (
                      <Badge variant="outline">{SUBSCRIPTION_STATUS_LABELS[store.subscriptionStatus]}</Badge>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <Fact label="Dueño" wide>
                      <span className="block truncate">{store.owner?.email ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        Entró: {formatDate(store.owner?.lastSignInAt ?? null)}
                      </span>
                    </Fact>
                    <Fact label="Por cobrar">
                      <Due store={store} now={now} />
                    </Fact>
                    <Fact label="Vence">
                      <Ends store={store} now={now} />
                    </Fact>
                    <Fact label="Pedidos 30 d">{store.orders30d}</Fact>
                    <Fact label="Último pedido">{formatDate(store.lastOrderAt)}</Fact>
                    <Fact label="Productos">{store.products}</Fact>
                    <Fact label="Alta">{formatDate(store.createdAt)}</Fact>
                  </dl>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function StoreName({ store }: { store: PlatformStore }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="font-display flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft font-extrabold text-primary">
        {store.name[0]?.toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-col">
        <Link href={`/superadmin/stores/${store.id}`} className="truncate font-semibold hover:underline">
          {store.name}
        </Link>
        <a
          href={storeUrl(store.slug)}
          className="truncate text-xs text-primary hover:underline"
          target="_blank"
        >
          {store.primaryDomain ?? store.slug}
        </a>
      </span>
    </div>
  );
}

function StatusBadge({ store }: { store: PlatformStore }) {
  return (
    <Badge variant={store.status === "active" ? "success" : "destructive"}>
      {STORE_STATUS_LABELS[store.status]}
      {store.suspendedReason === "billing" ? " por impago" : ""}
    </Badge>
  );
}

function Due({ store, now }: { store: PlatformStore; now: number }) {
  if (store.amountDue <= 0) return <span className="text-muted-foreground">—</span>;
  const late = store.nextDueAt !== null && new Date(store.nextDueAt).getTime() < now;
  return (
    <span className="flex flex-col">
      <span className="font-semibold tabular-nums">{formatUsd(store.amountDue)}</span>
      <span className={`text-xs ${late ? "text-destructive" : "text-muted-foreground"}`}>
        {late ? "Venció" : "Vence"} {formatDate(store.nextDueAt)}
      </span>
    </span>
  );
}

function Ends({ store, now }: { store: PlatformStore; now: number }) {
  const end = endsAt(store);
  if (!end) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={endsSoon(store, now) ? "font-semibold text-destructive" : undefined}>
      {formatDate(end)}
    </span>
  );
}

function Fact({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Actions of a store: a small menu (native <details>, closes on choosing). */
function StoreActions({
  store,
  busy,
  onStatus,
  onAccess,
}: {
  store: PlatformStore;
  busy: boolean;
  onStatus: (status: StoreStatus) => void;
  onAccess: () => void;
}) {
  const item = "block w-full px-3 py-2 text-left text-sm hover:bg-surface disabled:opacity-50";
  const close = (e: MouseEvent) => e.currentTarget.closest("details")?.removeAttribute("open");
  return (
    <details className="relative inline-block text-left" data-testid={`store-actions-${store.slug}`}>
      <summary
        aria-label={`Acciones de ${store.name}`}
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border hover:bg-surface [&::-webkit-details-marker]:hidden"
      >
        <Ellipsis size={17} aria-hidden />
      </summary>
      <div
        className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border bg-background py-1 shadow-lg"
        onClick={close}
      >
        <Link href={`/superadmin/stores/${store.id}`} className={item}>
          Abrir ficha
        </Link>
        <a href={`${storeUrl(store.slug)}/admin`} target="_blank" className={item}>
          Abrir admin
        </a>
        <a href={storeUrl(store.slug)} target="_blank" className={item}>
          Ver tienda
        </a>
        {store.owner?.email && (
          <button type="button" className={item} onClick={onAccess}>
            Enviar acceso al dueño
          </button>
        )}
        <button
          type="button"
          className={`${item} ${store.status === "active" ? "text-destructive" : ""}`}
          disabled={busy}
          onClick={() => onStatus(store.status === "active" ? "suspended" : "active")}
        >
          {store.status === "active" ? "Suspender" : "Activar"}
        </button>
      </div>
    </details>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  filled = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  hint?: string;
  filled?: boolean;
}) {
  return (
    <Card
      className={`flex flex-col gap-2.5 rounded-[14px] p-[18px] ${filled ? "border-primary bg-primary text-primary-foreground" : ""}`}
    >
      <span
        className={`flex items-center justify-between text-[13px] ${filled ? "" : "text-muted-foreground"}`}
      >
        {label}
        <Icon size={17} aria-hidden />
      </span>
      <span className="font-display text-[28px] leading-none font-extrabold">{value}</span>
      {hint && (
        <span className={`text-[12.5px] font-semibold ${filled ? "" : "text-muted-foreground"}`}>{hint}</span>
      )}
    </Card>
  );
}

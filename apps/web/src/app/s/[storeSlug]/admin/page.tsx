"use client";

import { formatMoney, formatPhone, orderCode, SHIPPING_TYPE_LABELS, type CurrencyCode } from "@kshop/core";
import {
  greeting,
  periodChange,
  StatusPill,
  useAdminHome,
  useCheckoutSettings,
  type RecentOrder,
} from "@kshop/admin";
import {
  Banknote,
  Card,
  ChevronRight,
  ClipboardList,
  Lock,
  type LucideIcon,
  MessageCircle,
  Package,
  Segmented,
  ShoppingBag,
  TrendingUp,
  Truck,
  Wallet,
} from "@kshop/ui";
import type { HomePeriod, HomeSummary } from "@kshop/data";
import { Link, useStore } from "@kshop/storefront";
import { useState } from "react";
import { useAdmin } from "./admin-context";

// Admin › Inicio (redesign R6): greeting, four KPIs (sold, received, owed, orders) for «Hoy · 7 días · Mes» against
// the previous period, the week's sales, «Por hacer» and the latest orders. Money in the base currency.

const PERIODS: Record<HomePeriod, { tab: string; when: string; vs: string }> = {
  day: { tab: "Hoy", when: "hoy", vs: "vs ayer" },
  week: { tab: "7 días", when: "en 7 días", vs: "vs 7 días antes" },
  month: { tab: "Mes", when: "este mes", vs: "vs mes pasado" },
};

export default function AdminHomePage() {
  const store = useStore();
  const admin = useAdmin();
  const salesToday = admin.enabledModules.has("sales_today");
  const { summary, today, recent } = useAdminHome({ salesToday });
  const [now] = useState(() => new Date());
  const base = store.baseCurrency as CurrencyCode;
  const week = summary?.week ?? null;
  const [period, setPeriod] = useState<HomePeriod>("day");
  const figures = summary?.periods?.[period] ?? null;
  const vs = PERIODS[period].vs;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted-foreground first-letter:uppercase">
            {now.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="font-display text-[28px] leading-tight font-bold">
            {greeting(now)}, {store.name}
          </h1>
        </div>
        {salesToday && (
          <Segmented
            label="Periodo"
            value={period}
            onSelect={setPeriod}
            options={(Object.keys(PERIODS) as HomePeriod[]).map((p) => ({ value: p, label: PERIODS[p].tab }))}
          />
        )}
      </div>

      {salesToday ? (
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4" data-testid="sales-today">
          <Kpi
            label={`Vendido ${PERIODS[period].when}`}
            icon={TrendingUp}
            value={figures ? formatMoney(figures.sold, base) : "…"}
            change={figures && periodChange(figures.sold, figures.previous.sold)}
            vs={vs}
            filled
          />
          <Kpi
            label="Cobrado"
            icon={Wallet}
            value={
              period === "day" && today?.received.length
                ? // Today in the currency it was paid in (several currencies stay apart).
                  today.received.map((r) => formatMoney(r.amount, r.currency as CurrencyCode)).join(" · ")
                : figures
                  ? formatMoney(figures.received, base)
                  : "…"
            }
            change={figures && periodChange(figures.received, figures.previous.received)}
            vs={vs}
          />
          <Kpi
            label="Por cobrar"
            icon={Banknote}
            value={summary?.toCollect != null ? formatMoney(summary.toCollect, base) : "…"}
            tone="text-warning"
            note="Pedidos abiertos sin pagar"
          />
          <Kpi
            label={`Pedidos ${PERIODS[period].when}`}
            icon={ShoppingBag}
            value={figures ? String(figures.orders) : "…"}
            change={figures && periodChange(figures.orders, figures.previous.orders)}
            vs={vs}
          />
        </div>
      ) : (
        <Card className="flex items-center gap-3 text-sm">
          <Lock size={16} aria-hidden className="text-muted-foreground" />
          <span className="flex-1">Las ventas del día y de la semana vienen con «Ventas de hoy».</span>
          <Link href="/admin/billing" className="font-semibold text-primary">
            Ver planes
          </Link>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        {week && (
          <Card className="flex flex-col gap-4 rounded-[14px]">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-bold">Ventas de la semana</h2>
              <span className="text-sm text-muted-foreground">
                {formatMoney(
                  week.reduce((sum, d) => sum + d.amount, 0),
                  base,
                )}
              </span>
            </div>
            <WeekBars week={week} currency={base} />
          </Card>
        )}
        <Card className="flex flex-col gap-3 rounded-[14px]" data-testid="todo">
          <h2 className="font-display text-lg font-bold">Por hacer</h2>
          {!summary ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <>
              <Todo
                href="/admin/orders"
                icon={ClipboardList}
                tone="bg-warning-soft text-warning"
                count={summary.todo.toConfirm}
                one="pedido por confirmar"
                many="pedidos por confirmar"
              />
              <Todo
                href="/admin/orders"
                icon={Truck}
                tone="bg-accent-soft text-primary"
                count={summary.todo.toDeliver}
                one="pedido por entregar"
                many="pedidos por entregar"
              />
              <Todo
                href="/admin/catalog"
                icon={Package}
                tone="bg-destructive-soft text-destructive"
                count={summary.todo.lowStock}
                one="producto con poco stock"
                many="productos con poco stock"
              />
              {summary.todo.toConfirm + summary.todo.toDeliver + summary.todo.lowStock === 0 && (
                <p className="text-sm text-muted-foreground">Todo al día.</p>
              )}
            </>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden rounded-[14px] p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-display text-lg font-bold">Últimos pedidos</h2>
          <Link href="/admin/orders" className="flex items-center gap-1 text-sm font-semibold text-primary">
            Ver todos
            <ChevronRight size={16} aria-hidden />
          </Link>
        </div>
        <RecentOrders orders={recent} />
      </Card>
    </div>
  );
}

function Kpi({
  label,
  icon: Icon,
  value,
  change,
  vs,
  filled = false,
  tone,
  note,
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  change?: number | null;
  vs?: string;
  filled?: boolean;
  tone?: string;
  note?: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-2.5 rounded-[14px] p-[14px] sm:p-[18px] ${filled ? "bg-primary text-primary-foreground" : "border bg-background"}`}
    >
      <span
        className={`flex items-center justify-between text-[13px] ${filled ? "opacity-90" : "text-muted-foreground"}`}
      >
        {label}
        <Icon size={17} aria-hidden />
      </span>
      {/* Five-digit amounts fit half a phone width at 22 px. */}
      <span
        className={`font-display text-[22px] leading-none font-extrabold break-words sm:text-[28px] ${tone ?? ""}`}
      >
        {value}
      </span>
      {change != null ? (
        <span
          className={`text-[12.5px] font-semibold ${filled ? "text-gold" : change >= 0 ? "text-success" : "text-destructive"}`}
        >
          {change >= 0 ? "+" : ""}
          {change}% {vs}
        </span>
      ) : (
        <span className={`text-[12.5px] ${filled ? "opacity-80" : "text-muted-foreground"}`}>
          {note ?? " "}
        </span>
      )}
    </div>
  );
}

function WeekBars({ week, currency }: { week: NonNullable<HomeSummary["week"]>; currency: CurrencyCode }) {
  const max = Math.max(...week.map((d) => d.amount), 1);
  return (
    <ol className="flex h-[190px] items-end gap-3.5" aria-label="Ventas de los últimos 7 días">
      {week.map((d, i) => {
        const today = i === week.length - 1;
        const label = new Date(d.day).toLocaleDateString("es", { weekday: "short" }).replace(".", "");
        return (
          <li key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {d.amount ? formatMoney(d.amount, currency).replace(/\s?[A-Z]{3}$/, "") : ""}
            </span>
            <span
              className={`w-full rounded-[8px_8px_4px_4px] ${today ? "bg-primary" : "bg-accent-soft"}`}
              style={{ height: `${Math.max(4, (d.amount / max) * 150)}px` }}
              title={`${formatMoney(d.amount, currency)} · ${d.orders} pedidos`}
            />
            <span className={`text-xs ${today ? "font-semibold text-primary" : "text-muted-foreground"}`}>
              {today ? "Hoy" : label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Todo({
  href,
  icon: Icon,
  tone,
  count,
  one,
  many,
}: {
  href: string;
  icon: LucideIcon;
  tone: string;
  count: number;
  one: string;
  many: string;
}) {
  if (!count) return null;
  return (
    <Link href={href} className={`flex items-center gap-3 rounded-xl p-3 ${tone}`}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background">
        <Icon size={18} aria-hidden />
      </span>
      <span className="flex-1 text-sm font-semibold">
        {count} {count === 1 ? one : many}
      </span>
      <ChevronRight size={16} aria-hidden />
    </Link>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

function RecentOrders({ orders }: { orders: RecentOrder[] | null }) {
  const { data: settings } = useCheckoutSettings();
  if (!orders) return <p className="px-5 pb-5 text-sm text-muted-foreground">Cargando…</p>;
  if (!orders.length)
    return <p className="px-5 pb-5 text-sm text-muted-foreground">Todavía no hay pedidos.</p>;
  const code = (n: number) => (settings ? orderCode(settings.orderPrefix, n) : `#${n}`);
  const cols = "md:grid-cols-[110px_1.4fr_1fr_120px_140px_70px_40px]";
  return (
    <div role="table" aria-label="Últimos pedidos" data-testid="recent-orders">
      <div
        role="row"
        className={`hidden gap-3 bg-surface px-5 py-2.5 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase md:grid ${cols}`}
      >
        <span role="columnheader">Pedido</span>
        <span role="columnheader">Cliente</span>
        <span role="columnheader">Entrega</span>
        <span role="columnheader">Total</span>
        <span role="columnheader">Estado</span>
        <span role="columnheader">Hora</span>
        <span role="columnheader" className="sr-only">
          WhatsApp
        </span>
      </div>
      {orders.map((o) => (
        <div
          key={o.id}
          role="row"
          className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t px-5 py-3 text-sm md:grid ${cols}`}
        >
          <Link href={`/admin/orders/${o.id}`} role="cell" className="font-mono font-semibold text-primary">
            {code(o.number)}
          </Link>
          <span
            role="cell"
            className="flex min-w-0 items-center gap-2.5 max-md:order-first max-md:col-span-2"
          >
            <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-primary">
              {initials(o.customerName)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{o.customerName}</span>
              <span className="text-xs text-muted-foreground">
                {o.items} {o.items === 1 ? "producto" : "productos"}
              </span>
            </span>
          </span>
          <span role="cell" className="text-muted-foreground max-md:hidden">
            {o.shippingType ? SHIPPING_TYPE_LABELS[o.shippingType] : "—"}
          </span>
          <span role="cell" className="font-display text-right font-bold md:text-left">
            {o.total == null
              ? `${formatMoney(o.subtotal, o.currency)} + envío`
              : formatMoney(o.total, o.currency)}
          </span>
          <span role="cell">
            <StatusPill status={o.status} />
          </span>
          <span role="cell" className="text-muted-foreground tabular-nums max-md:hidden">
            {new Date(o.createdAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <a
            role="cell"
            href={`https://wa.me/${o.customerPhone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp de ${o.customerName} (${formatPhone(o.customerPhone)})`}
            className="flex size-9 items-center justify-center justify-self-end rounded-lg border text-whatsapp hover:bg-surface md:justify-self-auto"
          >
            <MessageCircle size={16} aria-hidden />
          </a>
        </div>
      ))}
    </div>
  );
}

"use client";

import {
  isConfigurableSection,
  SECTION_VISIBILITIES,
  SECTION_VISIBILITY_LABELS,
  sectionVisibility,
  type ModuleCode,
  type SectionSettings,
  type SectionVisibility,
} from "@kshop/core";
import { ApiError } from "@kshop/data";
import {
  Alert,
  Badge,
  buttonVariants,
  Card,
  CreditCard,
  ExternalLink,
  House,
  type LucideIcon,
  Select,
  UserRound,
  Users,
} from "@kshop/ui";
import { useEffect, useState } from "react";
import { ADMIN_MODULES } from "@/features/registry";
import { ADMIN_GROUPS, type AdminGroup } from "@/features/types";
import { storeUrl } from "@/lib/format";
import { useSession } from "@/lib/session";

type Row = {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
  /** null: a basic section, always visible (Roberto, 2026-10-28). */
  module: ModuleCode | null;
};

// The basic sections next to the modules of their group, in the order of the store's menu.
const BASIC: Partial<Record<AdminGroup, Row[]>> = {
  sales: [
    { key: "customers", label: "Clientes", icon: UserRound, path: "/admin/orders/customers", module: null },
  ],
  business: [
    { key: "billing", label: "Plan y facturación", icon: CreditCard, path: "/admin/billing", module: null },
    { key: "team", label: "Equipo", icon: Users, path: "/admin/team", module: null },
  ],
};

function rowsOf(group: AdminGroup): Row[] {
  const modules: Row[] = ADMIN_MODULES.filter((m) => m.group === group).map((m) => ({
    key: m.code,
    label: m.label,
    icon: m.icon,
    path: m.adminPath,
    module: m.code,
  }));
  return [...modules, ...(BASIC[group] ?? [])];
}

/**
 * Superadmin › Tienda › «Menú de la tienda» (R12): each section of the store's admin with a shortcut to it, whether
 * its plan includes it, and how its staff sees it (Visible / Gestionado por admin / Oculto), saved at once. The basic
 * sections are always visible.
 */
export function StoreMenu({
  storeId,
  slug,
  activeModules,
}: {
  storeId: string;
  slug: string;
  activeModules: ReadonlySet<string>;
}) {
  const { api } = useSession();
  const [sections, setSections] = useState<SectionSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const admin = `${storeUrl(slug)}/admin`;

  useEffect(() => {
    let cancelled = false;
    api.platform.sections(storeId).then(
      (r) => !cancelled && setSections(r.sections),
      (e: unknown) =>
        !cancelled && setError(e instanceof ApiError ? e.message : "No se pudo leer el menú de la tienda."),
    );
    return () => {
      cancelled = true;
    };
  }, [api, storeId]);

  async function change(row: Row, visibility: SectionVisibility) {
    if (!row.module || !isConfigurableSection(row.module)) return;
    setBusy(row.key);
    setError(null);
    setSaved(null);
    try {
      const r = await api.platform.setSection(storeId, { section: row.module, visibility });
      setSections(r.sections);
      setSaved(`«${row.label}»: ${SECTION_VISIBILITY_LABELS[visibility]}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-0" data-testid="store-menu">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div>
          <h2 className="font-semibold">Menú de la tienda</h2>
          <p className="text-sm text-muted-foreground">
            Entra a cualquier sección de su admin y decide cómo la ve su personal. «Gestionado por admin»: la
            ve pero solo tú la cambias. «Oculto»: no la ve. Ocultar no apaga nada ni borra datos.
          </p>
        </div>
        <a
          href={admin}
          target="_blank"
          className={buttonVariants({ size: "sm" })}
          data-testid="open-store-admin"
        >
          Entrar al admin
          <ExternalLink size={15} aria-hidden />
        </a>
      </div>
      {error && (
        <Alert variant="destructive" className="mx-4">
          {error}
        </Alert>
      )}
      {saved && (
        <Alert variant="success" className="mx-4" role="status">
          Guardado. {saved}
        </Alert>
      )}
      <div className="flex flex-col">
        <MenuRow
          row={{ key: "home", label: "Inicio", icon: House, path: "/admin", module: null }}
          href={admin}
          inPlan
        />
        {ADMIN_GROUPS.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <p className="border-t bg-surface px-4 py-1.5 text-[11px] font-bold tracking-[.08em] text-muted-foreground uppercase">
              {g.label}
            </p>
            {rowsOf(g.key).map((row) => (
              <MenuRow
                key={row.key}
                row={row}
                href={`${storeUrl(slug)}${row.path}`}
                inPlan={!row.module || activeModules.has(row.module)}
                visibility={
                  row.module && isConfigurableSection(row.module) && sections
                    ? sectionVisibility(sections, row.module)
                    : undefined
                }
                busy={busy === row.key}
                onChange={(v) => void change(row, v)}
              />
            ))}
          </section>
        ))}
      </div>
    </Card>
  );
}

function MenuRow({
  row,
  href,
  inPlan,
  visibility,
  busy = false,
  onChange,
}: {
  row: Row;
  href: string;
  inPlan: boolean;
  visibility?: SectionVisibility;
  busy?: boolean;
  onChange?: (v: SectionVisibility) => void;
}) {
  const configurable = row.module !== null && isConfigurableSection(row.module);
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-2.5"
      data-testid={`menu-row-${row.key}`}
    >
      <a
        href={href}
        target="_blank"
        className="flex min-w-0 flex-1 basis-48 items-center gap-2.5 text-sm font-medium hover:text-primary hover:underline"
        title="Abrir en el admin de la tienda"
      >
        <row.icon size={17} aria-hidden className="shrink-0 text-primary" />
        <span className="truncate">{row.label}</span>
        <ExternalLink size={13} aria-hidden className="shrink-0 text-muted-foreground" />
      </a>
      {!inPlan && <Badge variant="muted">Fuera del plan</Badge>}
      {configurable ? (
        <Select
          aria-label={`Cómo ve el personal «${row.label}»`}
          value={visibility ?? "visible"}
          disabled={busy || visibility === undefined}
          onChange={(e) => onChange?.(e.target.value as SectionVisibility)}
          className="w-auto min-w-48"
          data-testid={`section-${row.key}`}
        >
          {SECTION_VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {SECTION_VISIBILITY_LABELS[v]}
            </option>
          ))}
        </Select>
      ) : (
        <span className="min-w-48 text-sm text-muted-foreground">Siempre visible</span>
      )}
    </div>
  );
}

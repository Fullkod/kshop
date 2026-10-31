import { resolveTheme, storeOrigin, THEME_PRESETS, type ModuleCode, type ThemePresetKey } from "@kshop/core";
import type { BillingPlan } from "@kshop/data";
import { whatsappUrl } from "@kshop/storefront";
// Subpath: the barrel would put the whole storefront in the landing's first JS.
import { CurrentYear } from "@kshop/storefront/current-year";
import {
  ArrowRight,
  Bell,
  Check,
  ClipboardList,
  Coins,
  MessageCircle,
  Package,
  Smartphone,
  TrendingUp,
  Truck,
  Warehouse,
  type LucideIcon,
} from "@kshop/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { platformProtocol, publicEnv } from "@/env";
import { getLandingData, getLandingDemoStore } from "@/server/landing";
import { LandingPhone, LandingThemes } from "./_landing/LandingStore";

// Platform landing (redesign R7, docs/design-v2/05-LANDING.md). Kshop brand; prices, limits and add-ons are read
// from the plans (Superadmin › Planes) and every CTA opens the support WhatsApp (Superadmin › Facturación).

const NAV = [
  { href: "#funciones", label: "Funciones" },
  { href: "#temas", label: "Temas" },
  { href: "#precios", label: "Precios" },
  { href: "#app", label: "App" },
];

const TRUST = ["Pago en efectivo", "Sin tarjeta", "Soporte por WhatsApp"];

// What the business gains. `module` labels the card with the cheapest plan that has it, when the first plan doesn't.
const FEATURES: {
  id?: string;
  icon: LucideIcon;
  title: string;
  text: string;
  module?: ModuleCode;
  card: string;
  box: string;
}[] = [
  {
    icon: MessageCircle,
    title: "Vende las 24 horas",
    text: "Tu catálogo siempre abierto. El cliente compra cuando quiere y el pedido te llega completo por WhatsApp: productos, dirección, entrega y pago. Sin repetir precios ni mandar fotos una a una.",
    card: "bg-primary text-primary-foreground",
    box: "bg-white/15 text-gold",
  },
  {
    icon: Package,
    title: "Inventario al día",
    text: "Cada pedido aparta sus unidades, así no vendes lo que no tienes. Ves lo disponible y lo reservado por talla y color, lo que se acaba y cuánto vale tu mercancía. Todo el catálogo se sube desde Excel.",
    card: "bg-surface",
    box: "bg-accent-soft text-primary",
  },
  {
    icon: Warehouse,
    title: "Varios almacenes",
    text: "Stock por local o almacén, cuál sirve cada zona, puntos de recogida y traspasos con el historial de cada movimiento.",
    module: "multi_warehouse",
    card: "bg-surface",
    box: "bg-accent-soft text-primary",
  },
  {
    icon: Truck,
    title: "Entregas en orden",
    text: "Zonas con su precio y plazo, envío gratis desde un importe o recogida en tienda. Cada pedido avanza de «por confirmar» a «entregado» y nadie pierde el hilo.",
    card: "bg-surface",
    box: "bg-accent-soft text-primary",
  },
  {
    icon: Bell,
    title: "Clientes avisados solos",
    text: "Un WhatsApp automático cada vez que su pedido cambia de estado, con el texto que tú quieras. Menos «¿y mi pedido?».",
    module: "whatsapp_notifications",
    card: "bg-surface",
    box: "bg-success-soft text-whatsapp",
  },
  {
    icon: Coins,
    title: "Cobra como ya cobras",
    text: "Efectivo, transferencia o lo que uses, en CUP, USD o EUR con la tasa del día. Sabes qué está cobrado y qué falta por cobrar.",
    card: "bg-surface",
    box: "bg-accent-soft text-primary",
  },
  {
    icon: TrendingUp,
    title: "Sabe cuánto ganas",
    text: "Ventas del día y del mes por moneda, costo de lo vendido, margen, gastos y ganancia neta, con el cierre del día para cuadrar la caja.",
    module: "finance",
    card: "bg-night text-white",
    box: "bg-white/10 text-gold",
  },
  {
    icon: ClipboardList,
    title: "Todo en un solo panel",
    text: "Pedidos de la web, de la app y los que tomas en el local o por teléfono, con su cliente e historial. Tu equipo entra con sus propios permisos.",
    card: "bg-surface",
    box: "bg-accent-soft text-primary",
  },
  {
    id: "app",
    icon: Smartphone,
    title: "Clientes que vuelven",
    text: "Tu app Android con tu logo en su móvil, ofertas con cuenta atrás y cupones. Y Kshop Admin para llevar el negocio desde el tuyo.",
    card: "bg-gold text-night",
    box: "bg-night/10 text-night",
  },
];

const steps = (trialDays: number, trialPlan: string) => [
  { title: "Crea tu tienda", text: `Elige nombre y dirección. Te damos ${trialDays} días de ${trialPlan}.` },
  { title: "Sube tus productos", text: "A mano o desde Excel, con fotos, tallas y colores." },
  { title: "Comparte y vende", text: "Pasa el enlace por WhatsApp y recibe pedidos." },
];

/** What each module means to a shop owner (null: always there, not worth a line). */
const MODULE_PITCH: Record<ModuleCode, string | null> = {
  catalog: null,
  orders: "Pedidos por WhatsApp",
  shipping: "Envíos y recogida",
  discounts: "Ofertas visibles (-20 %)",
  vouchers: "Cupones",
  themes: "Temas, portada y banners",
  excel_import: "Importar desde Excel",
  mobile_app: "App Android con tu logo",
  sales_today: "Ventas del día",
  pos: "Caja de mostrador, también sin internet",
  finance: "Finanzas",
  multi_warehouse: "Varios almacenes",
  multi_currency: "Multimoneda",
  whatsapp_notifications: "Avisos por WhatsApp",
  custom_domain: "Dominio propio",
};

const amount = (n: number) => new Intl.NumberFormat("es", { maximumFractionDigits: 2 }).format(n);

/** Plan lines from its limits and modules; a higher plan lists only what it adds to the previous one. */
function planLines(plan: BillingPlan, previous: BillingPlan | undefined, order: ModuleCode[]): string[] {
  const { maxProducts, maxStaff } = plan.limits;
  const modules = order.filter((m) => plan.modules.includes(m) && !previous?.modules.includes(m));
  return [
    maxProducts == null ? "Productos ilimitados" : `Hasta ${amount(maxProducts)} productos`,
    ...(previous ? [`Todo lo del ${previous.name}`] : []),
    ...modules.flatMap((m) => (MODULE_PITCH[m] ? [MODULE_PITCH[m]] : [])),
    maxStaff == null
      ? "Equipo sin límite"
      : `${maxStaff} ${maxStaff === 1 ? "persona" : "personas"} en el equipo`,
  ];
}

// The six presets resolved here: the theme block (client) gets plain data instead of importing @kshop/core (zod).
const PRESETS = (Object.keys(THEME_PRESETS) as ThemePresetKey[]).map((key) => ({
  key,
  label: THEME_PRESETS[key].label,
  accent: THEME_PRESETS[key].colors.accent,
  secondary: THEME_PRESETS[key].colors.secondary,
  theme: resolveTheme({ preset: key }),
}));

const container = "relative mx-auto w-full max-w-[1200px] px-[clamp(16px,4cqw,40px)]";
const eyebrow = "text-[13px] leading-none font-bold tracking-[.1em] text-primary uppercase";
const h2 =
  "font-display text-[clamp(30px,3.6cqw,46px)] leading-[1.08] font-extrabold tracking-[-0.02em] text-balance";

export default async function PlatformHome() {
  const [data, demoStore] = await Promise.all([getLandingData(), getLandingDemoStore()]);
  const wa = (text: string) => (data.supportWhatsapp ? whatsappUrl(data.supportWhatsapp, text) : null);
  const createUrl = wa("Hola, quiero crear mi tienda en Kshop.") ?? "#precios";
  const trialUrl = wa(`Hola, quiero probar Kshop ${data.trialDays} días gratis.`) ?? "#precios";
  const talkUrl = wa("Hola, tengo una pregunta sobre Kshop.");
  const demo = demoStore && {
    store: demoStore,
    origin: storeOrigin(demoStore.slug, publicEnv.platformDomain, platformProtocol),
  };
  const highlighted = data.plans.length > 1 ? data.plans.at(-1)?.code : undefined;
  const domain = publicEnv.platformDomain.replace(/:\d+$/, "");
  // The trial gives the top public plan (decision of the pricing study).
  const trialPlan = data.plans.at(-1)?.name ?? "Pro";
  const moduleOrder = data.modules.map((m) => m.code);
  const planOf = (module: ModuleCode | undefined) =>
    module && !data.plans[0]?.modules.includes(module)
      ? data.plans.find((p) => p.modules.includes(module))?.name
      : undefined;

  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground [container-type:inline-size]">
      {/* Hero */}
      <div className="relative overflow-hidden bg-night text-white">
        <span
          className="absolute -top-40 -right-40 size-[520px] rounded-full bg-[#5B21B6] opacity-55"
          aria-hidden
        />
        <span
          className="absolute -bottom-[220px] -left-30 size-[380px] rounded-full bg-gold opacity-[.14]"
          aria-hidden
        />
        <header className={`${container} flex items-center gap-7 py-[22px]`}>
          <Brand reversed className="h-[34px]" />
          <nav aria-label="Secciones" className="ml-3 hidden gap-1 md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="rounded-[10px] px-3 py-2 text-[15px] font-medium whitespace-nowrap text-white/80 hover:bg-white/5 hover:text-white"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <a
            href={createUrl}
            className="ml-auto flex h-11 items-center rounded-xl bg-gold px-[18px] text-[15px] font-bold whitespace-nowrap text-night hover:bg-[#FFC727] max-sm:h-10 max-sm:px-3.5 max-sm:text-sm"
          >
            Crear mi tienda
          </a>
        </header>
        <section
          className={`${container} flex flex-wrap items-center gap-[clamp(32px,5cqw,64px)] pt-[clamp(32px,5cqw,64px)]`}
        >
          <div className="flex flex-[1_1_440px] flex-col gap-[22px] pb-[clamp(32px,6cqw,96px)] max-sm:basis-full">
            <span className="flex items-center gap-2 self-start rounded-full bg-white/10 py-[7px] pr-3 pl-2 text-[13px] font-semibold text-gold">
              <span className="rounded-full bg-gold px-2 py-[3px] text-[11px] font-extrabold text-night">
                NUEVO
              </span>
              Tu propia app Android, incluida en el plan
            </span>
            <h1 className="font-display text-[clamp(40px,5.4cqw,68px)] leading-[1.02] font-extrabold tracking-[-0.03em] text-balance">
              Tu tienda online, con tu dirección y tus pedidos por <span className="text-gold">WhatsApp</span>
            </h1>
            <p className="max-w-[520px] text-[clamp(16px,1.5cqw,19px)] text-pretty text-white/80">
              Recibe pedidos las 24 horas, controla tu inventario y tus almacenes, organiza las entregas y sabe
              cada día cuánto ganas. En CUP, USD o EUR, y lista en una tarde.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={trialUrl}
                className="flex h-[54px] items-center gap-2.5 rounded-[14px] bg-gold px-6 text-base font-extrabold text-night hover:bg-[#FFC727]"
              >
                Prueba {data.trialDays} días gratis
                <ArrowRight size={18} aria-hidden />
              </a>
              {demo && (
                <a
                  href={demo.origin}
                  className="flex h-[54px] items-center rounded-[14px] border-[1.5px] border-white/25 px-[22px] text-base font-semibold hover:bg-white/5"
                >
                  Ver una tienda de ejemplo
                </a>
              )}
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/75">
              {TRUST.map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check size={16} className="text-[#6FD39C]" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          {demo && (
            <div className="relative mx-auto flex-[0_1_380px] self-end">
              <LandingPhone demo={demo} />
              <div
                className="absolute top-[120px] -left-9 z-10 flex items-center gap-3 rounded-2xl bg-white py-3 pr-4 pl-3 text-[#17132A] shadow-[0_24px_50px_-16px_rgb(0_0_0/.45)] max-sm:left-0"
                aria-hidden
              >
                <span className="flex size-[42px] items-center justify-center rounded-xl bg-whatsapp text-white">
                  <MessageCircle size={21} />
                </span>
                <span className="flex flex-col leading-tight">
                  <b className="text-sm">Nuevo pedido #1046</b>
                  <span className="text-[12.5px] text-[#625C7A]">Daniela · 2 650 CUP</span>
                </span>
              </div>
              <div
                className="absolute top-[300px] -right-5 z-10 flex flex-col rounded-2xl bg-gold px-4 py-3 leading-tight text-night shadow-[0_24px_50px_-16px_rgb(0_0_0/.45)] max-sm:right-0"
                aria-hidden
              >
                <span className="text-xs font-semibold">Vendido hoy</span>
                <b className="font-display text-[22px] font-extrabold">5 100 CUP</b>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Features */}
      <section
        id="funciones"
        className={`${container} flex scroll-mt-4 flex-col gap-9 pt-[clamp(56px,7cqw,104px)]`}
      >
        <div className="flex max-w-[640px] flex-col gap-2.5">
          <span className={eyebrow}>Lo que gana tu negocio</span>
          <h2 className={h2}>Vende más y lleva tu negocio en orden</h2>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
          {FEATURES.map(({ id, icon: Icon, title, text, module, card, box }) => {
            const plan = planOf(module);
            return (
              <div
                key={title}
                id={id}
                className={`flex scroll-mt-4 flex-col gap-3 rounded-[20px] p-[26px] ${card}`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className={`flex size-12 items-center justify-center rounded-[14px] ${box}`}>
                    <Icon size={23} aria-hidden />
                  </span>
                  {plan && (
                    <span className="rounded-full border border-current px-2.5 py-1 text-[11px] leading-none font-bold tracking-[.06em] uppercase opacity-70">
                      En {plan}
                    </span>
                  )}
                </span>
                <h3 className="mt-1.5 font-display text-xl leading-tight font-bold">{title}</h3>
                <p className="text-[15px] leading-relaxed text-pretty opacity-85">{text}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Themes */}
      {demo && (
        <section id="temas" className={`${container} scroll-mt-4 pt-[clamp(56px,7cqw,104px)]`}>
          <LandingThemes demo={demo} presets={PRESETS} />
        </section>
      )}

      {/* Steps */}
      <section className={`${container} flex flex-col gap-8 pt-[clamp(56px,7cqw,104px)]`}>
        <h2 className={`${h2} text-center`}>En marcha en tres pasos</h2>
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">
          {steps(data.trialDays, trialPlan).map((s, i) => (
            <li key={s.title} className="flex flex-col gap-2.5 rounded-[20px] border p-[26px]">
              <span className="font-display text-[44px] leading-none font-extrabold text-primary" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="font-display text-[19px] leading-tight font-bold">{s.title}</h3>
              <p className="text-[15px] text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Pricing */}
      <section
        id="precios"
        className={`${container} flex scroll-mt-4 flex-col items-center gap-8 pt-[clamp(56px,7cqw,104px)]`}
      >
        <div className="flex flex-col items-center gap-2.5 text-center">
          <span className={eyebrow}>Precios</span>
          <h2 className={h2}>Paga en efectivo, sin tarjeta</h2>
          <p className="text-muted-foreground">
            {data.trialDays} días de prueba con todo el plan {trialPlan}. Luego eliges.
          </p>
        </div>
        <div
          className="grid w-full max-w-[880px] grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4"
          data-testid="landing-plans"
        >
          {data.plans.map((plan, i) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              lines={planLines(plan, data.plans[i - 1], moduleOrder)}
              highlighted={plan.code === highlighted}
              cta={
                plan.code === highlighted
                  ? {
                      label: `Probar ${plan.name} ${data.trialDays} días`,
                      href: wa(`Hola, quiero probar el plan ${plan.name} de Kshop.`),
                    }
                  : { label: "Empezar gratis", href: wa(`Hola, me interesa el plan ${plan.name} de Kshop.`) }
              }
            />
          ))}
        </div>
        <p className="max-w-[640px] text-center text-sm text-muted-foreground">
          {data.minAddonPrice != null && (
            <>
              Módulos sueltos sobre el {data.plans[0]?.name ?? "Base"} desde {amount(data.minAddonPrice)}{" "}
              USD/mes.{" "}
            </>
          )}
          Las primeras tiendas son <b className="text-foreground">socios fundadores</b>: precio congelado para
          siempre.
        </p>
      </section>

      {/* Final CTA */}
      <section className={`${container} py-[clamp(56px,7cqw,104px)]`}>
        <div className="relative flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-[28px] bg-[#5B21B6] p-[clamp(28px,5cqw,64px)] text-white">
          <span className="absolute -right-20 -bottom-30 size-[300px] rounded-full bg-gold" aria-hidden />
          <div className="relative flex max-w-[560px] flex-col gap-2.5">
            <h2 className="font-display text-[clamp(28px,3.4cqw,44px)] leading-[1.08] font-extrabold tracking-[-0.02em] text-balance">
              Abre tu tienda hoy y recibe el primer pedido esta semana
            </h2>
            <p className="text-white/85">Te ayudamos a subir tu catálogo desde Excel.</p>
          </div>
          {talkUrl && (
            <a
              href={talkUrl}
              className="relative flex h-14 items-center gap-2.5 rounded-[14px] bg-white px-[26px] text-base font-extrabold text-night"
              data-testid="landing-talk"
            >
              <MessageCircle size={19} className="text-whatsapp" aria-hidden />
              Hablar con Kshop
            </a>
          )}
        </div>
      </section>

      <footer className="border-t">
        <div
          className={`${container} flex flex-wrap items-center justify-between gap-4 py-7 text-sm text-muted-foreground`}
        >
          <Brand className="h-7" />
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            © <CurrentYear />· Un producto de
            <a
              href="https://fullkod.com/?ref=kshop"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 font-semibold text-foreground"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
              <img src="/brand/fullkod-symbol.svg" alt="" className="h-3.5 w-3.5" />
              Fullkod
            </a>
            · {domain}
          </span>
          <Link href="/superadmin" className="hover:text-foreground">
            Acceso Fullkod
          </Link>
        </div>
      </footer>
    </main>
  );
}

function PlanCard({
  plan,
  lines,
  highlighted,
  cta,
}: {
  plan: BillingPlan;
  lines: string[];
  highlighted: boolean;
  cta: { label: string; href: string | null };
}) {
  return (
    <div
      className={`relative flex flex-col gap-[18px] rounded-3xl p-[30px] ${highlighted ? "bg-night text-white shadow-[0_30px_70px_-30px_rgb(36_16_79/.6)]" : "border"}`}
      data-testid={`landing-plan-${plan.code}`}
    >
      {highlighted && (
        <span className="absolute top-[22px] right-[22px] rounded-full bg-gold px-2.5 py-1.5 text-[11px] leading-none font-extrabold tracking-[.06em] text-night">
          MÁS ELEGIDO
        </span>
      )}
      <h3 className="font-display text-[22px] leading-none font-bold">{plan.name}</h3>
      <p className="flex items-baseline gap-1.5">
        <b
          className={`font-display text-[52px] leading-none font-extrabold tracking-[-0.02em] ${highlighted ? "text-gold" : ""}`}
        >
          {amount(plan.price)}
        </b>
        <span className={highlighted ? "text-white/75" : "text-muted-foreground"}>USD / mes</span>
      </p>
      <ul className="flex flex-col gap-2.5">
        {lines.map((line) => (
          <Line key={line} highlighted={highlighted}>
            {line}
          </Line>
        ))}
      </ul>
      {cta.href && (
        <a
          href={cta.href}
          className={`mt-auto flex h-[50px] items-center justify-center rounded-[14px] font-bold ${highlighted ? "bg-gold font-extrabold text-night hover:bg-[#FFC727]" : "border-[1.5px] border-foreground hover:bg-surface"}`}
        >
          {cta.label}
        </a>
      )}
    </div>
  );
}

function Line({ highlighted, children }: { highlighted: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[15px]">
      <Check
        size={18}
        className={`mt-0.5 shrink-0 ${highlighted ? "text-gold" : "text-primary"}`}
        aria-hidden
      />
      {children}
    </li>
  );
}

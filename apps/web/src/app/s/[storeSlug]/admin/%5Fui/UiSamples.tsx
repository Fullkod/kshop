"use client";

import { resolveTheme, THEME_PRESETS, type ThemePresetKey } from "@kshop/core";
import { themeStyle } from "@kshop/storefront";
import {
  Alert,
  Badge,
  Button,
  Chip,
  FieldError,
  Input,
  Label,
  MessageCircle,
  Plus,
  Search,
  Segmented,
  ShoppingBag,
  Smartphone,
  Trophy,
  X,
} from "@kshop/ui";
import { useState } from "react";

const PRESETS: ThemePresetKey[] = ["kshop", "fresh", "dark", "minimal"];

export function UiSamples() {
  const [presets, setPresets] = useState<ThemePresetKey[]>(PRESETS.slice(0, 3));
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Átomos v2</h1>
        {PRESETS.map((key) => (
          <Chip
            key={key}
            active={presets.includes(key)}
            onClick={() => setPresets((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]))}
          >
            {THEME_PRESETS[key].label}
          </Chip>
        ))}
      </div>
      <section className="flex flex-col gap-3" data-testid="admin-atoms">
        <h2 className="font-semibold">Admin (marca Kshop)</h2>
        <Samples />
      </section>
      {presets.map((key) => (
        <section
          key={key}
          className="sf-root flex flex-col gap-3 rounded-xl border p-5"
          style={themeStyle(resolveTheme({ preset: key }))}
          data-testid={`atoms-${key}`}
        >
          <h2 className="sf-heading text-xl font-bold">{THEME_PRESETS[key].label}</h2>
          <Samples />
        </section>
      ))}
    </div>
  );
}

function Samples() {
  const [tab, setTab] = useState<"description" | "shipping" | "reviews">("description");
  const [chips, setChips] = useState(["En oferta"]);
  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="flex flex-col gap-3">
        <Caption>Button · variantes</Caption>
        <div className="flex flex-wrap gap-2">
          <Button>
            <ShoppingBag size={18} /> Añadir al carrito
          </Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="outline">Contorno</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="whatsapp">
            <MessageCircle size={18} /> WhatsApp
          </Button>
          <Button variant="whatsappOutline">
            <MessageCircle size={18} /> Pedir por WhatsApp
          </Button>
          <span className="rounded-sf-btn bg-primary p-1.5">
            <Button variant="inverse" size="sm">
              Sobre acento
            </Button>
          </span>
          <Button variant="destructive">Eliminar</Button>
          <Button disabled>Desactivado</Button>
        </div>
        <Caption>Button · tamaños sm 36 · md 44 · lg 52 · icono 44</Caption>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Pequeño</Button>
          <Button>Mediano</Button>
          <Button size="lg">Grande</Button>
          <Button size="icon" variant="outline" aria-label="Añadir">
            <Plus size={20} />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Caption>Badge</Caption>
        <div className="flex flex-wrap gap-2">
          <Badge variant="sale" shape="tag">
            -20%
          </Badge>
          <Badge variant="secondary" shape="tag">
            Nuevo
          </Badge>
          <Badge variant="secondary" shape="tag">
            <Trophy size={13} /> Más vendido
          </Badge>
          <Badge shape="tag">Envío gratis</Badge>
          <Badge variant="outline" shape="tag">
            Agotado
          </Badge>
          <Badge variant="success">Entregado</Badge>
          <Badge variant="warning">Pendiente</Badge>
          <Badge variant="destructive">Cancelado</Badge>
        </div>
        <Caption>Tabs · Chip</Caption>
        <Segmented
          label="Información del producto"
          value={tab}
          onSelect={setTab}
          options={[
            { value: "description", label: "Descripción" },
            { value: "shipping", label: "Envío" },
            { value: "reviews", label: "Opiniones" },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          {["En oferta", "Kaya", "Hasta 3 000 CUP"].map((label) => {
            const active = chips.includes(label);
            return (
              <Chip
                key={label}
                active={active}
                onClick={() => setChips((c) => (active ? c.filter((x) => x !== label) : [...c, label]))}
              >
                {label}
                {active && <X size={14} />}
              </Chip>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Caption>Input · Select · Search</Caption>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sample-phone">Teléfono (WhatsApp)</Label>
          <Input id="sample-phone" defaultValue="+53 5 123 4567" />
        </div>
        <div className="flex gap-2">
          <label className="flex h-11 flex-1 items-center gap-2 rounded-sf-btn border border-border bg-surface px-3.5 text-muted-foreground">
            <Search size={18} />
            <input className="w-full bg-transparent outline-none" placeholder="Buscar productos" />
          </label>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sample-address">Dirección</Label>
          <Input id="sample-address" aria-invalid placeholder="Calle, número, entre calles" />
          <FieldError>Escribe la dirección de entrega.</FieldError>
        </div>
        <Caption>Alert</Caption>
        <Alert variant="info" className="flex items-center gap-3">
          <Smartphone size={18} className="text-primary" />
          <span className="flex-1">Descarga nuestra app para Android</span>
          <span className="font-bold text-primary">Instalar</span>
        </Alert>
        <Alert variant="success">Tema guardado.</Alert>
        <Alert variant="warning">Tu prueba termina en 3 días.</Alert>
        <Alert variant="destructive">No se pudo guardar.</Alert>
      </div>
    </div>
  );
}

function Caption({ children }: { children: string }) {
  return <p className="font-mono text-xs text-muted-foreground">{children}</p>;
}

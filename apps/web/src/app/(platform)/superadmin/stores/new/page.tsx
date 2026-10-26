"use client";

import {
  CURRENCY_CODES,
  createStoreInputSchema,
  PLAN_CODES,
  slugify,
  type CreateStoreInput,
} from "@kshop/core";
import { ApiError, type CreateStoreResponse } from "@kshop/data";
import { Alert, Button, buttonVariants, Card, FieldError, Input, Label, Select } from "@kshop/ui";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { publicEnv } from "@/env";
import { storeUrl } from "@/lib/format";
import { useSession } from "@/lib/session";

type FieldErrors = Partial<Record<keyof CreateStoreInput, string>>;

function initials(name: string): string {
  const words = slugify(name).split("-").filter(Boolean);
  const value = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 3);
  return value.slice(0, 6).toUpperCase();
}

export default function NewStorePage() {
  const { api } = useSession();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [orderPrefix, setOrderPrefix] = useState("");
  const [prefixEdited, setPrefixEdited] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<CreateStoreResponse | null>(null);
  const [copied, setCopied] = useState(false);

  function onNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
    if (!prefixEdited) setOrderPrefix(initials(value));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = createStoreInputSchema.safeParse({
      name,
      slug,
      ownerEmail: form.get("ownerEmail"),
      baseCurrency: form.get("baseCurrency"),
      orderPrefix,
      whatsappPhone: String(form.get("whatsappPhone") ?? "").trim() || undefined,
      planCode: form.get("planCode"),
      trialDays: Number(form.get("trialDays")),
      founderPrice: String(form.get("founderPrice") ?? "").trim()
        ? Number(String(form.get("founderPrice")).replace(",", "."))
        : null,
      comped: form.get("comped") === "on",
    });
    if (!parsed.success) {
      const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
      setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v?.[0]])) as FieldErrors);
      return;
    }

    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      setCreated(await api.platform.createStore(parsed.data));
    } catch (e) {
      if (e instanceof ApiError) {
        setFormError(e.message);
        if (e.fields) {
          setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, v[0]])) as FieldErrors);
        }
      } else {
        setFormError("No se pudo crear la tienda. Inténtalo de nuevo.");
      }
    } finally {
      setPending(false);
    }
  }

  if (created) {
    const link = created.ownerAccessLink;
    const message = `Hola, ya está lista tu tienda ${created.store.name} en Kshop: ${storeUrl(created.store.slug)}\n\nEntra con este enlace para crear tu contraseña:\n${link}`;
    return (
      <Card className="mx-auto flex max-w-2xl flex-col gap-4" data-testid="store-created">
        <h1 className="text-2xl font-semibold">Tienda creada</h1>
        <p>
          <strong>{created.store.name}</strong> ya está en{" "}
          <a href={storeUrl(created.store.slug)} target="_blank" className="text-primary hover:underline">
            {storeUrl(created.store.slug)}
          </a>
          .
        </p>
        {link && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="owner-link">
              {created.ownerWasCreated
                ? "Enlace para que el dueño cree su contraseña (un solo uso)"
                : "El dueño ya tenía cuenta. Enlace de acceso (un solo uso)"}
            </Label>
            <Input
              id="owner-link"
              readOnly
              value={link}
              className="font-mono text-xs"
              data-testid="owner-link"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                }}
              >
                {copied ? "Copiado" : "Copiar enlace"}
              </Button>
              <a
                className={buttonVariants({ variant: "outline" })}
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
              >
                Enviar por WhatsApp
              </a>
            </div>
          </div>
        )}
        <Link href="/superadmin" className={buttonVariants({ className: "self-start" })}>
          Volver a tiendas
        </Link>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Nueva tienda</h1>
      <form onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2" noValidate>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="name">Nombre de la tienda</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            aria-invalid={!!errors.name}
          />
          <FieldError>{errors.name}</FieldError>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="slug">Subdominio</Label>
          <div className="flex items-center gap-2">
            <Input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase());
                setSlugEdited(true);
              }}
              aria-invalid={!!errors.slug}
            />
            <span className="whitespace-nowrap text-sm text-muted-foreground">
              .{publicEnv.platformDomain}
            </span>
          </div>
          <FieldError>{errors.slug}</FieldError>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="ownerEmail">Email del dueño</Label>
          <Input id="ownerEmail" name="ownerEmail" type="email" aria-invalid={!!errors.ownerEmail} />
          <FieldError>{errors.ownerEmail}</FieldError>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="whatsappPhone">WhatsApp de la tienda (opcional)</Label>
          <Input id="whatsappPhone" name="whatsappPhone" inputMode="tel" placeholder="+5351234567" />
          <FieldError>{errors.whatsappPhone}</FieldError>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="orderPrefix">Prefijo de pedidos</Label>
          <Input
            id="orderPrefix"
            value={orderPrefix}
            onChange={(e) => {
              setOrderPrefix(e.target.value.toUpperCase());
              setPrefixEdited(true);
            }}
            aria-invalid={!!errors.orderPrefix}
          />
          <FieldError>{errors.orderPrefix}</FieldError>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="baseCurrency">Moneda principal</Label>
          <Select id="baseCurrency" name="baseCurrency" defaultValue="CUP">
            {CURRENCY_CODES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="planCode">Plan</Label>
          <Select id="planCode" name="planCode" defaultValue="base">
            {PLAN_CODES.map((p) => (
              <option key={p} value={p}>
                {p === "base" ? "Base" : "Pro"}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="trialDays">Días de prueba</Label>
          <Input id="trialDays" name="trialDays" type="number" min={0} max={365} defaultValue={30} />
          <FieldError>{errors.trialDays}</FieldError>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="founderPrice">Socio fundador: precio congelado (USD/mes, opcional)</Label>
          <Input
            id="founderPrice"
            name="founderPrice"
            inputMode="decimal"
            placeholder="Vacío = precio del plan"
          />
          <FieldError>{errors.founderPrice}</FieldError>
        </div>

        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="comped" /> Cortesía (no se factura nunca)
        </label>

        {formError && (
          <Alert variant="destructive" className="sm:col-span-2">
            {formError}
          </Alert>
        )}

        <div className="flex gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Creando…" : "Crear tienda"}
          </Button>
          <Link href="/superadmin" className={buttonVariants({ variant: "ghost" })}>
            Cancelar
          </Link>
        </div>
      </form>
    </Card>
  );
}

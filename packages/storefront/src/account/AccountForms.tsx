"use client";

import { formatPhone, normalizePhone, whatsappLink } from "@kshop/core";
import { ApiError } from "@kshop/data";
import { Alert, Button, FieldError, Input, Label } from "@kshop/ui";
import { Link } from "../navigation";
import { useRouter } from "../navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { usePublicApi, useStore } from "../store-context";
import { getCartToken } from "../cart/cart-token";
import { useCustomerSession } from "./CustomerSession";

// Sign-in, sign-up and password recovery of the storefront customer (phone + password, D1).

/** Where to go after signing in: ?next=/checkout (same-site paths only), the account otherwise. */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/account";
}

type FormState = { pending: boolean; error: string | null; fields: Record<string, string[]> };
const idle: FormState = { pending: false, error: null, fields: {} };

function useApiForm() {
  const [state, setState] = useState<FormState>(idle);
  async function run(action: () => Promise<void>) {
    setState({ pending: true, error: null, fields: {} });
    try {
      await action();
      setState(idle);
    } catch (error) {
      setState({
        pending: false,
        error: error instanceof ApiError ? error.message : "No se pudo conectar. Revisa tu conexión.",
        fields: error instanceof ApiError ? (error.fields ?? {}) : {},
      });
    }
  }
  return { ...state, run };
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string[];
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError>{error?.[0]}</FieldError>
    </div>
  );
}

const PhoneInput = ({ invalid }: { invalid?: boolean }) => (
  <Input
    id="phone"
    name="phone"
    type="tel"
    inputMode="tel"
    autoComplete="tel"
    placeholder="5123 4567"
    required
    aria-invalid={invalid || undefined}
  />
);

export function CustomerLoginForm() {
  const store = useStore();
  const publicApi = usePublicApi();
  const { signIn } = useCustomerSession();
  const router = useRouter();
  const form = useApiForm();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    form.run(async () => {
      const result = await publicApi.customerAuth(store.id).login({
        phone: String(data.get("phone") ?? ""),
        password: String(data.get("password") ?? ""),
        cartToken: getCartToken(store.id),
      });
      await signIn(result);
      router.replace(nextPath());
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field id="phone" label="Teléfono" error={form.fields.phone}>
        <PhoneInput invalid={!!form.fields.phone} />
      </Field>
      <Field id="password" label="Contraseña" error={form.fields.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {form.error && <Alert variant="destructive">{form.error}</Alert>}
      <Button type="submit" disabled={form.pending}>
        {form.pending ? "Entrando…" : "Entrar"}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/account/recover" className="underline">
          ¿Olvidaste tu contraseña?
        </Link>
        <Link href="/account/register" className="font-medium underline">
          Crear cuenta
        </Link>
      </div>
    </form>
  );
}

export function CustomerRegisterForm() {
  const store = useStore();
  const publicApi = usePublicApi();
  const { signIn } = useCustomerSession();
  const router = useRouter();
  const form = useApiForm();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    form.run(async () => {
      const result = await publicApi.customerAuth(store.id).register({
        firstName: String(data.get("firstName") ?? ""),
        lastName: String(data.get("lastName") ?? "") || undefined,
        phone: String(data.get("phone") ?? ""),
        password: String(data.get("password") ?? ""),
        acceptsMarketing: data.get("acceptsMarketing") === "on",
        cartToken: getCartToken(store.id),
      });
      await signIn(result);
      router.replace(nextPath());
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="firstName" label="Nombre" error={form.fields.firstName}>
          <Input id="firstName" name="firstName" autoComplete="given-name" required />
        </Field>
        <Field id="lastName" label="Apellidos (opcional)" error={form.fields.lastName}>
          <Input id="lastName" name="lastName" autoComplete="family-name" />
        </Field>
      </div>
      <Field id="phone" label="Teléfono (con WhatsApp)" error={form.fields.phone}>
        <PhoneInput invalid={!!form.fields.phone} />
      </Field>
      <Field id="password" label="Contraseña (mínimo 8 caracteres)" error={form.fields.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acceptsMarketing" className="mt-1" />
        Quiero recibir novedades y ofertas de {store.name}.
      </label>
      {form.error && <Alert variant="destructive">{form.error}</Alert>}
      <Button type="submit" disabled={form.pending}>
        {form.pending ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Tu cuenta es solo de {store.name}.{" "}
        <Link href="/account/login" className="font-medium text-foreground underline">
          Ya tengo cuenta
        </Link>
      </p>
    </form>
  );
}

/** Without automatic WhatsApp messages yet (decision 23) the store sends the code by hand. */
export function CustomerRecoverForm() {
  const store = useStore();
  const publicApi = usePublicApi();
  const { signIn } = useCustomerSession();
  const router = useRouter();
  const form = useApiForm();
  const [phone, setPhone] = useState("");
  const normalized = normalizePhone(phone);

  const askText = normalized
    ? `Hola, ${store.name}. Olvidé la contraseña de mi cuenta en la tienda. Mi teléfono es ${formatPhone(normalized)}. ¿Me envían un código?`
    : undefined;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    form.run(async () => {
      const result = await publicApi.customerAuth(store.id).reset({
        phone,
        code: String(data.get("code") ?? ""),
        password: String(data.get("password") ?? ""),
      });
      await signIn(result);
      router.replace("/account");
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field id="phone" label="Tu teléfono" error={form.fields.phone}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="5123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
      </Field>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
        <li>Pide a la tienda un código de recuperación por WhatsApp.</li>
        <li>Escribe aquí el código y tu nueva contraseña.</li>
      </ol>
      {store.whatsappPhone && (
        <a
          href={normalized && askText ? whatsappLink(store.whatsappPhone, askText) : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!normalized}
          className="inline-flex h-10 items-center justify-center rounded-sf-btn border px-4 text-sm font-medium aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          Pedir código por WhatsApp
        </a>
      )}
      <Field id="code" label="Código de 6 dígitos" error={form.fields.code}>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
        />
      </Field>
      <Field id="password" label="Nueva contraseña (mínimo 8 caracteres)" error={form.fields.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      {form.error && <Alert variant="destructive">{form.error}</Alert>}
      <Button type="submit" disabled={form.pending}>
        {form.pending ? "Guardando…" : "Cambiar contraseña y entrar"}
      </Button>
      <Link href="/account/login" className="text-sm underline">
        Volver a entrar
      </Link>
    </form>
  );
}

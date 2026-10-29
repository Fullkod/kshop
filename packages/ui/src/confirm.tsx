"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button, Input, Label } from "./components";
import { Dialog } from "./dialog";

// R14: confirmations in the Kshop dialog instead of window.confirm / window.prompt. One provider per app (store admin,
// superadmin, Kshop Admin); call sites await the answer:
//   const { confirm } = useConfirm();
//   if (!(await confirm({ title: "¿Borrar «X»?", tone: "destructive", confirmLabel: "Borrar" }))) return;
//   const reason = await prompt({ title: "Cancelar pedido", input: { label: "Motivo (opcional)" } }); // null = cancel

export type ConfirmOptions = {
  title: ReactNode;
  description?: ReactNode;
  /** Text of the confirm button (default «Aceptar»). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions get a red button and the focus starts on «Cancelar». */
  tone?: "default" | "destructive";
};

export type PromptOptions = ConfirmOptions & {
  input: {
    label: string;
    type?: "text" | "date";
    required?: boolean;
    placeholder?: string;
    defaultValue?: string;
    maxLength?: number;
  };
};

type ConfirmApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** The typed value (trimmed; "" when left empty and not required), or null when cancelled. */
  prompt: (options: PromptOptions) => Promise<string | null>;
};

type Request =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

const ConfirmContext = createContext<ConfirmApi | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setRequest({ kind: "confirm", options, resolve })),
    [],
  );
  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => setRequest({ kind: "prompt", options, resolve })),
    [],
  );
  const api = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  function cancel() {
    if (!request) return;
    if (request.kind === "confirm") request.resolve(false);
    else request.resolve(null);
    setRequest(null);
  }

  function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!request) return;
    if (request.kind === "confirm") request.resolve(true);
    else request.resolve(String(new FormData(event.currentTarget).get("value") ?? "").trim());
    setRequest(null);
  }

  const options = request?.options;
  const destructive = options?.tone === "destructive";
  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <Dialog
        open={request !== null}
        onClose={cancel}
        title={options?.title ?? ""}
        initialFocus={request?.kind === "prompt" ? inputRef : destructive ? cancelRef : undefined}
        compact
      >
        {request && options && (
          <form onSubmit={accept} className="flex flex-col gap-4" data-testid="confirm-dialog">
            {options.description && (
              <div className="text-sm text-muted-foreground">{options.description}</div>
            )}
            {request.kind === "prompt" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor={inputId}>{request.options.input.label}</Label>
                <Input
                  ref={inputRef}
                  id={inputId}
                  name="value"
                  type={request.options.input.type ?? "text"}
                  required={request.options.input.required}
                  placeholder={request.options.input.placeholder}
                  defaultValue={request.options.input.defaultValue}
                  maxLength={request.options.input.maxLength}
                />
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button ref={cancelRef} type="button" variant="ghost" onClick={cancel}>
                {options.cancelLabel ?? "Cancelar"}
              </Button>
              <Button type="submit" variant={destructive ? "destructive" : "default"}>
                {options.confirmLabel ?? "Aceptar"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmApi {
  const api = useContext(ConfirmContext);
  if (!api) throw new Error("useConfirm must be used inside a ConfirmProvider");
  return api;
}

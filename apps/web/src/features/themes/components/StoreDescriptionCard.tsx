"use client";

import { Alert, Button, Card, Label } from "@kshop/ui";
import { useState } from "react";
import { useApiAction } from "@/features/catalog/use-catalog";

const MAX = 300;

/** Short text shown in the storefront footer under the store's name (empty = not shown). */
export function StoreDescriptionCard({
  initial,
  save,
}: {
  initial: string | null;
  save: (description: string) => Promise<unknown>;
}) {
  const action = useApiAction();
  const [text, setText] = useState(initial ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <Card className="flex flex-col gap-3 lg:max-w-[calc(100%-23.5rem)]">
      <h2 className="font-semibold">Pie de la tienda</h2>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="store-description">Descripción</Label>
        <textarea
          id="store-description"
          value={text}
          maxLength={MAX}
          rows={3}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          placeholder="Moda y hogar con entrega en La Habana. Te atendemos por WhatsApp de 9:00 a 20:00."
          className="rounded-sf-btn border border-border bg-background px-3.5 py-2.5 text-[15px] outline-none focus-visible:border-primary focus-visible:shadow-[0_0_0_4px_var(--ring)]"
        />
        <p className="text-xs text-muted-foreground">
          Se muestra en el pie, bajo el nombre de la tienda. {text.length}/{MAX}
        </p>
      </div>
      {action.error && <Alert variant="destructive">{action.error}</Alert>}
      {saved && <Alert variant="success">Descripción guardada.</Alert>}
      <div>
        <Button
          variant="outline"
          disabled={action.pending}
          onClick={async () => {
            if (await action.run(() => save(text))) setSaved(true);
          }}
        >
          {action.pending ? "Guardando…" : "Guardar descripción"}
        </Button>
      </div>
    </Card>
  );
}

"use client";

import type { ImportPreview, ImportProgress } from "@kshop/core";
import type { DownloadedFile } from "@kshop/data";
import { Alert, Badge, Button, buttonVariants, Card, Label, Select } from "@kshop/ui";
import Link from "next/link";
import { useState } from "react";
import { useApiAction, useCatalogApi, useCatalogStructure } from "@/features/catalog/use-catalog";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Same limit as the store-imports bucket (10 MB). */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type Mode = "create_only" | "upsert";
type Step =
  | { name: "upload" }
  | { name: "preview"; preview: ImportPreview }
  | { name: "importing"; preview: ImportPreview; progress: ImportProgress | null }
  | {
      name: "done";
      progress: ImportProgress;
      failed: ImportProgress["failed"];
      warnings: ImportProgress["warnings"];
    };

function saveFile({ blob, fileName }: DownloadedFile) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Excel template/export per product type and the import wizard: upload → preview → import in batches. */
export function ExcelImportPage() {
  const store = useStore();
  const { supabase } = useSession();
  const { data, error } = useCatalogStructure();
  const { catalog, canManageStructure } = useCatalogApi();
  const action = useApiAction();
  const [typeId, setTypeId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("create_only");
  const [createMissing, setCreateMissing] = useState(true);
  const [step, setStep] = useState<Step>({ name: "upload" });

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;
  if (!canManageStructure) {
    return (
      <Alert variant="destructive">Solo los administradores de la tienda pueden importar productos.</Alert>
    );
  }
  if (data.productTypes.length === 0) {
    return (
      <Card className="max-w-xl">
        <h1 className="text-2xl font-semibold">Importar Excel</h1>
        <p className="mt-2 text-muted-foreground">
          Primero crea un tipo de producto: la plantilla tiene una columna por cada atributo del tipo.
        </p>
        <Link className="mt-4 inline-block text-sm font-medium underline" href="/admin/catalog/product-types">
          Ir a tipos de producto
        </Link>
      </Card>
    );
  }

  const productTypeId = typeId || data.productTypes[0]!.id;
  const typeName = data.productTypes.find((t) => t.id === productTypeId)?.name ?? "";
  const busy = action.pending || step.name === "importing";

  async function review() {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      action.setError("El archivo pesa más de 10 MB.");
      return;
    }
    const preview = await action.run(async () => {
      const fileKey = `stores/${store.id}/imports/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const uploaded = await supabase.storage
        .from("store-imports")
        .upload(fileKey, file, { contentType: XLSX_TYPE, upsert: false });
      if (uploaded.error) throw new Error("No se pudo subir el archivo.");
      return catalog.createImport({ fileKey, fileName: file.name, productTypeId, mode, createMissing });
    });
    if (preview) setStep({ name: "preview", preview });
  }

  async function runImport(preview: ImportPreview) {
    setStep({ name: "importing", preview, progress: null });
    const failed: ImportProgress["failed"] = [];
    const warnings: ImportProgress["warnings"] = [];
    for (;;) {
      const progress = await action.run(() => catalog.runImport(preview.jobId));
      if (!progress) {
        // Rows already applied stay applied; running again continues where it stopped.
        setStep({ name: "preview", preview });
        return;
      }
      failed.push(...progress.failed);
      warnings.push(...progress.warnings);
      if (progress.done) {
        setStep({ name: "done", progress, failed, warnings });
        return;
      }
      setStep({ name: "importing", preview, progress });
    }
  }

  function restart() {
    setFile(null);
    action.setError(null);
    setStep({ name: "upload" });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Importar y exportar Excel</h1>
        <p className="text-sm text-muted-foreground">
          Una fila por variante. Las filas con el mismo código de producto forman un producto.
        </p>
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="product-type">Tipo de producto</Label>
          <Select
            id="product-type"
            value={productTypeId}
            disabled={busy || step.name !== "upload"}
            onChange={(e) => setTypeId(e.target.value)}
          >
            {data.productTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void action.run(() => catalog.excelTemplate(productTypeId)).then((f) => f && saveFile(f))
            }
          >
            Descargar plantilla
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void action.run(() => catalog.excelExport(productTypeId)).then((f) => f && saveFile(f))
            }
          >
            Exportar productos de «{typeName}»
          </Button>
        </div>
      </Card>

      {action.error && <Alert variant="destructive">{action.error}</Alert>}

      {step.name === "upload" && (
        <Card>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void review();
            }}
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor="excel-file">Archivo Excel (.xlsx)</Label>
              <input
                id="excel-file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="text-sm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            <fieldset className="flex flex-col gap-2 text-sm">
              <legend className="mb-1 text-sm font-medium">Productos que ya existen (mismo SKU)</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "create_only"}
                  onChange={() => setMode("create_only")}
                />
                Dejarlos como están (solo crear productos nuevos)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "upsert"}
                  onChange={() => setMode("upsert")}
                />
                Actualizarlos con los datos del Excel
              </label>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={createMissing}
                onChange={(e) => setCreateMissing(e.target.checked)}
              />
              Crear las categorías, marcas, colecciones y valores de atributo que falten
            </label>
            <div>
              <Button type="submit" disabled={busy || !file}>
                {action.pending ? "Revisando…" : "Revisar archivo"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {(step.name === "preview" || step.name === "importing") && (
        <PreviewCard
          preview={step.preview}
          progress={step.name === "importing" ? step.progress : null}
          importing={step.name === "importing"}
          onImport={() => void runImport(step.preview)}
          onCancel={restart}
        />
      )}

      {step.name === "done" && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Importación terminada</h2>
          <ul className="text-sm">
            <li>Productos creados: {step.progress.created}</li>
            <li>Productos actualizados: {step.progress.updated}</li>
            <li>Productos omitidos: {step.progress.skipped}</li>
          </ul>
          {step.failed.length > 0 && (
            <Alert variant="destructive">
              <p className="font-medium">No se pudieron importar {step.failed.length} productos:</p>
              <ul className="mt-1 list-disc pl-5">
                {step.failed.map((f) => (
                  <li key={f.productKey}>
                    {f.productKey}: {f.error}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          {step.warnings.length > 0 && (
            <Alert>
              <p className="font-medium">Importados con avisos ({step.warnings.length}):</p>
              <ul className="mt-1 list-disc pl-5">
                {step.warnings.map((w, i) => (
                  <li key={i}>
                    {w.productKey}: {w.error}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/catalog" className={buttonVariants()}>
              Ver productos
            </Link>
            <Button variant="outline" onClick={restart}>
              Importar otro archivo
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function PreviewCard({
  preview,
  progress,
  importing,
  onImport,
  onCancel,
}: {
  preview: ImportPreview;
  progress: ImportProgress | null;
  importing: boolean;
  onImport: () => void;
  onCancel: () => void;
}) {
  const { products, toCreate, limit, errorRows } = preview;
  const toApply = products.create + products.update;
  const created = Object.entries({
    Categorías: toCreate.categories,
    Marcas: toCreate.brands,
    Colecciones: toCreate.collections,
    "Valores de atributo": toCreate.values,
  }).filter(([, names]) => names.length > 0);
  const percent =
    progress && progress.totalProducts > 0
      ? Math.min(100, Math.round((progress.processedProducts / progress.totalProducts) * 100))
      : 0;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Vista previa</h2>
        <p className="text-sm text-muted-foreground">{preview.totalRows} filas leídas.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge>{products.create} nuevos</Badge>
        <Badge variant="muted">{products.update} a actualizar</Badge>
        <Badge variant="muted">{products.skip} omitidos</Badge>
        {errorRows.length > 0 && (
          <Badge variant="destructive">
            {errorRows.length} {errorRows.length === 1 ? "fila" : "filas"} con error
          </Badge>
        )}
      </div>

      {limit.exceeded && (
        <Alert variant="destructive">
          Tu plan permite {limit.max} productos. Ya tienes {limit.current} y este archivo añade{" "}
          {limit.newProducts}. Quita productos del archivo o cambia al plan Pro.
        </Alert>
      )}

      {created.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">Se crearán:</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {created.map(([label, names]) => (
              <li key={label}>
                {label}: {names.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {errorRows.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">
            Filas con error (sus productos no se importan; corrígelas en el Excel y vuelve a subirlo):
          </p>
          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1">Fila</th>
                  <th className="px-2 py-1">Producto</th>
                  <th className="px-2 py-1">Error</th>
                </tr>
              </thead>
              <tbody>
                {errorRows.map((r) => (
                  <tr key={r.row} className="border-t align-top">
                    <td className="px-2 py-1">{r.row}</td>
                    <td className="px-2 py-1">{r.productKey}</td>
                    <td className="px-2 py-1">{r.errors.join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {importing && (
        <div className="flex flex-col gap-1" aria-live="polite">
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">Importando… {percent}%</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={onImport} disabled={importing || limit.exceeded || toApply === 0}>
          {importing ? "Importando…" : `Importar ${toApply} productos`}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={importing}>
          Subir otro archivo
        </Button>
      </div>
    </Card>
  );
}

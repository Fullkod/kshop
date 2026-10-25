import "server-only";
import { HttpError } from "./http";

type DbError = { code?: string; message?: string; details?: string | null; hint?: string | null };

function isDbError(error: unknown): error is DbError {
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}

const FIELD_BY_CONSTRAINT: [RegExp, string][] = [
  [/_slug_key|slug/, "slug"],
  [/_sku_key|sku/, "sku"],
];

/** Turns Postgres/PostgREST errors from catalog writes into HttpErrors with Spanish messages. */
export function mapDbError(error: unknown, entity = "El registro"): never {
  if (!isDbError(error)) throw error;
  const text = `${error.message ?? ""} ${error.details ?? ""}`;

  switch (error.code) {
    case "23505": {
      const field = FIELD_BY_CONSTRAINT.find(([pattern]) => pattern.test(text))?.[1];
      const message =
        field === "sku"
          ? "Ese SKU ya existe en la tienda."
          : field === "slug"
            ? "Ya existe otro con esa URL (slug)."
            : `${entity} ya existe.`;
      throw new HttpError(409, "conflict", message, field ? { [field]: [message] } : undefined);
    }
    case "23503":
      // "update or delete on table X violates foreign key constraint ... on table Y": something points to it.
      if (/update or delete on table/.test(text)) {
        throw new HttpError(409, "in_use", `${entity} está en uso y no se puede borrar.`);
      }
      throw new HttpError(400, "invalid_reference", "Alguna referencia no existe en esta tienda.");
    case "23514":
      if (/depth/.test(text))
        throw new HttpError(400, "too_deep", "Las categorías admiten como máximo 3 niveles.");
      if (/inside itself/.test(text))
        throw new HttpError(400, "invalid_move", "No puedes mover una categoría dentro de sí misma.");
      if (error.hint === "below_allocated") {
        throw new HttpError(
          409,
          "below_allocated",
          "No puedes dejar menos unidades que las reservadas por pedidos.",
        );
      }
      throw new HttpError(400, "invalid_data", "Algún dato no es válido.");
    case "P0001":
      if (error.hint === "module_not_enabled") {
        throw new HttpError(
          403,
          "module_not_enabled",
          "Esta función no está incluida en el plan de la tienda.",
        );
      }
      if (error.hint === "max_products") {
        throw new HttpError(
          409,
          "limit_reached",
          "Llegaste al límite de productos de tu plan. Archiva alguno o mejora el plan.",
        );
      }
      throw new HttpError(400, "invalid_data", error.message ?? "Operación no válida.");
    case "P0002":
      throw new HttpError(404, "not_found", `${entity} no existe.`);
    case "22P02":
      throw new HttpError(400, "invalid_data", "Algún identificador no es válido.");
    default:
      throw error;
  }
}

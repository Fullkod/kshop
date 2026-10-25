import "server-only";
import type { ApiErrorBody } from "@kshop/data";
import { NextResponse } from "next/server";
import { z } from "zod";

/** Error with an HTTP status, turned into the common error body by `apiHandler`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, "unauthorized", "Inicia sesión para continuar.");
export const forbidden = () => new HttpError(403, "forbidden", "No tienes permiso para esta acción.");
export const notFound = (what = "Recurso") => new HttpError(404, "not_found", `${what} no encontrado.`);

function errorResponse(error: HttpError) {
  const body: ApiErrorBody = {
    error: { code: error.code, message: error.message, ...(error.fields && { fields: error.fields }) },
  };
  return NextResponse.json(body, { status: error.status });
}

/** Wraps a route handler: maps HttpError/ZodError to the common error body and hides unexpected errors. */
export function apiHandler<TArgs extends unknown[]>(handler: (...args: TArgs) => Promise<Response>) {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error);
      if (error instanceof z.ZodError) {
        const { fieldErrors } = z.flattenError(error);
        return errorResponse(
          new HttpError(
            400,
            "validation_error",
            "Revisa los datos del formulario.",
            fieldErrors as Record<string, string[]>,
          ),
        );
      }
      console.error("[api] unexpected error", error);
      return errorResponse(new HttpError(500, "internal_error", "Error inesperado. Inténtalo de nuevo."));
    }
  };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid_json", "El cuerpo de la petición no es JSON válido.");
  }
}

export const uuidParam = z.uuid();

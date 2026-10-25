import "server-only";
import { catalogSlug } from "@kshop/core";
import { uuidParam } from "../http";
import { getServiceClient } from "../supabase";

/** productTypeId from the query string, validated. */
export function productTypeParam(request: Request): string {
  return uuidParam.parse(new URL(request.url).searchParams.get("productTypeId"));
}

/** Download response for a generated workbook ("plantilla-ropa.xlsx"). */
export async function xlsxResponse(storeId: string, productTypeId: string, prefix: string, body: Buffer) {
  const { data } = await getServiceClient()
    .from("product_types")
    .select("slug")
    .eq("store_id", storeId)
    .eq("id", productTypeId)
    .maybeSingle();
  const name = `${prefix}-${data?.slug ?? catalogSlug(productTypeId)}.xlsx`;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

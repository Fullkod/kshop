import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { checkCustomDomain } from "@/server/custom-domains";
import { apiHandler } from "@/server/http";

// POST /api/v1/stores/{storeId}/custom-domain/check  (owner/admin, custom_domain) -> { domain }
// Asks Vercel whether the DNS is right; verified -> the store is served on the domain within a minute.
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/custom-domain/check">) => {
    const { storeId } = await requireCatalogAccess(
      request,
      (await ctx.params).storeId,
      "admin",
      "custom_domain",
    );
    return NextResponse.json({ domain: await checkCustomDomain(storeId) });
  },
);

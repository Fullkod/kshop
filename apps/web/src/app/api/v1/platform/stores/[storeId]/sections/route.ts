import { sectionVisibilityInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { apiHandler, readJson, uuidParam } from "@/server/http";
import { getStoreSections, setStoreSection } from "@/server/store-sections";

// GET /api/v1/platform/stores/{storeId}/sections  (superadmin)
// Sections of the store's admin menu that are not visible: { sections: { "<section>": "managed" | "hidden" } }.
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/stores/[storeId]/sections">) => {
    await requireSuperadmin(request);
    const storeId = uuidParam.parse((await ctx.params).storeId);
    return NextResponse.json({ sections: await getStoreSections(storeId) });
  },
);

// PUT /api/v1/platform/stores/{storeId}/sections  { section, visibility: visible | managed | hidden }  (superadmin)
export const PUT = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/stores/[storeId]/sections">) => {
    const user = await requireSuperadmin(request);
    const storeId = uuidParam.parse((await ctx.params).storeId);
    const input = sectionVisibilityInputSchema.parse(await readJson(request));
    await setStoreSection(storeId, input, user.id);
    return NextResponse.json({ sections: await getStoreSections(storeId) });
  },
);

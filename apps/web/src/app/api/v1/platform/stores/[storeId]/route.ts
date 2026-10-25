import { updateStoreStatusInputSchema } from "@kshop/core";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { apiHandler, readJson, uuidParam } from "@/server/http";
import { updatePlatformStoreStatus } from "@/server/platform-stores";
import { storeCacheTag } from "@/server/stores";

export const PATCH = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/stores/[storeId]">) => {
    await requireSuperadmin(request);
    const storeId = uuidParam.parse((await ctx.params).storeId);
    const { status } = updateStoreStatusInputSchema.parse(await readJson(request));

    const store = await updatePlatformStoreStatus(storeId, status);
    // The storefront must reflect a suspension right away.
    revalidateTag(storeCacheTag(store.slug), { expire: 0 });
    return NextResponse.json({ store });
  },
);

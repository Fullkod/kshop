import { MODULE_CODES, moduleAddonPriceSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/server/auth";
import { setAddonPrice } from "@/server/billing";
import { apiHandler, readJson } from "@/server/http";

// PUT /api/v1/platform/modules/{code}  { addonPrice: number | null }  (USD/month; null = only inside a plan)
export const PUT = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/modules/[code]">) => {
    await requireSuperadmin(request);
    const code = z.enum(MODULE_CODES).parse((await ctx.params).code);
    const { addonPrice } = moduleAddonPriceSchema.parse(await readJson(request));
    return NextResponse.json(await setAddonPrice(code, addonPrice));
  },
);

import { z } from "zod";
import { setAppBuildPublished } from "@/server/app-builds";
import { requireSuperadmin } from "@/server/auth";
import { apiHandler, readJson, uuidParam } from "@/server/http";

const bodySchema = z.object({ published: z.boolean() });

// PATCH /api/v1/platform/apps/builds/{buildId}  (superadmin) { published } -> 204
export const PATCH = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/apps/builds/[buildId]">) => {
    await requireSuperadmin(request);
    const { published } = bodySchema.parse(await readJson(request));
    await setAppBuildPublished(uuidParam.parse((await ctx.params).buildId), published);
    return new Response(null, { status: 204 });
  },
);

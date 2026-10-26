import { requireSuperadmin } from "@/server/auth";
import { removePlatformDomain } from "@/server/custom-domains";
import { apiHandler, uuidParam } from "@/server/http";

// DELETE /api/v1/platform/domains/{domainId}  (superadmin) -> 204 (also removed from Vercel)
export const DELETE = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/domains/[domainId]">) => {
    await requireSuperadmin(request);
    await removePlatformDomain(uuidParam.parse((await ctx.params).domainId));
    return new Response(null, { status: 204 });
  },
);

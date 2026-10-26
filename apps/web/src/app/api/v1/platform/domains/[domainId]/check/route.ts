import { requireSuperadmin } from "@/server/auth";
import { checkPlatformDomain } from "@/server/custom-domains";
import { apiHandler, uuidParam } from "@/server/http";

// POST /api/v1/platform/domains/{domainId}/check  (superadmin) -> 204, the list shows the new status
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/platform/domains/[domainId]/check">) => {
    await requireSuperadmin(request);
    await checkPlatformDomain(uuidParam.parse((await ctx.params).domainId));
    return new Response(null, { status: 204 });
  },
);

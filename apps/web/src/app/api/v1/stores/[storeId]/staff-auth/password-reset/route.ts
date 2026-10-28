import { staffPasswordResetSchema } from "@kshop/core";
import { apiHandler, readJson, uuidParam } from "@/server/http";
import { requestStaffPasswordReset } from "@/server/staff-access";

// POST /api/v1/stores/{storeId}/staff-auth/password-reset  { email }  (no token)
// «¿Olvidaste tu contraseña?» of the store admin: emails a one-time access link to staff of the store. Always 204.
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/staff-auth/password-reset">) => {
    const storeId = uuidParam.parse((await ctx.params).storeId);
    const input = staffPasswordResetSchema.parse(await readJson(request));
    await requestStaffPasswordReset(storeId, input, request);
    return new Response(null, { status: 204 });
  },
);

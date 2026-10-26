import { teamInviteSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { getUserFromBearer, requireStoreRole } from "@/server/auth";
import { apiHandler, readJson, uuidParam } from "@/server/http";
import { inviteMember, listTeam } from "@/server/team";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/team">;

// GET /api/v1/stores/{id}/team  (owner/admin)  -> { members, usage: {limit, used} }
export const GET = apiHandler(async (request: Request, ctx: Ctx) => {
  const storeId = uuidParam.parse((await ctx.params).storeId);
  const user = await getUserFromBearer(request);
  await requireStoreRole(user, storeId, "admin");
  return NextResponse.json(await listTeam(storeId, user));
});

// POST { email, role: admin|staff }  -> member + one-time access link to send by WhatsApp. 409 limit_reached at
// max_staff; only the owner adds admins.
export const POST = apiHandler(async (request: Request, ctx: Ctx) => {
  const storeId = uuidParam.parse((await ctx.params).storeId);
  const user = await getUserFromBearer(request);
  await requireStoreRole(user, storeId, "admin");
  const input = teamInviteSchema.parse(await readJson(request));
  return NextResponse.json(await inviteMember(storeId, input, user), { status: 201 });
});

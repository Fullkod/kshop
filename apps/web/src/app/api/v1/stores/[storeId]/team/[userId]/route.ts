import { teamRoleSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { getUserFromBearer, requireStoreRole } from "@/server/auth";
import { apiHandler, readJson, uuidParam } from "@/server/http";
import { removeMember, updateMemberRole } from "@/server/team";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/team/[userId]">;

// PATCH { role: admin|staff }  (the owner changes admins; admins only staff)
export const PATCH = apiHandler(async (request: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const storeId = uuidParam.parse(params.storeId);
  const user = await getUserFromBearer(request);
  await requireStoreRole(user, storeId, "admin");
  const { role } = teamRoleSchema.parse(await readJson(request));
  return NextResponse.json(await updateMemberRole(storeId, uuidParam.parse(params.userId), role, user));
});

// DELETE  (removes the access to this store; the account itself stays: it may belong to other stores)
export const DELETE = apiHandler(async (request: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const storeId = uuidParam.parse(params.storeId);
  const user = await getUserFromBearer(request);
  await requireStoreRole(user, storeId, "admin");
  await removeMember(storeId, uuidParam.parse(params.userId), user);
  return new NextResponse(null, { status: 204 });
});

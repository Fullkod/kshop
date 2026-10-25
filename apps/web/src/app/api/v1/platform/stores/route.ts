import { createStoreInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/server/auth";
import { apiHandler, readJson } from "@/server/http";
import { createPlatformStore, listPlatformStores } from "@/server/platform-stores";

export const GET = apiHandler(async (request: Request) => {
  await requireSuperadmin(request);
  return NextResponse.json({ stores: await listPlatformStores() });
});

export const POST = apiHandler(async (request: Request) => {
  const user = await requireSuperadmin(request);
  const input = createStoreInputSchema.parse(await readJson(request));
  return NextResponse.json(await createPlatformStore(input, user.id), { status: 201 });
});

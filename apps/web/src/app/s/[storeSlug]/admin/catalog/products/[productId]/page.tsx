"use client";

import { ProductEditor } from "@kshop/admin";
import { useRouteParam } from "@/lib/use-route-param";

export default function EditProductPage() {
  const productId = useRouteParam("productId");
  return <ProductEditor key={productId} productId={productId} />;
}

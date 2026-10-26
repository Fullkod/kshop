"use client";

import { useParams } from "next/navigation";
import { ProductEditor } from "@kshop/admin";

export default function EditProductPage() {
  const { productId } = useParams<{ productId: string }>();
  return <ProductEditor key={productId} productId={productId} />;
}

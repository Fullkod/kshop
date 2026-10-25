"use client";

import { useParams } from "next/navigation";
import { ProductEditor } from "@/features/catalog/components/ProductEditor";

export default function EditProductPage() {
  const { productId } = useParams<{ productId: string }>();
  return <ProductEditor key={productId} productId={productId} />;
}

"use client";

import { Alert } from "@kshop/ui";
import { ExcelImportPage } from "@/features/excel-import/components/ExcelImportPage";
import { useAdmin } from "../admin-context";

export default function AdminExcelImportPage() {
  const admin = useAdmin();
  if (!admin.enabledModules.has("excel_import")) {
    return <Alert variant="destructive">«Importar Excel» no está incluido en el plan de tu tienda.</Alert>;
  }
  return <ExcelImportPage />;
}

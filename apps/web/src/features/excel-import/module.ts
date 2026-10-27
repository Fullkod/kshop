import { FileSpreadsheet } from "@kshop/ui";
import type { AdminModule } from "../types";

export const excelImportModule: AdminModule = {
  code: "excel_import",
  label: "Importar Excel",
  adminPath: "/admin/excel-import",
  group: "catalog",
  icon: FileSpreadsheet,
  availableInPhase: 1,
};

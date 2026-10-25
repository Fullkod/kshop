"use client";

import { notFound, useParams } from "next/navigation";
import {
  APPEARANCE_TABS,
  AppearancePage,
  type AppearanceTab,
} from "@/features/themes/components/AppearancePage";

export default function ThemesTabPage() {
  const { tab } = useParams<{ tab: string }>();
  if (tab === "theme" || !APPEARANCE_TABS.some((t) => t.key === tab)) notFound();
  return <AppearancePage tab={tab as AppearanceTab} />;
}

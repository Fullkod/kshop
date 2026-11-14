"use client";

import { HelpCenter } from "@kshop/admin/help";
import Link from "next/link";

/** The store help as the owner sees it (the filter shows the staff's guides too). */
export function PublicHelp() {
  return <HelpCenter scope="store" viewer="owner" linkAs={Link} publicPage />;
}

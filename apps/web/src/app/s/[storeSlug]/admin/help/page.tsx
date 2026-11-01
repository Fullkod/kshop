"use client";

import { HelpCenter, helpViewerForRole } from "@kshop/admin/help";
import Link from "next/link";
import { useAdmin } from "../admin-context";

/** Admin › Ayuda (KSH0005): the whole store help, filtered by default to the reader's role. */
export default function AdminHelpPage() {
  const admin = useAdmin();
  return <HelpCenter scope="store" viewer={helpViewerForRole(admin.role)} linkAs={Link} />;
}

"use client";

import { HelpCenter } from "@kshop/admin/help";
import Link from "next/link";

/** Superadmin › Ayuda (KSH0005): only the superadmin's guides. */
export default function SuperadminHelpPage() {
  return <HelpCenter scope="superadmin" viewer="superadmin" linkAs={Link} />;
}

export const STORE_ROLES = ["owner", "admin", "staff"] as const;
export type StoreRole = (typeof STORE_ROLES)[number];

const ROLE_RANK: Record<StoreRole, number> = { owner: 3, admin: 2, staff: 1 };

/** True when `role` grants at least the permissions of `minRole` (owner > admin > staff). */
export function hasMinRole(role: StoreRole, minRole: StoreRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export const ROLE_LABELS: Record<StoreRole, string> = {
  owner: "Dueño",
  admin: "Administrador",
  staff: "Empleado",
};

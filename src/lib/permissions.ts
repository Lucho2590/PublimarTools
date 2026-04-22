import { EUserRole } from "@/types/user";

const RESTRICTED_PREFIXES: Array<{ prefix: string; allowed: EUserRole[] }> = [
  { prefix: "/publimar/sudo", allowed: [EUserRole.SUPERUSER] },
  {
    prefix: "/publimar/administracion",
    allowed: [EUserRole.SUPERUSER, EUserRole.ADMIN],
  },
];

export function canAccessRoute(
  role: EUserRole | null,
  pathname: string
): boolean {
  if (!role) return false;
  const rule = RESTRICTED_PREFIXES.find((r) => pathname.startsWith(r.prefix));
  return rule ? rule.allowed.includes(role) : true;
}

export function isAdminOrAbove(role: EUserRole | null): boolean {
  return role === EUserRole.ADMIN || role === EUserRole.SUPERUSER;
}

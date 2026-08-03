import { EUserRole } from "@/types/user";

const RESTRICTED_PREFIXES: Array<{ prefix: string; allowed: EUserRole[] }> = [
  { prefix: "/publimar/sudo", allowed: [EUserRole.SUPERUSER] },
  {
    prefix: "/publimar/administracion",
    allowed: [EUserRole.SUPERUSER, EUserRole.ADMIN],
  },
];

/**
 * Rutas renombradas. `users.permissions` guarda el href literal del módulo
 * (ver PermissionsTab), así que un rename de ruta dejaría afuera a quien ya
 * tenía el permiso otorgado. Se normaliza al leer en vez de migrar Firestore.
 */
const LEGACY_PATHS: Record<string, string> = {
  "/publimar/administracion/rentabilidad": "/publimar/administracion/analiticas",
};

function normalizeLegacyPath(p: string): string {
  for (const [legacy, current] of Object.entries(LEGACY_PATHS)) {
    if (p === legacy || p.startsWith(`${legacy}/`)) {
      return current + p.slice(legacy.length);
    }
  }
  return p;
}

export function canAccessRoute(
  role: EUserRole | null,
  pathname: string,
  permissions: string[] = []
): boolean {
  if (!role) return false;
  const rule = RESTRICTED_PREFIXES.find((r) => pathname.startsWith(r.prefix));
  if (!rule) return true;
  if (rule.allowed.includes(role)) return true;
  // Permisos aditivos por usuario: habilitan módulos puntuales aunque el rol
  // no alcance. `pathname.startsWith(p)` cubre el submódulo concreto y rutas
  // más profundas; `p.startsWith(pathname)` habilita la landing padre
  // (ej. "/publimar/administracion") cuando el permiso es un hijo.
  return permissions
    .map(normalizeLegacyPath)
    .some((p) => pathname.startsWith(p) || p.startsWith(pathname));
}

export function isAdminOrAbove(role: EUserRole | null): boolean {
  return role === EUserRole.ADMIN || role === EUserRole.SUPERUSER;
}

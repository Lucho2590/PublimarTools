import {
  TrendingUp,
  BarChart3,
  Wallet,
  Truck,
  CreditCard,
  Receipt,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Módulo que un SUPERUSER puede habilitar a un usuario puntual desde el
 * tablero de permisos de Sudo. El `href` es el path que se guarda en
 * `TUser.permissions` y que evalúa `canAccessRoute`.
 *
 * Hoy solo se exponen submódulos de Administración, pero la estructura está
 * lista para sumar otros grupos (Banderas, Vía Pública) sin cambiar la lógica.
 */
export type TGrantableModule = {
  key: string;
  label: string;
  href: string;
  group: string;
  icon: LucideIcon;
};

export const GRANTABLE_MODULES: TGrantableModule[] = [
  {
    key: "admin-finanzas",
    label: "Finanzas",
    href: "/publimar/administracion/finanzas",
    group: "Administración",
    icon: TrendingUp,
  },
  {
    key: "admin-analiticas",
    label: "Analíticas",
    href: "/publimar/administracion/analiticas",
    group: "Administración",
    icon: BarChart3,
  },
  {
    key: "admin-cuentas",
    label: "Cuentas",
    href: "/publimar/administracion/cuentas",
    group: "Administración",
    icon: Wallet,
  },
  {
    key: "admin-compras",
    label: "Compras",
    href: "/publimar/administracion/compras",
    group: "Administración",
    icon: Truck,
  },
  {
    key: "admin-cc-proveedores",
    label: "CC Proveedores",
    href: "/publimar/administracion/cuentasCorrientes",
    group: "Administración",
    icon: CreditCard,
  },
  {
    key: "admin-notas-credito",
    label: "Notas de Crédito",
    href: "/publimar/administracion/notas-credito",
    group: "Administración",
    icon: Receipt,
  },
  {
    key: "admin-gastos-operativos",
    label: "Gastos Operativos",
    href: "/publimar/administracion/gastos-operativos",
    group: "Administración",
    icon: Receipt,
  },
  {
    key: "admin-rrhh",
    label: "RRHH",
    href: "/publimar/administracion/rrhh",
    group: "Administración",
    icon: Users,
  },
];

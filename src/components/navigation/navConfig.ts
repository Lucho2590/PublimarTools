import {
  Home,
  Flag,
  Package,
  Users,
  FileText,
  ClipboardList,
  Banknote,
  Truck,
  Store,
  LayoutDashboard,
  ShoppingBag,
  ShoppingCart,
  BarChart3,
  Building2,
  MapPin,
  Calendar,
  Eye,
  LayoutGrid,
  LucideIcon,
} from "lucide-react";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: "unviewed";
  subItems?: NavItem[];
}

export const navConfig: NavItem[] = [
  {
    name: "Publimar",
    href: "/publimar",
    icon: Home,
  },
  {
    name: "Banderas",
    href: "/publimar/banderas",
    icon: Flag,
    subItems: [
      {
        name: "Productos",
        href: "/publimar/banderas/productos",
        icon: Package,
      },
      {
        name: "Clientes",
        href: "/publimar/banderas/clientes",
        icon: Users,
      },
      {
        name: "Presupuestos",
        href: "/publimar/banderas/presupuestos",
        icon: FileText,
      },
      {
        name: "Ordenes",
        href: "/publimar/banderas/ordenes",
        icon: ClipboardList,
      },
      {
        name: "Ventas",
        href: "/publimar/banderas/ventas",
        icon: Banknote,
      },
      {
        name: "Compras",
        href: "/publimar/banderas/compras",
        icon: Truck,
      },
      {
        name: "Tienda Online",
        href: "/publimar/banderas/tienda",
        icon: Store,
        badge: "unviewed",
        subItems: [
          {
            name: "Dashboard",
            href: "/publimar/banderas/tienda",
            icon: LayoutDashboard,
          },
          {
            name: "Pedidos",
            href: "/publimar/banderas/tienda/pedidos",
            icon: ShoppingBag,
          },
          {
            name: "Carritos Abandonados",
            href: "/publimar/banderas/tienda/carritos-abandonados",
            icon: ShoppingCart,
          },
          {
            name: "Analytics",
            href: "/publimar/banderas/tienda/analytics",
            icon: BarChart3,
          },
        ],
      },
    ],
  },
  {
    name: "Vía Pública",
    href: "/publimar/viaPublica",
    icon: Building2,
    subItems: [
      {
        name: "Ubicaciones",
        href: "/publimar/viaPublica/ubicaciones",
        icon: MapPin,
      },
      {
        name: "Clientes",
        href: "/publimar/viaPublica/clientes",
        icon: Users,
      },
      {
        name: "Presupuestos",
        href: "/publimar/viaPublica/presupuestos",
        icon: FileText,
      },
      {
        name: "Salidas",
        href: "/publimar/viaPublica/salidas",
        icon: Calendar,
      },
      {
        name: "Facturación",
        href: "/publimar/viaPublica/facturacion",
        icon: Banknote,
      },
      {
        name: "Exhibiciones",
        href: "/publimar/viaPublica/exhibiciones",
        icon: Eye,
      },
      {
        name: "Compras",
        href: "/publimar/viaPublica/compras",
        icon: Truck,
      },
      {
        name: "Partes Diarios",
        href: "/publimar/viaPublica/partesDiarios",
        icon: Calendar,
      },
    ],
  },
  {
    name: "Administración",
    href: "/publimar/administracion",
    icon: LayoutGrid,
  },
];

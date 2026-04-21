import { Timestamp } from "firebase/firestore";
import { EUserRole } from "@/types/user";

export enum EAuditSection {
  BANDERAS_VENTAS = "banderas_ventas",
  BANDERAS_STOCK = "banderas_stock",
  BANDERAS_PRODUCTOS = "banderas_productos",
  BANDERAS_CLIENTES = "banderas_clientes",
  BANDERAS_COMPRAS = "banderas_compras",
  VIA_PUBLICA = "via_publica",
  ADMINISTRACION = "administracion",
  PROVEEDORES = "proveedores",
  ECOMMERCE = "ecommerce",
  SUDO = "sudo",
}

export const AUDIT_SECTION_LABELS: Record<EAuditSection, string> = {
  [EAuditSection.BANDERAS_VENTAS]: "Ventas",
  [EAuditSection.BANDERAS_STOCK]: "Stock",
  [EAuditSection.BANDERAS_PRODUCTOS]: "Productos",
  [EAuditSection.BANDERAS_CLIENTES]: "Clientes",
  [EAuditSection.BANDERAS_COMPRAS]: "Compras",
  [EAuditSection.VIA_PUBLICA]: "Vía Pública",
  [EAuditSection.ADMINISTRACION]: "Administración",
  [EAuditSection.PROVEEDORES]: "Proveedores",
  [EAuditSection.ECOMMERCE]: "Ecommerce",
  [EAuditSection.SUDO]: "Sudo",
};

export enum EAuditEntityType {
  SALE = "sale",
  PRODUCT = "product",
  PRODUCT_VARIANT = "productVariant",
  CLIENT = "client",
  PROVIDER = "provider",
  PURCHASE = "purchase",
  ORDER = "order",
  QUOTE = "quote",
}

export const AUDIT_ENTITY_LABELS: Record<EAuditEntityType, string> = {
  [EAuditEntityType.SALE]: "Venta",
  [EAuditEntityType.PRODUCT]: "Producto",
  [EAuditEntityType.PRODUCT_VARIANT]: "Variante",
  [EAuditEntityType.CLIENT]: "Cliente",
  [EAuditEntityType.PROVIDER]: "Proveedor",
  [EAuditEntityType.PURCHASE]: "Compra",
  [EAuditEntityType.ORDER]: "Pedido",
  [EAuditEntityType.QUOTE]: "Presupuesto",
};

export enum EAuditAction {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  RESTORE = "restore",
  STOCK_CHANGE = "stock_change",
}

export const AUDIT_ACTION_LABELS: Record<EAuditAction, string> = {
  [EAuditAction.CREATE]: "Creó",
  [EAuditAction.UPDATE]: "Editó",
  [EAuditAction.DELETE]: "Eliminó",
  [EAuditAction.RESTORE]: "Restauró",
  [EAuditAction.STOCK_CHANGE]: "Stock",
};

export type TAuditChanges = {
  before?: Record<string, any>;
  after?: Record<string, any>;
};

export type TAuditLogEntry = {
  id: string;
  timestamp: Timestamp;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userRole: EUserRole | null;
  section: EAuditSection;
  entityType: EAuditEntityType;
  entityId: string;
  entityLabel: string | null;
  action: EAuditAction;
  description: string;
  changes?: TAuditChanges;
  metadata?: Record<string, any>;
  correlationId?: string;
};

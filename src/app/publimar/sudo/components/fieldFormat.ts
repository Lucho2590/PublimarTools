import collections from "@/lib/collections";

export const timestampToDate = (ts: any): Date | null => {
  if (!ts) return null;
  if (ts.toDate && typeof ts.toDate === "function") return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  return null;
};

export const formatValue = (value: any): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (value?.seconds) {
    const d = timestampToDate(value);
    return d ? d.toLocaleString("es-AR") : "fecha invalida";
  }
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
};

export const HIDDEN_FIELDS = ["deleted", "deletedAt", "id"];

const PRIORITY_FIELDS: Record<string, string[]> = {
  [collections.PRODUCTS]: ["name", "description", "price", "stock", "categories", "variants"],
  [collections.CLIENTS]: ["name", "email", "phone", "address"],
  [collections.QUOTES]: ["number", "clientName", "total", "status", "items"],
  [collections.ORDERS]: ["number", "clientName", "total", "status", "items"],
  [collections.SALES]: ["number", "clientName", "total", "paymentMethod", "items"],
  [collections.PURCHASES]: ["number", "providerName", "total", "items"],
  [collections.NOTES]: ["content", "userName", "section"],
  [collections.EVENTS]: ["title", "description", "date"],
  [collections.LOCATIONS]: ["name", "address", "description"],
  [collections.DEVICES]: ["name", "type", "location"],
  providers: ["name", "email", "phone", "address"],
  ecommerceOrders: ["orderNumber", "customerName", "total", "status", "items"],
  abandonedCarts: ["total", "itemsCount", "items"],
};

export const sortFields = (entries: [string, any][], collectionName?: string) => {
  const priority = (collectionName && PRIORITY_FIELDS[collectionName]) || [];
  return entries.sort((a, b) => {
    const aIdx = priority.indexOf(a[0]);
    const bIdx = priority.indexOf(b[0]);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a[0].localeCompare(b[0]);
  });
};

const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  description: "Descripcion",
  content: "Contenido",
  userName: "Usuario",
  section: "Seccion",
  email: "Email",
  phone: "Telefono",
  address: "Direccion",
  number: "Numero",
  clientName: "Cliente",
  customerName: "Cliente",
  providerName: "Proveedor",
  total: "Total",
  subtotal: "Subtotal",
  status: "Estado",
  paymentMethod: "Metodo de Pago",
  items: "Items",
  variants: "Variantes",
  categories: "Categorias",
  price: "Precio",
  stock: "Stock",
  createdAt: "Creado",
  updatedAt: "Actualizado",
  date: "Fecha",
  title: "Titulo",
  type: "Tipo",
  location: "Ubicacion",
  orderNumber: "N° Pedido",
  itemsCount: "Cant. Items",
  bank: "Banco",
  invoiceNumber: "N° Factura",
  isInvoiced: "Facturado",
  discountPercentage: "Descuento %",
  manualDiscount: "Descuento manual",
  applyIVA: "Aplica IVA",
  taxAmount: "IVA",
};

export const formatFieldName = (key: string): string => FIELD_LABELS[key] || key;

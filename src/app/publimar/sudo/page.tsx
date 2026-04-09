'use client';

import { useState, useEffect } from "react";
import { useFirestore } from "reactfire";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  updateDoc,
  doc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";
import { Trash2, RotateCcw, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import collections from "@/lib/collections";

interface DeletedItem {
  id: string;
  collection: string;
  collectionLabel: string;
  name: string;
  deletedAt: Date | null;
  data: Record<string, any>;
}

const COLLECTIONS_TO_SCAN = [
  { name: collections.PRODUCTS, label: "Productos", nameField: "name" },
  { name: collections.CLIENTS, label: "Clientes", nameField: "name" },
  { name: collections.QUOTES, label: "Presupuestos", nameField: "number" },
  { name: collections.ORDERS, label: "Ordenes", nameField: "number" },
  { name: collections.SALES, label: "Ventas", nameField: "number" },
  { name: collections.PURCHASES, label: "Compras", nameField: "number" },
  { name: collections.EVENTS, label: "Eventos", nameField: "title" },
  { name: collections.LOCATIONS, label: "Ubicaciones", nameField: "name" },
  { name: collections.NOTES, label: "Notas", nameField: "title" },
  { name: collections.DEVICES, label: "Dispositivos", nameField: "name" },
  { name: collections.products.CATEGORIES, label: "Categorias", nameField: "name" },
  { name: collections.products.GROUPS, label: "Grupos", nameField: "name" },
  { name: "providers", label: "Proveedores", nameField: "name" },
  { name: "ecommerceOrders", label: "Pedidos Tienda", nameField: "orderNumber" },
  { name: "abandonedCarts", label: "Carritos Abandonados", nameField: "id" },
];

const timestampToDate = (ts: any): Date | null => {
  if (!ts) return null;
  if (ts.toDate && typeof ts.toDate === "function") return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  return null;
};

export default function SudoPage() {
  const firestore = useFirestore();
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const loadDeletedItems = async () => {
    setLoading(true);
    try {
      const allDeleted: DeletedItem[] = [];

      for (const col of COLLECTIONS_TO_SCAN) {
        try {
          const q = query(
            collection(firestore, col.name),
            where("deleted", "==", true)
          );
          const snap = await getDocs(q);

          snap.docs.forEach((d) => {
            const data = d.data();
            allDeleted.push({
              id: d.id,
              collection: col.name,
              collectionLabel: col.label,
              name: data[col.nameField] || data.name || data.number || d.id,
              deletedAt: timestampToDate(data.deletedAt),
              data,
            });
          });
        } catch {
          // Collection might not exist or index missing, skip
        }
      }

      // Sort by deletedAt desc
      allDeleted.sort((a, b) => {
        if (!a.deletedAt) return 1;
        if (!b.deletedAt) return -1;
        return b.deletedAt.getTime() - a.deletedAt.getTime();
      });

      setDeletedItems(allDeleted);
    } catch (error) {
      console.error("Error cargando items eliminados:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeletedItems();
  }, [firestore]);

  const handleRestore = async (item: DeletedItem) => {
    try {
      const docRef = doc(firestore, item.collection, item.id);
      await updateDoc(docRef, {
        deleted: false,
        deletedAt: null,
      });
      setDeletedItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (error) {
      console.error("Error restaurando item:", error);
    }
  };

  const handlePermanentDelete = async (item: DeletedItem) => {
    if (!confirm(`Eliminar PERMANENTEMENTE "${item.name}" de ${item.collectionLabel}?`)) return;
    try {
      const docRef = doc(firestore, item.collection, item.id);
      await deleteDoc(docRef);
      setDeletedItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (error) {
      console.error("Error eliminando permanentemente:", error);
    }
  };

  const toggleExpanded = (key: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const formatValue = (value: any): string => {
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

  const HIDDEN_FIELDS = ["deleted", "deletedAt", "id"];

  // Campos prioritarios que se muestran primero según la colección
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
    "providers": ["name", "email", "phone", "address"],
    "ecommerceOrders": ["orderNumber", "customerName", "total", "status", "items"],
    "abandonedCarts": ["total", "itemsCount", "items"],
  };

  const sortFields = (entries: [string, any][], collectionName: string) => {
    const priority = PRIORITY_FIELDS[collectionName] || [];
    return entries.sort((a, b) => {
      const aIdx = priority.indexOf(a[0]);
      const bIdx = priority.indexOf(b[0]);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a[0].localeCompare(b[0]);
    });
  };

  const formatFieldName = (key: string): string => {
    const labels: Record<string, string> = {
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
    };
    return labels[key] || key;
  };

  const collectionTabs = [...new Set(deletedItems.map((i) => i.collectionLabel))];

  const filteredItems =
    activeTab === "all"
      ? deletedItems
      : deletedItems.filter((i) => i.collectionLabel === activeTab);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sudo</h1>
          <p className="text-muted-foreground">
            Items eliminados y herramientas de debug
          </p>
        </div>
        <Button onClick={loadDeletedItems} variant="outline" disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Recargar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Items Eliminados ({deletedItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Cargando items eliminados...
            </div>
          ) : deletedItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay items eliminados
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex flex-wrap h-auto gap-1">
                <TabsTrigger value="all">
                  Todos ({deletedItems.length})
                </TabsTrigger>
                {collectionTabs.map((tab) => (
                  <TabsTrigger key={tab} value={tab}>
                    {tab} ({deletedItems.filter((i) => i.collectionLabel === tab).length})
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Nombre / ID</TableHead>
                      <TableHead>Fecha Eliminacion</TableHead>
                      <TableHead>ID Documento</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => {
                      const key = `${item.collection}-${item.id}`;
                      const isExpanded = expandedItems.has(key);
                      return (
                        <>
                          <TableRow
                            key={key}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => toggleExpanded(key)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                  {item.collectionLabel}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              {item.name}
                            </TableCell>
                            <TableCell>
                              {item.deletedAt
                                ? formatDate(item.deletedAt)
                                : "Sin fecha"}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {item.id}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRestore(item)}
                                  title="Restaurar"
                                >
                                  <RotateCcw className="h-4 w-4 mr-1" />
                                  Restaurar
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handlePermanentDelete(item)}
                                  title="Eliminar permanentemente"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={`${key}-detail`}>
                              <TableCell colSpan={5} className="bg-muted/30 p-4">
                                <div className="space-y-3 text-sm">
                                  {/* Campos simples en tabla */}
                                  <table className="w-full">
                                    <tbody>
                                      {sortFields(
                                        Object.entries(item.data).filter(
                                          ([k, v]) => !HIDDEN_FIELDS.includes(k) && !Array.isArray(v)
                                        ),
                                        item.collection
                                      ).map(([k, v]) => (
                                        <tr key={k} className="border-b border-muted/50">
                                          <td className="py-1.5 pr-4 text-xs font-medium text-muted-foreground w-[150px]">
                                            {formatFieldName(k)}
                                          </td>
                                          <td className="py-1.5 text-foreground break-all">
                                            {formatValue(v)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>

                                  {/* Arrays (items, variants, etc.) */}
                                  {sortFields(
                                    Object.entries(item.data).filter(
                                      ([k, v]) => !HIDDEN_FIELDS.includes(k) && Array.isArray(v) && v.length > 0
                                    ),
                                    item.collection
                                  ).map(([k, v]) => (
                                    <div key={k}>
                                      <p className="text-xs font-medium text-muted-foreground mb-1">
                                        {formatFieldName(k)} ({v.length})
                                      </p>
                                      <div className="space-y-1">
                                        {v.slice(0, 5).map((arrItem: any, i: number) => (
                                          <pre
                                            key={i}
                                            className="text-xs bg-white p-2 rounded border overflow-x-auto"
                                          >
                                            {typeof arrItem === "object"
                                              ? JSON.stringify(arrItem, null, 2)
                                              : String(arrItem)}
                                          </pre>
                                        ))}
                                        {v.length > 5 && (
                                          <p className="text-xs text-muted-foreground">
                                            ...y {v.length - 5} mas
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

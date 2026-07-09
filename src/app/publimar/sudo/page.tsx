'use client';

import { useState, useEffect } from "react";
import { useFirestore } from "reactfire";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  getDoc,
  increment,
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
import { useAuth } from "@/contexts/AuthContext";
import { AuditLogTab } from "./components/AuditLogTab";
import { PermissionsTab } from "./components/PermissionsTab";
import { ImportMovementsTab } from "./components/ImportMovementsTab";
import { RoundingTab } from "./components/RoundingTab";
import {
  HIDDEN_FIELDS,
  formatFieldName,
  formatValue,
  sortFields,
  timestampToDate,
} from "./components/fieldFormat";

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

export default function SudoPage() {
  const firestore = useFirestore();
  const { loadingUserData, user } = useAuth();
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [topTab, setTopTab] = useState<
    "eliminados" | "audit" | "permisos" | "importar" | "redondeo"
  >("eliminados");

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

      if (item.collection === collections.SALES) {
        const saleDoc = await getDoc(docRef);
        if (saleDoc.exists()) {
          const saleData = saleDoc.data();
          if (saleData.stockRestored && saleData.items) {
            const alreadyReturned = new Map<string, number>();
            if (saleData.returns) {
              for (const ret of saleData.returns) {
                if (!ret.stockReturned) continue;
                for (const retItem of ret.items) {
                  const key = `${retItem.productId || ""}|||${retItem.variantId || ""}`;
                  alreadyReturned.set(key, (alreadyReturned.get(key) || 0) + retItem.quantityReturned);
                }
              }
            }

            for (const saleItem of saleData.items) {
              if (saleItem.isManual || !saleItem.productId || saleItem.productId.includes("manual")) continue;

              const key = `${saleItem.productId}|||${saleItem.variantId || ""}`;
              const returned = alreadyReturned.get(key) || 0;
              const pendingQty = saleItem.quantity - returned;

              if (pendingQty <= 0) continue;

              try {
                const productRef = doc(firestore, collections.PRODUCTS, saleItem.productId);
                const productDoc = await getDoc(productRef);

                if (productDoc.exists()) {
                  const currentProduct = productDoc.data();

                  if (saleItem.variantId && currentProduct.variants) {
                    await updateDoc(productRef, {
                      variants: currentProduct.variants.map((v: any) =>
                        v.id === saleItem.variantId
                          ? { ...v, stock: Number(v.stock) - pendingQty }
                          : v,
                      ),
                      salesCount: increment(1),
                    });
                  } else {
                    await updateDoc(productRef, {
                      stock: Number(currentProduct.stock || 0) - pendingQty,
                      salesCount: increment(1),
                    });
                  }
                }
              } catch (error) {
                console.error(`Error al descontar stock del producto ${saleItem.productId}:`, error);
              }
            }
          }
        }
      }

      await updateDoc(docRef, {
        deleted: false,
        deletedAt: null,
        stockRestored: false,
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

  const collectionTabs = [...new Set(deletedItems.map((i) => i.collectionLabel))];

  const filteredItems =
    activeTab === "all"
      ? deletedItems
      : deletedItems.filter((i) => i.collectionLabel === activeTab);

  if (loadingUserData || !user) {
    return (
      <div className="text-center py-12 text-muted-foreground">Cargando…</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Sudo</h1>
        <p className="text-muted-foreground">
          Items eliminados, registro de actividad y herramientas de debug
        </p>
      </div>

      <Tabs value={topTab} onValueChange={(v) => setTopTab(v as any)}>
        <TabsList>
          <TabsTrigger value="eliminados">Eliminados</TabsTrigger>
          <TabsTrigger value="audit">Registro de actividad</TabsTrigger>
          <TabsTrigger value="permisos">Permisos</TabsTrigger>
          <TabsTrigger value="importar">Importar movimientos</TabsTrigger>
          <TabsTrigger value="redondeo">Redondeo</TabsTrigger>
        </TabsList>

        <TabsContent value="eliminados" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button onClick={loadDeletedItems} variant="outline" disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Recargar
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Items Eliminados ({deletedItems.length})</CardTitle>
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
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditLogTab />
        </TabsContent>

        <TabsContent value="permisos" className="mt-4">
          <PermissionsTab />
        </TabsContent>

        <TabsContent value="importar" className="mt-4">
          <ImportMovementsTab />
        </TabsContent>

        <TabsContent value="redondeo" className="mt-4">
          <RoundingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

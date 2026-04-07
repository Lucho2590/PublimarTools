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
import { Trash2, RotateCcw, RefreshCw } from "lucide-react";
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
                    {filteredItems.map((item) => (
                      <TableRow key={`${item.collection}-${item.id}`}>
                        <TableCell>
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {item.collectionLabel}
                          </span>
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
                          <div className="flex justify-end gap-2">
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
                    ))}
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

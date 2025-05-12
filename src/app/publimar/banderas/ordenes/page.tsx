"use client";

import { useState } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, where } from "firebase/firestore";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import collections from "~/lib/collections";
import { EOrderStatus, TOrder } from "~/types/order";
import { useRouter } from "next/navigation";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Edit, Eye } from "lucide-react";

export default function PedidosPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<EOrderStatus | "all">("all");
  const firestore = useFirestore();
  const router = useRouter();

  // Consulta a Firestore
  const ordersCollection = collection(firestore, collections.ORDERS);
  const ordersQuery = query(ordersCollection, orderBy("createdAt", "desc"));

  const { status, data: orders } = useFirestoreCollectionData(ordersQuery, {
    idField: "id",
  });

  console.log(orders);

  // Filtrar pedidos según la búsqueda y estado
  const filteredOrders = orders?.filter((order) => {
    const matchesSearch =
      order.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.client.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  

  // Formatear fecha

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "-";
    if (typeof timestamp.toDate === "function") {
      return timestamp.toDate().toLocaleDateString("es-AR");
    }
    if (timestamp instanceof Date) {
      return timestamp.toLocaleDateString("es-AR");
    }
    return new Date(timestamp).toLocaleDateString("es-AR");
  };
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Ordenes de trabajo</h1>
        <Button
          className="bg-blue-900 hover:bg-blue-900 hover:text-white"
          onClick={() => router.push("/publimar/banderas/ordenes/nueva")}
        >
          Nueva Orden
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar por número o cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as EOrderStatus | "all")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filtrar por estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value={EOrderStatus.IN_PROCESS}>En proceso</SelectItem>
                  <SelectItem value={EOrderStatus.COMPLETED}>Entregada</SelectItem>
                  <SelectItem value={EOrderStatus.CANCELLED}>Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {status === "loading" ? (
        <div className="flex justify-center my-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Entrega estimada</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders && filteredOrders.length > 0 ? (
                    filteredOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          {order.number}
                        </TableCell>
                        <TableCell>{order.client.name}</TableCell>
                        <TableCell>{formatDate(order.createdAt)}</TableCell>
                        <TableCell>
                          {formatDate(order.estimatedDeliveryDate)}
                        </TableCell>
                        <TableCell>${order.total.toFixed(2)}</TableCell>
                        <TableCell >
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              order.status === EOrderStatus.IN_PROCESS
                                ? "bg-amber-100 text-amber-800"
                                : order.status === EOrderStatus.COMPLETED
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {order.status === EOrderStatus.IN_PROCESS
                              ? "En proceso"
                              : order.status === EOrderStatus.COMPLETED
                              ? "Entregada"
                              : "Cancelada"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-2 ">
                          <Link
                               href={`/publimar/banderas/ordenes/${order.id}`}
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Ver"
                                  className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>

                              <Link
                               href={`/publimar/banderas/ordenes/${order.id}/editar`}
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Editar"
                                  className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </Link>
                  
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-slate-500"
                      >
                        {searchTerm || statusFilter !== "all"
                          ? "No se encontraron pedidos con los filtros aplicados."
                          : "No hay pedidos disponibles."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

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

export default function PedidosPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<EOrderStatus | "all">("all");
  const firestore = useFirestore();

  // Consulta a Firestore
  const ordersCollection = collection(firestore, collections.ORDERS);
  const ordersQuery = query(ordersCollection, orderBy("createdAt", "desc"));

  const { status, data: orders } = useFirestoreCollectionData(ordersQuery, {
    idField: "id",
  });

  // Filtrar pedidos según la búsqueda y estado
  const filteredOrders = orders?.filter((order: TOrder) => {
    const matchesSearch =
      order.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.client.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Formatear fecha
  const formatDate = (date: Date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("es-AR");
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Ordenes de trabajo</h1>
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
              <select
                className="w-full p-2 border border-slate-300 rounded-md"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as EOrderStatus | "all")
                }
              >
                <option value="all">Todos los estados</option>
                <option value={EOrderStatus.PENDING}>Pendiente</option>
                <option value={EOrderStatus.IN_PROCESS}>En proceso</option>
                <option value={EOrderStatus.COMPLETED}>Completado</option>
                <option value={EOrderStatus.DELIVERED}>Entregado</option>
              </select>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Entrega estimada</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders && filteredOrders.length > 0 ? (
                  filteredOrders.map((order: TOrder) => (
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
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            order.status === EOrderStatus.PENDING
                              ? "bg-blue-100 text-blue-800"
                              : order.status === EOrderStatus.IN_PROCESS
                              ? "bg-amber-100 text-amber-800"
                              : order.status === EOrderStatus.COMPLETED
                              ? "bg-green-100 text-green-800"
                              : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {order.status === EOrderStatus.PENDING
                            ? "Pendiente"
                            : order.status === EOrderStatus.IN_PROCESS
                            ? "En proceso"
                            : order.status === EOrderStatus.COMPLETED
                            ? "Completado"
                            : "Entregado"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/pedidos/${order.id}`}>
                              Ver
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              href={`/dashboard/pedidos/${order.id}/editar`}
                            >
                              Editar
                            </Link>
                          </Button>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}

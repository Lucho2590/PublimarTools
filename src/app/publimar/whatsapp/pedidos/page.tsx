"use client";

import { useMemo, useState } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, orderBy, query } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import collections from "@/lib/collections";
import { EWhatsappOrderStatus, TWhatsappOrder } from "@/types/whatsapp";

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "UYU" }).format(n || 0);
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  [EWhatsappOrderStatus.PENDING]: { label: "Pendiente", className: "bg-amber-100 text-amber-800" },
  [EWhatsappOrderStatus.CONFIRMED]: { label: "Confirmado", className: "bg-green-100 text-green-800" },
  [EWhatsappOrderStatus.CANCELLED]: { label: "Cancelado", className: "bg-red-100 text-red-800" },
};

export default function WhatsappPedidosPage() {
  const firestore = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");

  const ordersQuery = useMemo(
    () => query(collection(firestore, collections.WHATSAPP_ORDERS), orderBy("createdAt", "desc")),
    [firestore]
  );

  const { status, data } = useFirestoreCollectionData(ordersQuery, { idField: "id" });
  const orders = (data as TWhatsappOrder[] | undefined) || [];

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.orderNumber?.toLowerCase().includes(q) ||
        o.clientName?.toLowerCase().includes(q) ||
        o.phone?.includes(q)
    );
  }, [orders, searchTerm]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Pedidos de WhatsApp</h1>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <Input
            placeholder="Buscar por número, cliente o teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="text-center">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {status === "loading" ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(7)].map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length > 0 ? (
                filtered.map((o) => {
                  const st = STATUS_LABEL[o.status] || { label: o.status, className: "" };
                  const date = toDate(o.createdAt);
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.orderNumber}</TableCell>
                      <TableCell>{o.clientName || "—"}</TableCell>
                      <TableCell>{o.phone || "—"}</TableCell>
                      <TableCell className="text-center">{o.items?.length ?? 0}</TableCell>
                      <TableCell className="text-right">{formatMoney(o.total)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={st.className} variant="secondary">
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {date ? date.toLocaleDateString("es-UY") : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    No hay pedidos de WhatsApp todavía
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

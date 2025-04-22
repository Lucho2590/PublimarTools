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
import { EQuoteStatus, TQuote } from "~/types/quote";

export default function PresupuestosPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<EQuoteStatus | "all">("all");
  const firestore = useFirestore();

  // Consulta a Firestore
  const quotesCollection = collection(firestore, collections.QUOTES);
  const quotesQuery = query(quotesCollection, orderBy("createdAt", "desc"));

  const { status, data: quotes } = useFirestoreCollectionData(quotesQuery, {
    idField: "id",
  });

  // Filtrar presupuestos según la búsqueda y estado
  const filteredQuotes = quotes?.filter((quote: TQuote) => {
    const matchesSearch =
      quote.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.client.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || quote.status === statusFilter;

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
        <h1 className="text-2xl font-bold">Presupuestos</h1>
        <Button asChild>
          <Link href="/dashboard/presupuestos/nuevo">Nuevo presupuesto</Link>
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
              <select
                className="w-full p-2 border border-slate-300 rounded-md"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as EQuoteStatus | "all")
                }
              >
                <option value="all">Todos los estados</option>
                <option value={EQuoteStatus.DRAFT}>Borrador</option>
                <option value={EQuoteStatus.SENT}>Enviado</option>
                <option value={EQuoteStatus.CONFIRMED}>Confirmado</option>
                <option value={EQuoteStatus.REJECTED}>Rechazado</option>
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
                  <TableHead>Válido hasta</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes && filteredQuotes.length > 0 ? (
                  filteredQuotes.map((quote: TQuote) => (
                    <TableRow key={quote.id}>
                      <TableCell className="font-medium">
                        {quote.number}
                      </TableCell>
                      <TableCell>{quote.client.name}</TableCell>
                      <TableCell>{formatDate(quote.createdAt)}</TableCell>
                      <TableCell>{formatDate(quote.validUntil)}</TableCell>
                      <TableCell>${quote.total.toFixed(2)}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            quote.status === EQuoteStatus.DRAFT
                              ? "bg-slate-100 text-slate-800"
                              : quote.status === EQuoteStatus.SENT
                              ? "bg-blue-100 text-blue-800"
                              : quote.status === EQuoteStatus.CONFIRMED
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {quote.status === EQuoteStatus.DRAFT
                            ? "Borrador"
                            : quote.status === EQuoteStatus.SENT
                            ? "Enviado"
                            : quote.status === EQuoteStatus.CONFIRMED
                            ? "Confirmado"
                            : "Rechazado"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/presupuestos/${quote.id}`}>
                              Ver
                            </Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              href={`/dashboard/presupuestos/${quote.id}/editar`}
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
                        ? "No se encontraron presupuestos con los filtros aplicados."
                        : "No hay presupuestos disponibles. ¡Crea tu primer presupuesto!"}
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

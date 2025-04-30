"use client";

import { useState } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy } from "firebase/firestore";
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
import { EClientType, EClientStatus, TClient } from "~/types/client";
import { Edit, Eye, View } from "lucide-react";

export default function ClientesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const firestore = useFirestore();

  // Consulta a Firestore
  const clientsCollection = collection(firestore, collections.CLIENTS);
  const clientsQuery = query(clientsCollection, orderBy("name"));

  const { status, data: clients } = useFirestoreCollectionData(clientsQuery, {
    idField: "id",
  });

  // Filtrar clientes según la búsqueda
  const filteredClients = clients?.filter((client) => {
    return (
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.phone?.includes(searchTerm)
    );
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button
          asChild
          className="bg-blue-900 hover:bg-blue-900 hover:text-white"
        >
          <Link href="/dashboard/banderas/clientes/nuevo">Nuevo cliente</Link>
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar clientes por nombre, email o teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
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
                  <TableHead className="text-left">Nombre</TableHead>
                  <TableHead className="text-left">Tipo</TableHead>
                  <TableHead className="text-left">Email</TableHead>
                  <TableHead className="text-left">Teléfono</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients && filteredClients.length > 0 ? (
                  filteredClients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">
                        {client.name}
                      </TableCell>
                      <TableCell className="text-left">
                        {client.type === EClientType.COMPANY
                          ? "Empresa"
                          : "Individual"}
                      </TableCell>
                      <TableCell className="text-left">
                        {client.email || "-"}
                      </TableCell>
                      <TableCell className="text-left">
                        {client.phone || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Link
                            href={`/dashboard/banderas/clientes/${client.id}`}
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
                            href={`/dashboard/banderas/clientes/${client.id}/editar`}
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
                      colSpan={6}
                      className="text-center py-6 text-slate-500"
                    >
                      {searchTerm
                        ? "No se encontraron clientes con los términos de búsqueda."
                        : "No hay clientes disponibles. ¡Añade tu primer cliente!"}
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

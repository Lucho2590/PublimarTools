'use client';

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import collections from "@/lib/collections";
import { EClientType, EClientStatus } from "@/types/client";
import { Edit, Eye } from "lucide-react";
import ClientDetailsModal from "./modalClientes/clientDetailsModal";
import { generateSlug } from "@/lib/utils";

export default function ClientesPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const firestore = useFirestore();

  // Consulta a Firestore - Temporalmente sin el filtro de status
  const clientsCollection = collection(firestore, collections.CLIENTS);
  const clientsQuery = query(clientsCollection, orderBy("name"));

  const { status, data: clients } = useFirestoreCollectionData(clientsQuery, {
    idField: "id",
  });
  // console.log(clients);

  const handleViewClient = (clientId: string, clientName: string) => {
    const slug = generateSlug(clientName, clientId);
    window.open(`/publimar/banderas/clientes/${slug}`, '_blank');
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedClientId(null);
  };

  // Función para normalizar texto (quitar acentos y convertir a minúsculas)
  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remover acentos
  };

  // Filtrar clientes según la búsqueda y status
  const filteredClients = clients?.filter((client) => {
    const searchNormalized = normalizeText(searchTerm);
    const matchesSearch =
      normalizeText(client.name || '').includes(searchNormalized) ||
      normalizeText(client.email || '').includes(searchNormalized) ||
      client.phone?.includes(searchTerm) ||
      client.cuit?.includes(searchTerm);

    // Filtrar por status en el cliente
    const isActive = client.status === EClientStatus.ACTIVE;

    return matchesSearch && isActive;
  });

  // Calcular índices para la paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredClients?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((filteredClients?.length || 0) / itemsPerPage);

  // Generar números de página para mostrar
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5;
    
    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pageNumbers.push(i);
        }
        pageNumbers.push(-1); // -1 representa elipsis
        pageNumbers.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pageNumbers.push(1);
        pageNumbers.push(-1);
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pageNumbers.push(i);
        }
      } else {
        pageNumbers.push(1);
        pageNumbers.push(-1);
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pageNumbers.push(i);
        }
        pageNumbers.push(-1);
        pageNumbers.push(totalPages);
      }
    }
    
    return pageNumbers;
  };

  // console.log("🔍 Clientes:", clients);
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button
          asChild
          className="bg-blue-900 hover:bg-blue-900 hover:text-white"
        >
          <Link href="/publimar/banderas/clientes/nuevo">Nuevo cliente</Link>
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar clientes por nombre, razón social, CUIT, email o teléfono..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1); // Reset a la primera página cuando se busca
                }}
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
            <div className="p-4 overflow-x-auto">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Mostrar</span>
                  <Select
                    value={itemsPerPage.toString()}
                    onValueChange={(value) => {
                      setItemsPerPage(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="10" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="15">15</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-gray-500">por página</span>
                </div>
                <div className="text-sm text-gray-500">
                  Mostrando {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, filteredClients?.length || 0)} de {filteredClients?.length || 0} clientes
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Nombre/Razón Social</TableHead>
                    <TableHead className="text-left">Referencia</TableHead>
                    <TableHead className="text-left">CUIT/CUIL</TableHead>
                    <TableHead className="text-left">Persona de contacto</TableHead>
                    <TableHead className="text-left">Teléfono</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentItems && currentItems.length > 0 ? (
                    currentItems.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell className="font-medium">
                          {client.name || "-"}
                        </TableCell>
                        <TableCell className="text-left">
                          {client.reference || "-"}
                        </TableCell>
                        <TableCell className="text-left">
                          {client.cuit || "-"}
                        </TableCell>
                        <TableCell className="text-left">
                        {client.contacts?.[0]?.name || client.name || "-"}
                        </TableCell>
                        <TableCell className="text-left">
                          {client.contacts?.[0]?.phone || client.phone || "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Ver"
                              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                              onClick={() => handleViewClient(client.id, client.name)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {/* <Button
                              variant="ghost"
                              size="icon"
                              title="Editar"
                              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                              onClick={() => handleViewClient(client.id)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button> */}
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

              {totalPages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>
                      
                      {getPageNumbers().map((pageNumber, index) => (
                        <PaginationItem key={index}>
                          {pageNumber === -1 ? (
                            <PaginationEllipsis />
                          ) : (
                            <PaginationLink
                              onClick={() => setCurrentPage(pageNumber)}
                              isActive={currentPage === pageNumber}
                              className={currentPage === pageNumber ? "bg-blue-900 text-white" : ""}
                            >
                              {pageNumber}
                            </PaginationLink>
                          )}
                        </PaginationItem>
                      ))}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <ClientDetailsModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        clientId={selectedClientId}
        onClientUpdated={() => {
          // The real-time data will automatically update the list
        }}
      />
    </div>
  );
}

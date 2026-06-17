'use client';

import { useState } from "react";
import { useFirestore } from "reactfire";
import { collection, addDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { useFirestoreCollectionData } from "reactfire";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressInput } from "@/components/ui/address-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { formatCuit } from "@/lib/cuit";
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
import { TProvider } from "@/types/provider";
import { Edit, Eye, Trash2 } from "lucide-react";
import ProviderEditModal from "./modalProveedores/providerEditModal";
import { toast } from "sonner";
import { useAuditLog } from "@/hooks/useAuditLog";
import { buildChanges } from "@/lib/auditLog";
import { EAuditAction, EAuditEntityType, EAuditSection } from "@/types/auditLog";

export default function ProveedoresPage() {
  const firestore = useFirestore();
  const { logEvent } = useAuditLog();
  const [form, setForm] = useState<Partial<TProvider>>({});
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Obtener proveedores ordenados por nombre
  const providersCollection = collection(firestore, "providers");
  const providersQuery = query(providersCollection, orderBy("name"));
  const { status, data: providers } = useFirestoreCollectionData(providersQuery, { idField: "id" });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name?.trim()) {
      toast.error("El nombre del proveedor es requerido");
      return;
    }

    setLoading(true);
    try {
      const docRef = await addDoc(providersCollection, {
        ...form,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await logEvent({
        section: EAuditSection.PROVEEDORES,
        entityType: EAuditEntityType.PROVIDER,
        entityId: docRef.id,
        entityLabel: form.name ?? null,
        action: EAuditAction.CREATE,
        description: `Creó el proveedor ${form.name ?? ''}`.trim(),
        changes: buildChanges(null, form as any, [
          'name', 'email', 'phone', 'address', 'cuit', 'contactPerson',
          'notes', 'cbu', 'alias', 'denominacion',
        ]),
      });

      setForm({});
      setShowForm(false);
      toast.success("Proveedor agregado correctamente");
    } catch (error) {
      console.error("Error al guardar proveedor:", error);
      toast.error("Error al guardar proveedor");
    } finally {
      setLoading(false);
    }
  };

  const handleEditProvider = (providerId: string) => {
    setSelectedProviderId(providerId);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedProviderId(null);
  };

  // Función para normalizar texto (quitar acentos y convertir a minúsculas)
  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remover acentos
  };

  // Filtrar proveedores según la búsqueda
  const filteredProviders = providers?.filter((provider: any) => {
    if (provider.deleted) return false;
    const searchNormalized = normalizeText(searchTerm);
    return (
      normalizeText(provider.name || '').includes(searchNormalized) ||
      normalizeText(provider.email || '').includes(searchNormalized) ||
      provider.phone?.includes(searchTerm) ||
      provider.cuit?.includes(searchTerm) ||
      normalizeText(provider.contactPerson || '').includes(searchNormalized)
    );
  });

  // Calcular índices para la paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredProviders?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((filteredProviders?.length || 0) / itemsPerPage);

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
        pageNumbers.push(-1);
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Proveedores</h1>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-900 hover:bg-blue-900 hover:text-white"
        >
          {showForm ? "Cancelar" : "Nuevo Proveedor"}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre/Razón Social *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={form.name || ""}
                    onChange={handleChange}
                    required
                    placeholder="Nombre del proveedor"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    value={form.email || ""}
                    onChange={handleChange}
                    type="email"
                    placeholder="email@ejemplo.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    name="phone"
                    value={form.phone || ""}
                    onChange={handleChange}
                    placeholder="+54 11 1234-5678"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cuit">CUIT/CUIL</Label>
                  <Input
                    id="cuit"
                    name="cuit"
                    value={form.cuit || ""}
                    onChange={handleChange}
                    placeholder="20-12345678-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactPerson">Persona de Contacto</Label>
                  <Input
                    id="contactPerson"
                    name="contactPerson"
                    value={form.contactPerson || ""}
                    onChange={handleChange}
                    placeholder="Nombre del contacto"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Dirección</Label>
                  <AddressInput
                    id="address"
                    name="address"
                    value={form.address || ""}
                    onValueChange={(address) => setForm({ ...form, address })}
                    placeholder="Calle 123, Ciudad"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cbu">CBU</Label>
                  <Input
                    id="cbu"
                    name="cbu"
                    value={form.cbu || ""}
                    onChange={handleChange}
                    placeholder="CBU del proveedor"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="alias">Alias</Label>
                  <Input
                    id="alias"
                    name="alias"
                    value={form.alias || ""}
                    onChange={handleChange}
                    placeholder="Alias bancario"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="denominacion">Denominación</Label>
                  <Input
                    id="denominacion"
                    name="denominacion"
                    value={form.denominacion || ""}
                    onChange={handleChange}
                    placeholder="Denominación de la cuenta"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  value={form.notes || ""}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Notas adicionales sobre el proveedor..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setForm({});
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {loading ? "Guardando..." : "Agregar Proveedor"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar proveedores por nombre, email, teléfono, CUIT o contacto..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
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
                  Mostrando {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, filteredProviders?.length || 0)} de {filteredProviders?.length || 0} proveedores
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Nombre/Razón Social</TableHead>
                    <TableHead className="text-left">Email</TableHead>
                    <TableHead className="text-left">Teléfono</TableHead>
                    <TableHead className="text-left">CUIT/CUIL</TableHead>
                    <TableHead className="text-left">Persona de Contacto</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentItems && currentItems.length > 0 ? (
                    currentItems.map((provider: any) => (
                      <TableRow key={provider.id}>
                        <TableCell className="font-medium">
                          {provider.name || "-"}
                        </TableCell>
                        <TableCell className="text-left">
                          {provider.email || "-"}
                        </TableCell>
                        <TableCell className="text-left">
                          {provider.phone || "-"}
                        </TableCell>
                        <TableCell className="text-left font-mono tabular-nums">
                          {formatCuit(provider.cuit) || "-"}
                        </TableCell>
                        <TableCell className="text-left">
                          {provider.contactPerson || "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar"
                              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                              onClick={() => handleEditProvider(provider.id)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
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
                          ? "No se encontraron proveedores con los términos de búsqueda."
                          : "No hay proveedores disponibles. ¡Añade tu primer proveedor!"}
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
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
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
                              className={currentPage === pageNumber ? "bg-blue-900 text-white cursor-pointer" : "cursor-pointer"}
                            >
                              {pageNumber}
                            </PaginationLink>
                          )}
                        </PaginationItem>
                      ))}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
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

      <ProviderEditModal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        providerId={selectedProviderId}
        onProviderUpdated={() => {
          // Los datos se actualizan automáticamente con reactfire
        }}
      />
    </div>
  );
}

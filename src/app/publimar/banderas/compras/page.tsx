'use client';


import { useState } from "react";
import { useFirestore } from "reactfire";
import { collection, addDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { useFirestoreCollectionData } from "reactfire";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { TPurchase } from "@/types/purchase";
// import { TProvider } from "@/types/provider";

// Formatear precio
function formatearPrecio(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(valor);
}

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
  

export default function ComprasPage() {
  const firestore = useFirestore();
  const [form, setForm] = useState<Partial<TPurchase>>({ date: new Date().toISOString().split("T")[0] });
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Obtener proveedores para el select
  const providersCollection = collection(firestore, "providers");
  const { status: provStatus, data: providers } = useFirestoreCollectionData(providersCollection, { idField: "id" });

  // Obtener compras ordenadas por fecha descendente
  const purchasesCollection = collection(firestore, "purchases");
  const purchasesQuery = query(purchasesCollection, orderBy("date", "desc"));
  const { status: purStatus, data: purchases } = useFirestoreCollectionData(purchasesQuery, { idField: "id" });

  // Filtrar compras según la búsqueda
  const filteredPurchases = purchases?.filter((purchase: any) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      purchase.providerName?.toLowerCase().includes(searchLower) ||
      purchase.description?.toLowerCase().includes(searchLower) ||
      purchase.amount?.toString().includes(searchTerm)
    );
  });

  // Calcular índices para la paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredPurchases?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((filteredPurchases?.length || 0) / itemsPerPage);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleProviderChange = (value: string) => {
    setForm({ ...form, providerId: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const provider = providers?.find((p: any) => p.id === form.providerId);
      await addDoc(purchasesCollection, {
        ...form,
        providerName: provider?.name || "",
        date: form.date,
        amount: Number(form.amount),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setForm({ date: new Date().toISOString().split("T")[0] });
      setShowForm(false);
    } catch (error) {
      alert("Error al guardar compra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Registrar Compra</CardTitle>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.href = '/publimar/proveedores'}
            >
              Gestionar proveedores
            </Button>
            <Button variant="outline" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Ocultar" : "Agregar compra"}
            </Button>
          </div>
        </CardHeader>
        {showForm && (
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Fecha</Label>
                <Input name="date" type="date" value={form.date || ""} onChange={handleChange} required />
              </div>
              <div>
                <Label>Proveedor</Label>
                <Select value={form.providerId || ""} onValueChange={handleProviderChange} required>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers && providers.map((prov: any) => (
                      <SelectItem key={prov.id} value={prov.id}>{prov.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Descripción / Nota</Label>
                <textarea name="description" value={form.description || ""} onChange={handleChange} className="w-full border rounded p-2 min-h-[40px]" required />
              </div>
              <div>
                <Label>Monto</Label>
                <Input name="amount" type="number" min="0" step="0.01" value={form.amount || ""} onChange={handleChange} required />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
            
                <Button type="submit" disabled={loading}>
                  {loading ? "Guardando..." : "Registrar Compra"}
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Historial de Compras</CardTitle>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Buscar por proveedor, descripción o monto..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1); // Reset a la primera página cuando se busca
                }}
                className="w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {purStatus === "loading" ? (
            <div className="flex justify-center my-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
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
                  Mostrando {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, filteredPurchases?.length || 0)} de {filteredPurchases?.length || 0} compras
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentItems && currentItems.length > 0 ? (
                    currentItems.map((compra: any) => (
                      <TableRow key={compra.id}>
                        <TableCell>{formatDate(compra.date)}</TableCell>
                        <TableCell>{compra.providerName || "-"}</TableCell>
                        <TableCell>{compra.description}</TableCell>
                        <TableCell className="text-right">{formatearPrecio(Number(compra.amount))}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-500 p-4">
                        {searchTerm 
                          ? "No se encontraron compras con los términos de búsqueda."
                          : "No hay compras registradas"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>

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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useFirestore } from "reactfire";
import { collection, addDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { useFirestoreCollectionData } from "reactfire";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
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
import { TPurchase, EPurchaseDepartment } from "@/types/purchase";
import { EUserRole } from "@/types/user";
import { formatearPrecio } from "@/lib/utils";
import { Edit, DollarSign, X } from "lucide-react";
import PurchaseEditModal from "./modalCompras/purchaseEditModal";
import { toast } from "sonner";

// Formatear fecha
const formatDate = (timestamp: any) => {
  if (!timestamp) return "-";
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toLocaleDateString("es-AR");
  }
  if (timestamp instanceof Date) {
    return timestamp.toLocaleDateString("es-AR");
  }
  // Si es string (YYYY-MM-DD)
  if (typeof timestamp === 'string') {
    const [year, month, day] = timestamp.split('-');
    return `${day}/${month}/${year}`;
  }
  return new Date(timestamp).toLocaleDateString("es-AR");
};

export default function ComprasPage() {
  const firestore = useFirestore();
  const { userRole } = useAuth();
  const [form, setForm] = useState<Partial<TPurchase>>({
    date: new Date().toISOString().split("T")[0]
  });
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Asignar automáticamente el departamento según el rol del usuario
  useEffect(() => {
    if (userRole) {
      if (userRole === EUserRole.BANDERAS) {
        setForm(prev => ({ ...prev, department: EPurchaseDepartment.BANDERAS }));
      } else if (userRole === EUserRole.VIA_PUBLICA) {
        setForm(prev => ({ ...prev, department: EPurchaseDepartment.VIA_PUBLICA }));
      } else if (userRole === EUserRole.ADMINISTRACION) {
        setForm(prev => ({ ...prev, department: EPurchaseDepartment.ADMINISTRACION }));
      }
    }
  }, [userRole]);

  // Estados para el modal de edición
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);

  // Estados para filtros
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string>(EPurchaseDepartment.BANDERAS);

  // Obtener proveedores para el select
  const providersCollection = collection(firestore, "providers");
  const providersQuery = query(providersCollection, orderBy("name"));
  const { status: provStatus, data: providers } = useFirestoreCollectionData(providersQuery, { idField: "id" });

  // Obtener compras ordenadas por fecha descendente
  const purchasesCollection = collection(firestore, "purchases");
  const purchasesQuery = query(purchasesCollection, orderBy("date", "desc"));
  const { status: purStatus, data: purchases } = useFirestoreCollectionData(purchasesQuery, { idField: "id" });

  // Función para normalizar texto (quitar acentos y convertir a minúsculas)
  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remover acentos
  };

  // Filtrar compras según búsqueda, fechas y proveedor
  const filteredPurchases = useMemo(() => {
    return purchases?.filter((purchase: any) => {
      const searchNormalized = normalizeText(searchTerm);
      const matchesSearch =
        normalizeText(purchase.providerName || '').includes(searchNormalized) ||
        normalizeText(purchase.description || '').includes(searchNormalized) ||
        purchase.amount?.toString().includes(searchTerm);

      // Filtro por rango de fechas
      let matchesDateRange = true;
      if (dateRange?.from && dateRange?.to) {
        let purchaseDate: Date | null = null;

        if (typeof purchase.date === 'string') {
          // Si la fecha es un string YYYY-MM-DD, convertirlo a Date
          const [year, month, day] = purchase.date.split('-').map(Number);
          purchaseDate = new Date(year, month - 1, day);
        } else if (purchase.date instanceof Date) {
          purchaseDate = purchase.date;
        } else if (purchase.date && typeof purchase.date === 'object' && 'seconds' in purchase.date) {
          purchaseDate = new Date((purchase.date as { seconds: number }).seconds * 1000);
        }

        if (purchaseDate) {
          const startOfDay = new Date(dateRange.from);
          startOfDay.setHours(0, 0, 0, 0);

          const endOfDay = new Date(dateRange.to);
          endOfDay.setHours(23, 59, 59, 999);

          const purchaseDateNormalized = new Date(purchaseDate);
          purchaseDateNormalized.setHours(0, 0, 0, 0);

          matchesDateRange = purchaseDateNormalized >= startOfDay && purchaseDateNormalized <= endOfDay;
        } else {
          matchesDateRange = false;
        }
      }

      // Filtro por proveedor
      const matchesProvider = selectedProvider === "all" || purchase.providerId === selectedProvider;

      // Filtro por departamento
      const matchesDepartment = selectedDepartment === "all" || purchase.department === selectedDepartment;

      return matchesSearch && matchesDateRange && matchesProvider && matchesDepartment;
    });
  }, [purchases, searchTerm, dateRange, selectedProvider, selectedDepartment]);

  // Calcular total de compras filtradas
  const totalFiltered = useMemo(() => {
    return filteredPurchases?.reduce((sum, purchase: any) => sum + (Number(purchase.amount) || 0), 0) || 0;
  }, [filteredPurchases]);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleProviderChange = (value: string) => {
    setForm({ ...form, providerId: value });
  };

  const handleDepartmentChange = (value: string) => {
    setForm({ ...form, department: value as EPurchaseDepartment });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.date || !form.providerId || !form.description || !form.amount || !form.department) {
      toast.error("Todos los campos son requeridos");
      return;
    }

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
      // Resetear form pero mantener el departamento según el rol
      const resetForm: Partial<TPurchase> = { date: new Date().toISOString().split("T")[0] };
      if (userRole === EUserRole.BANDERAS) {
        resetForm.department = EPurchaseDepartment.BANDERAS;
      } else if (userRole === EUserRole.VIA_PUBLICA) {
        resetForm.department = EPurchaseDepartment.VIA_PUBLICA;
      } else if (userRole === EUserRole.ADMINISTRACION) {
        resetForm.department = EPurchaseDepartment.ADMINISTRACION;
      }
      setForm(resetForm);
      setShowForm(false);
      toast.success("Compra registrada correctamente");
    } catch (error) {
      console.error("Error al guardar compra:", error);
      toast.error("Error al guardar compra");
    } finally {
      setLoading(false);
    }
  };

  const handleEditPurchase = (purchaseId: string) => {
    setSelectedPurchaseId(purchaseId);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedPurchaseId(null);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setDateRange(undefined);
    setSelectedProvider("all");
    setSelectedDepartment(EPurchaseDepartment.BANDERAS);
    setCurrentPage(1);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Compras</h1>
        <div className="flex gap-2">
          <Button
            asChild
            variant="outline"
            className="bg-slate-600 hover:bg-slate-700 text-white"
          >
            <Link href="/publimar/proveedores">Gestionar Proveedores</Link>
          </Button>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-900 hover:bg-blue-900 hover:text-white"
          >
            {showForm ? "Cancelar" : "Nueva Compra"}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Registrar Compra</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Fecha *</Label>
                  <Input
                    id="date"
                    name="date"
                    type="date"
                    value={form.date || ""}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="providerId">Proveedor *</Label>
                  <Select
                    value={form.providerId || ""}
                    onValueChange={handleProviderChange}
                    required
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar proveedor" />
                    </SelectTrigger>
                    <SelectContent className="max-h-48 overflow-y-auto">
                      {providers && providers.map((prov: any) => (
                        <SelectItem key={prov.id} value={prov.id}>
                          {prov.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description">Descripción / Nota *</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={form.description || ""}
                    onChange={handleChange}
                    rows={3}
                    required
                    placeholder="Descripción de la compra..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Monto *</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount || ""}
                    onChange={handleChange}
                    required
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Departamento *</Label>
                  <Select
                    value={form.department || ""}
                    onValueChange={handleDepartmentChange}
                    required
                    disabled={(userRole !== EUserRole.ADMINISTRACION) && (userRole !== EUserRole.ADMIN)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {userRole === EUserRole.ADMINISTRACION || userRole === EUserRole.ADMIN ? (
                        // Administración puede ver y seleccionar todos los departamentos
                        <>
                          <SelectItem value={EPurchaseDepartment.BANDERAS}>Banderas</SelectItem>
                          <SelectItem value={EPurchaseDepartment.VIA_PUBLICA}>Vía Pública</SelectItem>
                          <SelectItem value={EPurchaseDepartment.ADMINISTRACION}>Administración</SelectItem>
                        </>
                      ) : userRole === EUserRole.BANDERAS ? (
                        // Banderas solo ve su departamento
                        <SelectItem value={EPurchaseDepartment.BANDERAS}>Banderas</SelectItem>
                      ) : userRole === EUserRole.VIA_PUBLICA ? (
                        // Vía Pública solo ve su departamento
                        <SelectItem value={EPurchaseDepartment.VIA_PUBLICA}>Vía Pública</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    // Resetear form pero mantener el departamento según el rol
                    const resetForm: Partial<TPurchase> = { date: new Date().toISOString().split("T")[0] };
                    if (userRole === EUserRole.BANDERAS) {
                      resetForm.department = EPurchaseDepartment.BANDERAS;
                    } else if (userRole === EUserRole.VIA_PUBLICA) {
                      resetForm.department = EPurchaseDepartment.VIA_PUBLICA;
                    } else if (userRole === EUserRole.ADMINISTRACION) {
                      resetForm.department = EPurchaseDepartment.ADMINISTRACION;
                    }
                    setForm(resetForm);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {loading ? "Guardando..." : "Registrar Compra"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Card con total de compras filtradas */}
      <Card className="mb-6 bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-900 p-3 rounded-full">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-600 font-medium">Total de Compras Filtradas</p>
                <p className="text-3xl font-bold text-blue-900">{formatearPrecio(totalFiltered)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600">Cantidad de compras</p>
              <p className="text-2xl font-semibold text-slate-900">{filteredPurchases?.length || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <Label className="mb-2 block">Buscar</Label>
              <Input
                placeholder="Buscar por proveedor, descripción o monto..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex-1">
              <Label className="mb-2 block">Proveedor</Label>
              <Select
                value={selectedProvider}
                onValueChange={(value) => {
                  setSelectedProvider(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos los proveedores" />
                </SelectTrigger>
                <SelectContent className="max-h-48 overflow-y-auto">
                  <SelectItem value="all">Todos los proveedores</SelectItem>
                  {providers && providers.map((provider: any) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="mb-2 block">Rango de Fechas</Label>
              <DateRangePicker
                value={dateRange}
                onChange={(newDateRange: DateRange | undefined) => {
                  setDateRange(newDateRange);
                  setCurrentPage(1);
                }}
              />
            </div>
            {/* <div className="flex-1">
              <Label className="mb-2 block">Departamento</Label>
              <Select
                value={selectedDepartment}
                onValueChange={(value) => {
                  setSelectedDepartment(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos los departamentos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los departamentos</SelectItem>
                  <SelectItem value={EPurchaseDepartment.BANDERAS}>Banderas</SelectItem>
                  <SelectItem value={EPurchaseDepartment.VIA_PUBLICA}>Vía Pública</SelectItem>
                  <SelectItem value={EPurchaseDepartment.ADMINISTRACION}>Administración</SelectItem>
                </SelectContent>
              </Select>
            </div> */}
            <div className="flex md:justify-end">
              <Button
                variant="outline"
                onClick={clearFilters}
                size="sm"
              >
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {purStatus === "loading" ? (
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
                  Mostrando {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, filteredPurchases?.length || 0)} de {filteredPurchases?.length || 0} compras
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Fecha</TableHead>
                    <TableHead className="text-left">Proveedor</TableHead>
                    <TableHead className="text-left">Descripción</TableHead>
                    <TableHead className="text-left">Departamento</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentItems && currentItems.length > 0 ? (
                    currentItems.map((compra: any) => (
                      <TableRow key={compra.id}>
                        <TableCell className="font-medium">{formatDate(compra.date)}</TableCell>
                        <TableCell>{compra.providerName || "-"}</TableCell>
                        <TableCell>{compra.description}</TableCell>
                        <TableCell>
                          {compra.department === EPurchaseDepartment.BANDERAS && "Banderas"}
                          {compra.department === EPurchaseDepartment.VIA_PUBLICA && "Vía Pública"}
                          {compra.department === EPurchaseDepartment.ADMINISTRACION && "Administración"}
                          {!compra.department && "-"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatearPrecio(Number(compra.amount))}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar"
                              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                              onClick={() => handleEditPurchase(compra.id)}
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
                        {searchTerm || dateRange || selectedProvider !== "all"
                          ? "No se encontraron compras con los filtros aplicados."
                          : "No hay compras registradas. ¡Registra tu primera compra!"}
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

      <PurchaseEditModal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        purchaseId={selectedPurchaseId}
        onPurchaseUpdated={() => {
          // Los datos se actualizan automáticamente con reactfire
        }}
      />
    </div>
  );
}

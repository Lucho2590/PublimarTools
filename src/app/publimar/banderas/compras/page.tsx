'use client';

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
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
import { EPurchaseDepartment, EPurchasePaymentMethod } from "@/types/purchase";
import { formatearPrecio } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  DollarSign,
  Paperclip,
  Plus,
  ShoppingCart,
  Eye,
  Search,
  RotateCcw,
  Loader2,
} from "lucide-react";
import PurchaseEditModal from "./modalCompras/purchaseEditModal";
import PurchaseCreateModal from "./modalCompras/purchaseCreateModal";

const paymentMethodInfo: Record<
  EPurchasePaymentMethod,
  { label: string; className: string }
> = {
  [EPurchasePaymentMethod.EFECTIVO]: {
    label: "Efectivo",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  [EPurchasePaymentMethod.TRANSFERENCIA]: {
    label: "Transferencia",
    className: "bg-blue-50 text-blue-700 border border-blue-200",
  },
  [EPurchasePaymentMethod.TARJETA]: {
    label: "Tarjeta",
    className: "bg-violet-50 text-violet-700 border border-violet-200",
  },
  [EPurchasePaymentMethod.CHEQUE]: {
    label: "Cheque",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  [EPurchasePaymentMethod.ECHEQ]: {
    label: "E-Cheq",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  [EPurchasePaymentMethod.CUENTA_CORRIENTE]: {
    label: "Cuenta Corriente",
    className: "bg-orange-50 text-orange-700 border border-orange-200",
  },
};

const departmentLabels: Record<EPurchaseDepartment, string> = {
  [EPurchaseDepartment.BANDERAS]: "Banderas",
  [EPurchaseDepartment.VIA_PUBLICA]: "Vía Pública",
  [EPurchaseDepartment.ADMINISTRACION]: "Administración",
};

const formatDate = (timestamp: any) => {
  if (!timestamp) return "-";
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toLocaleDateString("es-AR");
  }
  if (timestamp instanceof Date) {
    return timestamp.toLocaleDateString("es-AR");
  }
  if (typeof timestamp === "string") {
    const [year, month, day] = timestamp.split("-");
    return `${day}/${month}/${year}`;
  }
  return new Date(timestamp).toLocaleDateString("es-AR");
};

const parsePurchaseDate = (raw: any): Date | null => {
  if (!raw) return null;
  if (typeof raw === "string") {
    const [y, m, d] = raw.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }
  if (raw instanceof Date) return raw;
  if (typeof raw === "object" && "seconds" in raw) {
    return new Date((raw as { seconds: number }).seconds * 1000);
  }
  return null;
};

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export default function ComprasPage() {
  const firestore = useFirestore();

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedProvider, setSelectedProvider] = useState<string>("all");

  const [filterProviderInput, setFilterProviderInput] = useState("");
  const [showFilterProviderDropdown, setShowFilterProviderDropdown] =
    useState(false);
  const [highlightedFilterProviderIndex, setHighlightedFilterProviderIndex] =
    useState(-1);
  const filterProviderInputRef = useRef<HTMLInputElement>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(
    null
  );

  const providersCollection = collection(firestore, "providers");
  const providersQuery = query(providersCollection, orderBy("name"));
  const { data: providers } = useFirestoreCollectionData(providersQuery, {
    idField: "id",
  });

  const purchasesCollection = collection(firestore, "purchases");
  const purchasesQuery = query(purchasesCollection, orderBy("date", "desc"));
  const { status: purStatus, data: purchases } = useFirestoreCollectionData(
    purchasesQuery,
    { idField: "id" }
  );

  const banderasPurchases = useMemo(
    () =>
      purchases?.filter(
        (p: any) => !p.deleted && p.department === EPurchaseDepartment.BANDERAS
      ) || [],
    [purchases]
  );

  const filteredPurchases = useMemo(() => {
    return banderasPurchases.filter((purchase: any) => {
      const searchNormalized = normalizeText(searchTerm);
      const matchesSearch =
        !searchTerm ||
        normalizeText(purchase.providerName || "").includes(searchNormalized) ||
        normalizeText(purchase.description || "").includes(searchNormalized) ||
        purchase.amount?.toString().includes(searchTerm);

      let matchesDateRange = true;
      if (dateRange?.from && dateRange?.to) {
        const purchaseDate = parsePurchaseDate(purchase.date);
        if (purchaseDate) {
          const startOfDay = new Date(dateRange.from);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(dateRange.to);
          endOfDay.setHours(23, 59, 59, 999);
          const normalized = new Date(purchaseDate);
          normalized.setHours(0, 0, 0, 0);
          matchesDateRange = normalized >= startOfDay && normalized <= endOfDay;
        } else {
          matchesDateRange = false;
        }
      }

      const matchesProvider =
        selectedProvider === "all" || purchase.providerId === selectedProvider;

      return matchesSearch && matchesDateRange && matchesProvider;
    });
  }, [banderasPurchases, searchTerm, dateRange, selectedProvider]);

  const hasActiveFilters =
    Boolean(searchTerm) ||
    Boolean(dateRange?.from) ||
    selectedProvider !== "all";

  const { totalMes, cantidadMes } = useMemo(() => {
    if (hasActiveFilters) {
      const total = filteredPurchases.reduce(
        (acc: number, p: any) => acc + (Number(p.amount) || 0),
        0
      );
      return { totalMes: total, cantidadMes: filteredPurchases.length };
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let total = 0;
    let count = 0;
    banderasPurchases.forEach((p: any) => {
      const d = parsePurchaseDate(p.date);
      if (d && d.getFullYear() === year && d.getMonth() === month) {
        total += Number(p.amount) || 0;
        count += 1;
      }
    });
    return { totalMes: total, cantidadMes: count };
  }, [hasActiveFilters, filteredPurchases, banderasPurchases]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredPurchases.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredPurchases.length / itemsPerPage);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const getPageNumbers = () => {
    const pageNumbers: number[] = [];
    const maxPagesToShow = 5;

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pageNumbers.push(i);
        pageNumbers.push(-1);
        pageNumbers.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pageNumbers.push(1);
        pageNumbers.push(-1);
        for (let i = totalPages - 3; i <= totalPages; i++) pageNumbers.push(i);
      } else {
        pageNumbers.push(1);
        pageNumbers.push(-1);
        for (let i = currentPage - 1; i <= currentPage + 1; i++)
          pageNumbers.push(i);
        pageNumbers.push(-1);
        pageNumbers.push(totalPages);
      }
    }

    return pageNumbers;
  };

  const handleFilterProviderInputChange = (value: string) => {
    setFilterProviderInput(value);
    setShowFilterProviderDropdown(true);
    setHighlightedFilterProviderIndex(-1);
    if (!value.trim()) {
      setSelectedProvider("all");
    }
  };

  const handleSelectFilterProvider = (
    providerId: string,
    providerName: string
  ) => {
    setSelectedProvider(providerId);
    setFilterProviderInput(providerName);
    setShowFilterProviderDropdown(false);
    setHighlightedFilterProviderIndex(-1);
    setCurrentPage(1);
  };

  const handleFilterProviderKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    const filtered =
      providers?.filter((p: any) =>
        p.name.toLowerCase().includes(filterProviderInput.toLowerCase())
      ) || [];

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedFilterProviderIndex((prev) =>
        prev < filtered.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedFilterProviderIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && highlightedFilterProviderIndex >= 0) {
      e.preventDefault();
      const sel = filtered[highlightedFilterProviderIndex];
      handleSelectFilterProvider(sel.id, sel.name);
      if (filterProviderInputRef.current) filterProviderInputRef.current.blur();
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
    setFilterProviderInput("");
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compras</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Registro de compras de banderas
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/publimar/proveedores">Proveedores</Link>
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva compra
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">
                {hasActiveFilters ? "Total filtrado" : "Total del mes"}
              </span>
              <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {formatearPrecio(totalMes)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">
                {hasActiveFilters ? "Compras filtradas" : "Compras del mes"}
              </span>
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <ShoppingCart className="h-4 w-4 text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {cantidadMes}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Búsqueda + filtros */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por proveedor, descripción o monto..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative md:flex-1">
              <Input
                ref={filterProviderInputRef}
                placeholder="Filtrar por proveedor..."
                value={filterProviderInput}
                onChange={(e) => handleFilterProviderInputChange(e.target.value)}
                onKeyDown={handleFilterProviderKeyDown}
                onFocus={() => {
                  setShowFilterProviderDropdown(true);
                  setHighlightedFilterProviderIndex(-1);
                }}
                onBlur={() =>
                  setTimeout(() => {
                    setShowFilterProviderDropdown(false);
                    setHighlightedFilterProviderIndex(-1);
                  }, 150)
                }
              />
              {showFilterProviderDropdown && providers && providers.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white p-1.5 shadow-sm">
                  <li
                    className={cn(
                      "cursor-pointer rounded-md px-2 py-1.5 text-sm transition-colors",
                      highlightedFilterProviderIndex === -1 && !filterProviderInput
                        ? "bg-slate-100"
                        : "hover:bg-slate-50",
                      selectedProvider === "all" && "font-semibold"
                    )}
                    onMouseEnter={() => setHighlightedFilterProviderIndex(-1)}
                    onMouseDown={() => {
                      handleSelectFilterProvider("all", "");
                      if (filterProviderInputRef.current)
                        filterProviderInputRef.current.blur();
                    }}
                  >
                    Todos los proveedores
                  </li>
                  {providers
                    .filter((p: any) =>
                      p.name.toLowerCase().includes(filterProviderInput.toLowerCase())
                    )
                    .map((p: any, index: number) => (
                      <li
                        key={p.id}
                        className={cn(
                          "cursor-pointer rounded-md px-2 py-1.5 text-sm transition-colors",
                          index === highlightedFilterProviderIndex
                            ? "bg-slate-100"
                            : "hover:bg-slate-50",
                          selectedProvider === p.id && "font-semibold"
                        )}
                        onMouseEnter={() =>
                          setHighlightedFilterProviderIndex(index)
                        }
                        onMouseDown={() => {
                          handleSelectFilterProvider(p.id, p.name);
                          if (filterProviderInputRef.current)
                            filterProviderInputRef.current.blur();
                        }}
                      >
                        {p.name}
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <div className="md:flex-1">
              <DateRangePicker
                value={dateRange}
                onChange={(newRange: DateRange | undefined) => {
                  setDateRange(newRange);
                  setCurrentPage(1);
                }}
              />
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="md:self-center"
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Listado */}
      {purStatus === "loading" ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-2">
            {currentItems.length > 0 ? (
              <div className="space-y-1">
                {currentItems.map((compra: any) => {
                  const pm = compra.paymentMethod
                    ? paymentMethodInfo[
                        compra.paymentMethod as EPurchasePaymentMethod
                      ]
                    : null;
                  const metaParts = [
                    compra.providerName,
                    formatDate(compra.date),
                    compra.department ? departmentLabels[compra.department as EPurchaseDepartment] : null,
                  ].filter(Boolean);

                  return (
                    <button
                      type="button"
                      key={compra.id}
                      onClick={() => handleEditPurchase(compra.id)}
                      className="w-full text-left flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors duration-150 group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                          <ShoppingCart className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {compra.description || "Sin descripción"}
                          </p>
                          {metaParts.length > 0 && (
                            <p className="text-xs text-muted-foreground truncate">
                              {metaParts.join(" · ")}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-sm font-semibold tabular-nums">
                          {formatearPrecio(Number(compra.amount) || 0)}
                        </span>
                        {pm && (
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap",
                              pm.className
                            )}
                          >
                            {pm.label}
                          </span>
                        )}
                      </div>
                      {compra.facturaUrl && (
                        <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <Eye className="h-4 w-4 text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity shrink-0" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {hasActiveFilters
                  ? "No se encontraron compras con los filtros aplicados."
                  : "No hay compras registradas. ¡Registra tu primera compra!"}
              </div>
            )}

            {filteredPurchases.length > 0 && (
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-4 pt-4 border-t px-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Mostrar</span>
                  <Select
                    value={itemsPerPage.toString()}
                    onValueChange={(value) => {
                      setItemsPerPage(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[80px] h-8">
                      <SelectValue placeholder="10" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="15">15</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">
                    por página
                  </span>
                  <span className="text-sm text-muted-foreground hidden md:inline">
                    · {indexOfFirstItem + 1}-
                    {Math.min(indexOfLastItem, filteredPurchases.length)} de{" "}
                    {filteredPurchases.length}
                  </span>
                </div>

                {totalPages > 1 && (
                  <Pagination className="md:justify-end md:mx-0">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() =>
                            setCurrentPage((prev) => Math.max(prev - 1, 1))
                          }
                          className={
                            currentPage === 1
                              ? "pointer-events-none opacity-50"
                              : "cursor-pointer"
                          }
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
                              className="cursor-pointer"
                            >
                              {pageNumber}
                            </PaginationLink>
                          )}
                        </PaginationItem>
                      ))}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() =>
                            setCurrentPage((prev) =>
                              Math.min(prev + 1, totalPages)
                            )
                          }
                          className={
                            currentPage === totalPages
                              ? "pointer-events-none opacity-50"
                              : "cursor-pointer"
                          }
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <PurchaseCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <PurchaseEditModal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        purchaseId={selectedPurchaseId}
      />
    </div>
  );
}

'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  EClientType,
  EClientStatus,
  EClientSection,
  EClientTaxCondition,
} from "@/types/client";
import {
  Eye,
  Users,
  Building2,
  User,
  UserPlus,
  Plus,
  Loader2,
  Search,
} from "lucide-react";
import { cn, formatearPrecio, generateSlug } from "@/lib/utils";
import { formatCuit } from "@/lib/cuit";
import { taxConditionInfo } from "@/lib/taxCondition";
import { useAvailableCreditByClient } from "@/hooks/useCreditNotes";
import { Wallet } from "lucide-react";

const timestampToDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp;
  if (timestamp.toDate && typeof timestamp.toDate === "function") {
    return timestamp.toDate();
  }
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000);
  }
  return null;
};

export default function ClientesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const firestore = useFirestore();

  const clientsCollection = collection(firestore, collections.CLIENTS);
  const clientsQuery = query(
    clientsCollection,
    where("section", "==", EClientSection.BANDERAS),
    orderBy("name")
  );

  const { status, data: clients } = useFirestoreCollectionData(clientsQuery, {
    idField: "id",
  });

  const handleViewClient = (clientId: string, clientName: string) => {
    const slug = generateSlug(clientName, clientId);
    window.open(`/publimar/banderas/clientes/${slug}`, "_blank");
  };

  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  };

  const stats = useMemo(() => {
    if (!clients) {
      return { total: 0, companies: 0, individuals: 0, newThisMonth: 0 };
    }
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const active = clients.filter((c) => c.status === EClientStatus.ACTIVE);
    return {
      total: active.length,
      companies: active.filter((c) => c.type === EClientType.COMPANY).length,
      individuals: active.filter((c) => c.type === EClientType.INDIVIDUAL).length,
      newThisMonth: active.filter((c) => {
        const created = timestampToDate(c.createdAt);
        return created !== null && created >= startOfMonth;
      }).length,
    };
  }, [clients]);

  const { byClient: creditByClient } = useAvailableCreditByClient();

  const filteredClients = useMemo(() => {
    return clients?.filter((client) => {
      const searchNormalized = normalizeText(searchTerm);
      const matchesSearch =
        normalizeText(client.name || "").includes(searchNormalized) ||
        normalizeText(client.email || "").includes(searchNormalized) ||
        client.phone?.includes(searchTerm) ||
        client.cuit?.includes(searchTerm);

      const isActive = client.status === EClientStatus.ACTIVE;

      return matchesSearch && isActive;
    });
  }, [clients, searchTerm]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredClients?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((filteredClients?.length || 0) / itemsPerPage);

  const getPageNumbers = () => {
    const pageNumbers: number[] = [];
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

  const kpis = [
    {
      label: "Total activos",
      value: stats.total,
      icon: Users,
      color: "blue",
    },
    {
      label: "Empresas",
      value: stats.companies,
      icon: Building2,
      color: "emerald",
    },
    {
      label: "Personas físicas",
      value: stats.individuals,
      icon: User,
      color: "violet",
    },
    {
      label: "Nuevos este mes",
      value: stats.newThisMonth,
      icon: UserPlus,
      color: "orange",
    },
  ] as const;

  const colorClasses: Record<string, { bg: string; text: string }> = {
    blue: { bg: "bg-blue-50", text: "text-blue-600" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
    violet: { bg: "bg-violet-50", text: "text-violet-600" },
    orange: { bg: "bg-orange-50", text: "text-orange-600" },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Listado de clientes activos de banderas
          </p>
        </div>
        <Button asChild>
          <Link href="/publimar/banderas/clientes/nuevo">
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo cliente
          </Link>
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const c = colorClasses[kpi.color];
          return (
            <Card
              key={kpi.label}
              className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200"
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    {kpi.label}
                  </span>
                  <div
                    className={cn(
                      "h-9 w-9 rounded-lg flex items-center justify-center",
                      c.bg
                    )}
                  >
                    <Icon className={cn("h-4 w-4", c.text)} />
                  </div>
                </div>
                <div className="text-2xl font-bold tracking-tight">
                  {kpi.value}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Búsqueda */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre, razón social, CUIT, email o teléfono..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Listado */}
      {status === "loading" ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">
                Listado de clientes
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {filteredClients?.length || 0} resultados
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {currentItems && currentItems.length > 0 ? (
              <div className="space-y-1">
                {currentItems.map((client) => {
                  const isCompany = client.type === EClientType.COMPANY;
                  const TypeIcon = isCompany ? Building2 : User;
                  const typeLabel = isCompany ? "Empresa" : "Persona física";

                  const tax = client.taxCondition
                    ? taxConditionInfo[client.taxCondition as EClientTaxCondition]
                    : null;

                  const contactName =
                    client.contacts?.[0]?.name || client.name || "";
                  const phone =
                    client.contacts?.[0]?.phone || client.phone || "";
                  const metaParts = [
                    typeLabel,
                    contactName && contactName !== client.name ? contactName : null,
                    phone,
                  ].filter(Boolean);

                  return (
                    <button
                      type="button"
                      key={client.id}
                      onClick={() => handleViewClient(client.id, client.name)}
                      className="w-full text-left flex items-center gap-6 p-3 rounded-lg hover:bg-slate-50 transition-colors duration-150 group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                          <TypeIcon className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {client.name || "-"}
                          </p>
                          {metaParts.length > 0 && (
                            <p className="text-xs text-muted-foreground truncate">
                              {metaParts.join(" · ")}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {creditByClient.get(client.id) ? (
                          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                            <Wallet className="h-3 w-3" />
                            {formatearPrecio(creditByClient.get(client.id) || 0)}
                          </span>
                        ) : null}
                        {client.cuit && (
                          <span className="text-xs text-muted-foreground font-mono tabular-nums">
                            {formatCuit(client.cuit)}
                          </span>
                        )}
                        {tax ? (
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap",
                              tax.className
                            )}
                          >
                            {tax.label}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap bg-slate-50 text-slate-400 border border-dashed border-slate-200">
                            Sin condición fiscal
                          </span>
                        )}
                      </div>
                      <Eye className="h-4 w-4 text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity shrink-0" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {searchTerm
                  ? "No se encontraron clientes con los términos de búsqueda."
                  : "No hay clientes disponibles. ¡Añade tu primer cliente!"}
              </div>
            )}

            {/* Controles de paginación */}
            {filteredClients && filteredClients.length > 0 && (
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-4 pt-4 border-t">
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
                    {Math.min(indexOfLastItem, filteredClients?.length || 0)} de{" "}
                    {filteredClients?.length || 0}
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
    </div>
  );
}

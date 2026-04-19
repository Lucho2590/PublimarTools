'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { EProviderAccountStatus } from "@/types/providerAccount";
import { formatearPrecio } from "@/lib/utils";
import { DollarSign, Eye, ArrowLeft } from "lucide-react";

export default function CuentasCorrientesPage() {
  const firestore = useFirestore();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Obtener todas las cuentas corrientes
  const accountsCollection = collection(firestore, "providerAccounts");
  const accountsQuery = query(accountsCollection, orderBy("providerName"));
  const { status, data: accounts } = useFirestoreCollectionData(accountsQuery, { idField: "id" });

  const normalizeText = (text: string) => {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };

  // Filtrar cuentas
  const filteredAccounts = useMemo(() => {
    return accounts?.filter((account: any) => {
      const searchNormalized = normalizeText(searchTerm);
      const matchesSearch = normalizeText(account.providerName || '').includes(searchNormalized);
      const matchesStatus = statusFilter === "all" || account.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [accounts, searchTerm, statusFilter]);

  // Total saldo pendiente
  const totalBalance = useMemo(() => {
    return filteredAccounts?.reduce((sum, acc: any) => sum + (Number(acc.balance) || 0), 0) || 0;
  }, [filteredAccounts]);

  // Paginacion
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredAccounts?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((filteredAccounts?.length || 0) / itemsPerPage);

  const getPageNumbers = () => {
    const pageNumbers = [];
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
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pageNumbers.push(i);
        pageNumbers.push(-1);
        pageNumbers.push(totalPages);
      }
    }
    return pageNumbers;
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Cuentas Corrientes</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="bg-slate-600 hover:bg-slate-700 text-white">
            <Link href="/publimar/proveedores">Gestionar Proveedores</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/publimar/administracion/compras">
              <ArrowLeft className="h-4 w-4 mr-1" /> Volver a Compras
            </Link>
          </Button>
        </div>
      </div>

      {/* Card resumen */}
      <Card className="mb-6 bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-900 p-3 rounded-full">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-600 font-medium">Total Saldo Pendiente</p>
                <p className="text-3xl font-bold text-blue-900">{formatearPrecio(totalBalance)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600">Cuentas</p>
              <p className="text-2xl font-semibold text-slate-900">{filteredAccounts?.length || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <Label className="mb-2 block">Buscar proveedor</Label>
              <Input
                placeholder="Buscar por nombre de proveedor..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex-1">
              <Label className="mb-2 block">Estado</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value={EProviderAccountStatus.ACTIVE}>Activa</SelectItem>
                  <SelectItem value={EProviderAccountStatus.CLOSED}>Cerrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex md:justify-end">
              <Button variant="outline" onClick={clearFilters} size="sm">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </Button>
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
                  <span className="text-sm text-gray-500">por pagina</span>
                </div>
                <div className="text-sm text-gray-500">
                  Mostrando {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, filteredAccounts?.length || 0)} de {filteredAccounts?.length || 0} cuentas
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Proveedor</TableHead>
                    <TableHead className="text-right">Total Compras</TableHead>
                    <TableHead className="text-right">Total Pagos</TableHead>
                    <TableHead className="text-right">Saldo Pendiente</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentItems && currentItems.length > 0 ? (
                    currentItems.map((account: any) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.providerName || "-"}</TableCell>
                        <TableCell className="text-right">{formatearPrecio(Number(account.totalPurchases) || 0)}</TableCell>
                        <TableCell className="text-right">{formatearPrecio(Number(account.totalPayments) || 0)}</TableCell>
                        <TableCell className="text-right font-semibold">
                          <span className={Number(account.balance) > 0 ? "text-red-600" : "text-green-600"}>
                            {formatearPrecio(Number(account.balance) || 0)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            account.status === EProviderAccountStatus.ACTIVE
                              ? "bg-green-100 text-green-800"
                              : "bg-slate-100 text-slate-800"
                          }`}>
                            {account.status === EProviderAccountStatus.ACTIVE ? "Activa" : "Cerrada"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                            title="Ver detalle"
                          >
                            <Link href={`/publimar/administracion/cuentasCorrientes/${account.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-slate-500">
                        {searchTerm || statusFilter !== "all"
                          ? "No se encontraron cuentas corrientes con los filtros aplicados."
                          : "No hay cuentas corrientes registradas."}
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
    </div>
  );
}

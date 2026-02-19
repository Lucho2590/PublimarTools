'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, where, getDocs, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
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
import { EBillingStatus, TBilling } from "@/types/billing";
import { EQuoteStatus } from "@/types/quote";
import { EClientSection } from "@/types/client";
import { Eye, DollarSign, Clock, CheckCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function FacturacionPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isMigrating, setIsMigrating] = useState(false);
  const firestore = useFirestore();

  // Generar número de facturación
  const generateBillingNumber = () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `F-VP-${dateStr}-${random}`;
  };

  // Migrar presupuestos existentes sin billing
  const handleMigrateExisting = async () => {
    setIsMigrating(true);
    try {
      // Obtener presupuestos aceptados de Vía Pública
      const quotesCollection = collection(firestore, collections.QUOTES);
      const quotesQuery = query(
        quotesCollection,
        where("client.section", "==", EClientSection.VIA_PUBLICA),
        where("status", "==", EQuoteStatus.CONFIRMED)
      );
      const quotesSnap = await getDocs(quotesQuery);
      const confirmedQuotes = quotesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Obtener billings existentes
      const billingsSnap = await getDocs(collection(firestore, collections.BILLINGS));
      const existingQuoteIds = new Set(
        billingsSnap.docs.map(doc => doc.data().quoteId)
      );

      // Filtrar presupuestos sin billing
      const quotesWithoutBilling = confirmedQuotes.filter(
        quote => !existingQuoteIds.has(quote.id)
      );

      if (quotesWithoutBilling.length === 0) {
        toast.info("Todos los presupuestos ya tienen registro de facturación");
        setIsMigrating(false);
        return;
      }

      // Crear billing para cada presupuesto
      let created = 0;
      for (const quote of quotesWithoutBilling) {
        const quoteData = quote as any;

        // Buscar datos completos del cliente
        let clientData = {
          id: quoteData.client?.id || '',
          name: quoteData.client?.name || '',
          section: quoteData.client?.section || '',
          cuit: null as string | null,
          phone: null as string | null,
          email: null as string | null,
          address: null as string | null,
        };

        // Si el presupuesto tiene clientId, buscar datos completos
        if (quoteData.client?.id) {
          try {
            const clientRef = doc(firestore, collections.CLIENTS, quoteData.client.id);
            const clientSnap = await getDoc(clientRef);
            if (clientSnap.exists()) {
              const fullClient = clientSnap.data();
              clientData = {
                id: quoteData.client.id,
                name: fullClient.name || quoteData.client?.name || '',
                section: fullClient.section || quoteData.client?.section || '',
                cuit: fullClient.cuit || null,
                phone: fullClient.phone || null,
                email: fullClient.email || null,
                address: fullClient.address || null,
              };
            }
          } catch (e) {
            console.error("Error fetching client:", e);
          }
        }

        const billingData = {
          number: generateBillingNumber(),
          quoteId: quote.id,
          quoteNumber: quoteData.number || 'S/N',

          client: clientData,

          items: quoteData.items?.map((item: any) => ({
            productName: item.productName || 'Sin nombre',
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
            subtotal: item.subtotal || 0,
            description: item.description || null,
          })) || [],

          formasPago: quoteData.formasPago?.map((fp: any, index: number) => ({
            id: `fp-${Date.now()}-${index}`,
            tipo: fp.tipo || '',
            monto: fp.monto || 0,
            cuenta: fp.cuenta || null,
            factura: fp.factura || false,
            tipoFactura: fp.tipoFactura || null,
          })) || [],

          totalAmount: quoteData.totalVenta || quoteData.total || 0,
          totalPaid: 0,
          balance: quoteData.totalVenta || quoteData.total || 0,

          paymentHistory: [],
          status: EBillingStatus.PENDING,

          periodos: quoteData.periodos || null,
          conImpresiones: quoteData.conImpresiones || false,
          impresiones: quoteData.impresiones || null,
          notes: quoteData.notes || null,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: quoteData.createdBy || '',
        };

        await addDoc(collection(firestore, collections.BILLINGS), billingData);
        created++;
      }

      toast.success(`Se crearon ${created} registros de facturación`);
    } catch (error) {
      console.error("Error migrando presupuestos:", error);
      toast.error("Error al migrar presupuestos");
    } finally {
      setIsMigrating(false);
    }
  };

  // Consulta a Firestore
  const billingsCollection = collection(firestore, collections.BILLINGS);
  const billingsQuery = query(
    billingsCollection,
    orderBy("createdAt", "desc")
  );

  const { status, data: billings } = useFirestoreCollectionData(billingsQuery, {
    idField: "id",
  }) as { status: string; data: TBilling[] };

  // Función para normalizar texto
  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  };

  // Filtrar billings
  const filteredBillings = billings?.filter((billing) => {
    const searchNormalized = normalizeText(searchTerm);
    const matchesSearch =
      normalizeText(billing.number || '').includes(searchNormalized) ||
      normalizeText(billing.client?.name || '').includes(searchNormalized) ||
      normalizeText(billing.quoteNumber || '').includes(searchNormalized);

    const matchesStatus = statusFilter === "all" || billing.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Calcular totales por estado
  const totals = useMemo(() => {
    if (!billings) return { pending: 0, partial: 0, paid: 0 };

    return billings.reduce((acc, billing) => {
      if (billing.status === EBillingStatus.PENDING) {
        acc.pending += billing.balance || 0;
      } else if (billing.status === EBillingStatus.PARTIAL) {
        acc.partial += billing.balance || 0;
      } else if (billing.status === EBillingStatus.PAID) {
        acc.paid += billing.totalPaid || 0;
      }
      return acc;
    }, { pending: 0, partial: 0, paid: 0 });
  }, [billings]);

  // Paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredBillings?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((filteredBillings?.length || 0) / itemsPerPage);

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

  const getStatusLabel = (status: EBillingStatus) => {
    const labels = {
      [EBillingStatus.PENDING]: "Pendiente",
      [EBillingStatus.PARTIAL]: "Parcial",
      [EBillingStatus.PAID]: "Pagado",
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: EBillingStatus) => {
    const colors = {
      [EBillingStatus.PENDING]: "bg-gray-100 text-gray-800",
      [EBillingStatus.PARTIAL]: "bg-yellow-100 text-yellow-800",
      [EBillingStatus.PAID]: "bg-green-100 text-green-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const formatDate = (date: any) => {
    if (!date) return "-";
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('es-AR');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  return (
    <div className="pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            Facturación
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Seguimiento de cobros de presupuestos aceptados
          </p>
        </div>
        <Button
          onClick={handleMigrateExisting}
          disabled={isMigrating}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isMigrating ? 'animate-spin' : ''}`} />
          {isMigrating ? 'Sincronizando...' : 'Sincronizar presupuestos'}
        </Button>
      </div>

      {/* Cards de resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gray-100 rounded-full">
                <Clock className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Pendiente de cobro</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(totals.pending)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-100 rounded-full">
                <DollarSign className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Pago parcial</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {formatCurrency(totals.partial)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Cobrado</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(totals.paid)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar por número, cliente o presupuesto..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="w-full md:w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value={EBillingStatus.PENDING}>Pendiente</SelectItem>
                  <SelectItem value={EBillingStatus.PARTIAL}>Parcial</SelectItem>
                  <SelectItem value={EBillingStatus.PAID}>Pagado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      {status === "loading" ? (
        <div className="flex justify-center my-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 overflow-x-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 hidden sm:inline">Mostrar</span>
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
                  <span className="text-sm text-gray-500 hidden sm:inline">por página</span>
                </div>
                <div className="text-sm text-gray-500">
                  <span className="hidden sm:inline">Mostrando {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, filteredBillings?.length || 0)} de </span>
                  {filteredBillings?.length || 0} registros
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Número</TableHead>
                    <TableHead className="text-left">Cliente</TableHead>
                    <TableHead className="text-left hidden md:table-cell">Presupuesto</TableHead>
                    <TableHead className="text-left hidden lg:table-cell">Fecha</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Pagado</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Saldo</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentItems && currentItems.length > 0 ? (
                    currentItems.map((billing) => (
                      <TableRow key={billing.id}>
                        <TableCell className="font-medium">
                          {billing.number || "-"}
                        </TableCell>
                        <TableCell className="text-left">
                          {billing.client?.name || "-"}
                        </TableCell>
                        <TableCell className="text-left hidden md:table-cell">
                          {billing.quoteNumber || "-"}
                        </TableCell>
                        <TableCell className="text-left hidden lg:table-cell">
                          {formatDate(billing.createdAt)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(billing.totalAmount || 0)}
                        </TableCell>
                        <TableCell className="text-right hidden sm:table-cell text-green-600 font-medium">
                          {formatCurrency(billing.totalPaid || 0)}
                        </TableCell>
                        <TableCell className="text-right hidden sm:table-cell text-red-600 font-medium">
                          {formatCurrency(billing.balance || 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(billing.status)}`}
                          >
                            {getStatusLabel(billing.status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            title="Ver detalle"
                            className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white h-8 w-8"
                          >
                            <Link href={`/publimar/viaPublica/facturacion/${billing.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-center py-6 text-slate-500"
                      >
                        {searchTerm || statusFilter !== "all"
                          ? "No se encontraron registros con los filtros aplicados."
                          : "No hay registros de facturación disponibles."}
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
    </div>
  );
}

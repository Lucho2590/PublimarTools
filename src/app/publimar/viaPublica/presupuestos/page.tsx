'use client';

import { useState } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, where, doc, updateDoc, serverTimestamp, getDoc, addDoc, getDocs } from "firebase/firestore";
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
import { EQuoteStatus, TQuote } from "@/types/quote";
import { EClientSection } from "@/types/client";
import { Eye, Download } from "lucide-react";
import { toast } from "sonner";
import { EBillingStatus } from "@/types/billing";

export default function PresupuestosViaPublicaPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const firestore = useFirestore();

  // Consulta a Firestore - Filtra solo presupuestos de la sección "viaPublica"
  const quotesCollection = collection(firestore, collections.QUOTES);
  const quotesQuery = query(
    quotesCollection,
    where("client.section", "==", EClientSection.VIA_PUBLICA),
    orderBy("createdAt", "desc")
  );

  const { status, data: quotes } = useFirestoreCollectionData(quotesQuery, {
    idField: "id",
  }) as { status: string; data: TQuote[] };

  // Función para normalizar texto (quitar acentos y convertir a minúsculas)
  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  };

  // Filtrar presupuestos según la búsqueda y status
  const filteredQuotes = quotes?.filter((quote) => {
    const searchNormalized = normalizeText(searchTerm);
    const matchesSearch =
      normalizeText(quote.number || '').includes(searchNormalized) ||
      normalizeText(quote.client?.name || '').includes(searchNormalized);

    const matchesStatus = statusFilter === "all" || quote.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Calcular índices para la paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredQuotes?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((filteredQuotes?.length || 0) / itemsPerPage);

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

  const getStatusLabel = (status: EQuoteStatus) => {
    const labels = {
      [EQuoteStatus.DRAFT]: "Borrador",
      [EQuoteStatus.SENT]: "Enviado",
      [EQuoteStatus.CONFIRMED]: "Aceptado",
      [EQuoteStatus.REJECTED]: "Cancelado",
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: EQuoteStatus) => {
    const colors = {
      [EQuoteStatus.DRAFT]: "bg-gray-100 text-gray-800 hover:bg-gray-200",
      [EQuoteStatus.SENT]: "bg-blue-100 text-blue-800 hover:bg-blue-200",
      [EQuoteStatus.CONFIRMED]: "bg-green-100 text-green-800 hover:bg-green-200",
      [EQuoteStatus.REJECTED]: "bg-red-100 text-red-800 hover:bg-red-200",
    };
    return colors[status] || "bg-gray-100 text-gray-800 hover:bg-gray-200";
  };

  // Generar número de facturación
  const generateBillingNumber = () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `F-VP-${dateStr}-${random}`;
  };

  // Verificar si ya existe un billing para este presupuesto
  const checkExistingBilling = async (quoteId: string): Promise<boolean> => {
    const billingsCollection = collection(firestore, collections.BILLINGS);
    const q = query(billingsCollection, where("quoteId", "==", quoteId));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  };

  // Crear billing desde un presupuesto confirmado
  const createBillingFromQuote = async (quoteId: string, quoteData: any) => {
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
      quoteId: quoteId,
      quoteNumber: quoteData.number || 'S/N',

      // Cliente snapshot con datos completos
      client: clientData,

      // Items snapshot
      items: quoteData.items?.map((item: any) => ({
        productName: item.productName || 'Sin nombre',
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || 0,
        subtotal: item.subtotal || 0,
        description: item.description || null,
      })) || [],

      // Formas de pago desde el presupuesto
      formasPago: quoteData.formasPago?.map((fp: any, index: number) => ({
        id: `fp-${Date.now()}-${index}`,
        tipo: fp.tipo || '',
        monto: fp.monto || 0,
        cuenta: fp.cuenta || null,
        factura: fp.factura || false,
        tipoFactura: fp.tipoFactura || null,
      })) || [],

      // Importes
      totalAmount: quoteData.totalVenta || quoteData.total || 0,
      totalPaid: 0,
      balance: quoteData.totalVenta || quoteData.total || 0,

      // Historial de pagos vacío
      paymentHistory: [],

      // Estado inicial
      status: EBillingStatus.PENDING,

      // Datos adicionales del presupuesto
      periodos: quoteData.periodos || null,
      conImpresiones: quoteData.conImpresiones || false,
      impresiones: quoteData.impresiones || null,
      notes: quoteData.notes || null,

      // Metadata
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: quoteData.createdBy || '',
    };

    const billingsCollection = collection(firestore, collections.BILLINGS);
    await addDoc(billingsCollection, billingData);
  };

  // Cambiar estado del presupuesto
  const handleStatusChange = async (quoteId: string, newStatus: EQuoteStatus) => {
    try {
      const quoteRef = doc(firestore, collections.QUOTES, quoteId);

      // Si cambia a CONFIRMED, crear registro de facturación
      if (newStatus === EQuoteStatus.CONFIRMED) {
        const quoteSnap = await getDoc(quoteRef);
        if (quoteSnap.exists()) {
          const quoteData = quoteSnap.data();
          // Verificar si ya existe billing para este presupuesto
          const existingBilling = await checkExistingBilling(quoteId);
          if (!existingBilling) {
            await createBillingFromQuote(quoteId, quoteData);
            toast.success("Registro de facturación creado automáticamente");
          }
        }
      }

      await updateDoc(quoteRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
        ...(newStatus === EQuoteStatus.CONFIRMED && { confirmedAt: serverTimestamp() }),
      });
      toast.success(`Estado cambiado a ${getStatusLabel(newStatus)}`);
    } catch (error) {
      console.error("Error cambiando estado:", error);
      toast.error("Error al cambiar el estado");
    }
  };

  // Placeholder para descarga de PDF
  const handleDownloadPDF = (quote: TQuote) => {
    toast.info("Función de PDF pendiente de implementar");
    // TODO: Implementar generación de PDF
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
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Presupuestos</h1>
        <Button
          asChild
          className="bg-blue-900 hover:bg-blue-900 hover:text-white"
        >
          <Link href="/publimar/viaPublica/presupuestos/nuevo">Nuevo presupuesto</Link>
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar por número o cliente..."
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
                  <SelectItem value={EQuoteStatus.DRAFT}>Borrador</SelectItem>
                  <SelectItem value={EQuoteStatus.SENT}>Enviado</SelectItem>
                  <SelectItem value={EQuoteStatus.CONFIRMED}>Aceptado</SelectItem>
                  <SelectItem value={EQuoteStatus.REJECTED}>Cancelado</SelectItem>
                </SelectContent>
              </Select>
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
                  <span className="hidden sm:inline">Mostrando {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, filteredQuotes?.length || 0)} de </span>
                  {filteredQuotes?.length || 0} presupuestos
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Número</TableHead>
                    <TableHead className="text-left">Cliente</TableHead>
                    <TableHead className="text-left hidden md:table-cell">Fecha</TableHead>
                    <TableHead className="text-left hidden lg:table-cell">Válido hasta</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-center hidden sm:table-cell">Estado</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentItems && currentItems.length > 0 ? (
                    currentItems.map((quote) => (
                      <TableRow key={quote.id}>
                        <TableCell className="font-medium">
                          {quote.number || "-"}
                        </TableCell>
                        <TableCell className="text-left">
                          {quote.client?.name || "-"}
                        </TableCell>
                        <TableCell className="text-left hidden md:table-cell">
                          {formatDate(quote.createdAt)}
                        </TableCell>
                        <TableCell className="text-left hidden lg:table-cell">
                          {formatDate(quote.validUntil)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(quote.total || 0)}
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          <Select
                            value={quote.status}
                            onValueChange={(value) => handleStatusChange(quote.id, value as EQuoteStatus)}
                          >
                            <SelectTrigger
                              className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium border-none shadow-none cursor-pointer transition-colors min-w-[80px] h-6 w-24 [&>svg]:hidden ${getStatusColor(quote.status)}`}
                            >
                              <SelectValue>
                                {getStatusLabel(quote.status)}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EQuoteStatus.DRAFT}>Borrador</SelectItem>
                              <SelectItem value={EQuoteStatus.SENT}>Enviado</SelectItem>
                              <SelectItem value={EQuoteStatus.CONFIRMED}>Aceptado</SelectItem>
                              <SelectItem value={EQuoteStatus.REJECTED}>Cancelado</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              title="Ver detalle"
                              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white h-8 w-8"
                            >
                              <Link href={`/publimar/viaPublica/presupuestos/${quote.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Descargar PDF"
                              onClick={() => handleDownloadPDF(quote)}
                              className="bg-green-600 hover:bg-green-700 hover:text-white text-white h-8 w-8"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-6 text-slate-500"
                      >
                        {searchTerm || statusFilter !== "all"
                          ? "No se encontraron presupuestos con los filtros aplicados."
                          : "No hay presupuestos disponibles. ¡Crea tu primer presupuesto!"}
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

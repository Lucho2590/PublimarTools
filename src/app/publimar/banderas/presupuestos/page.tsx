'use client';

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, doc, updateDoc, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { formatCuit } from "@/lib/cuit";
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
import { Edit, Eye, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { DocumentData } from "firebase/firestore";
import { formatearPrecio, generateSlug } from "@/lib/utils";
import QuoteDetailsModal from "./modalPresupuestos/quoteDetailsModal";
import { EClientSection } from "@/types/client";

export default function PresupuestosPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<EQuoteStatus | "all">("all");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const firestore = useFirestore();

  // Función para manejar la vista de presupuesto - abrir en nueva pestaña
  const handleViewQuote = (quoteId: string, quoteNumber: string) => {
    const slug = generateSlug(quoteNumber, quoteId);
    window.open(`/publimar/banderas/presupuestos/${slug}`, '_blank');
  };

  // Función para cerrar el modal y limpiar el estado
  const handleCloseModal = () => {
    setShowModal(false);
    // Delay para permitir que la animación de cierre termine antes de limpiar el ID
    setTimeout(() => {
      setSelectedQuoteId(null);
    }, 150);
  };

  // Función para actualizar el estado del presupuesto
  const handleStatusChange = async (quoteId: string, newStatus: EQuoteStatus) => {
    try {
      const quoteRef = doc(firestore, collections.QUOTES, quoteId);
      await updateDoc(quoteRef, {
        status: newStatus,
        updatedAt: new Date(),
      });
      toast.success("Estado actualizado correctamente");
    } catch (error) {
      console.error("Error al actualizar estado:", error);
      toast.error("Error al actualizar el estado");
    }
  };

  // Consulta a Firestore
  const quotesCollection = collection(firestore, collections.QUOTES);
  const quotesQuery = query(quotesCollection, orderBy("createdAt", "desc"),
  where("client.section", "==", EClientSection.BANDERAS));

  const { status, data: quotesData } = useFirestoreCollectionData(quotesQuery, {
    idField: "id",
  });

  // Filtrar presupuestos según la búsqueda y estado
  const filteredQuotes = quotesData
    ?.filter((quote: DocumentData) => {
      const matchesSearch =
        quote.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.client.name.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || quote.status === statusFilter;

      return matchesSearch && matchesStatus;
    })
    .map((quote: DocumentData) => ({
      ...quote,
      createdAt: quote.createdAt?.toDate?.() || new Date(quote.createdAt),
      updatedAt: quote.updatedAt?.toDate?.() || new Date(quote.updatedAt),
      validUntil: quote.validUntil?.toDate?.() || new Date(quote.validUntil),
      sentAt: quote.sentAt?.toDate?.() || undefined,
      confirmedAt: quote.confirmedAt?.toDate?.() || undefined,
      rejectedAt: quote.rejectedAt?.toDate?.() || undefined,
      comments:
        quote.comments?.map((comment: any) => ({
          ...comment,
          createdAt:
            comment.createdAt?.toDate?.() || new Date(comment.createdAt),
        })) || [],
    })) as (TQuote & { id: string })[];

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

  const handleDownload = async (quote: TQuote) => {
    try {
      setDownloading(quote.id);

      // Crear el PDF
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      // Márgenes más pequeños para alinear con el header que va de borde a borde
      const margins = { top: 10, right: 10, bottom: 20, left: 10 };

      // Cargar y agregar la imagen del header
      const headerImg = new Image();
      headerImg.src = "/imagenes/encabezado-pr.jpg";

      await new Promise((resolve, reject) => {
        headerImg.onload = resolve;
        headerImg.onerror = reject;
      });

      // Calcular dimensiones de la imagen manteniendo aspect ratio
      const imgAspectRatio = headerImg.width / headerImg.height;
      const imgWidth = pageWidth; // Ocupar todo el ancho de la página
      const imgHeight = imgWidth / imgAspectRatio;

      // Agregar header
      pdf.addImage(
        headerImg,
        "JPEG",
        0,
        0,
        imgWidth,
        imgHeight
      );

      let yPosition = margins.top + imgHeight + 10;

      // Información del cliente y número de presupuesto
      const leftColumnX = margins.left;
      const rightColumnX = pageWidth - margins.right - 60;

      // Columna izquierda - Info del cliente
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("Información del Cliente", leftColumnX, yPosition);

      yPosition += 7;
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");

      const clientInfo = [
        { label: "Cliente:", value: quote.client.name },
        quote.client.email ? { label: "Email:", value: quote.client.email } : null,
        quote.client.phone ? { label: "Teléfono:", value: quote.client.phone } : null,
        quote.client.address ? { label: "Dirección:", value: quote.client.address } : null,
        quote.client.cuit ? { label: "CUIT/CUIL:", value: formatCuit(quote.client.cuit) } : null,
      ].filter(Boolean);

      clientInfo.forEach((info) => {
        if (info) {
          pdf.setFont("helvetica", "bold");
          pdf.text(info.label, leftColumnX, yPosition);
          pdf.setFont("helvetica", "normal");
          pdf.text(info.value, leftColumnX + 20, yPosition);
          yPosition += 5;
        }
      });

      // Columna derecha - Info del presupuesto
      let rightYPosition = margins.top + imgHeight + 10;
      const rightAlignX = pageWidth - margins.right;

      pdf.setFontSize(20);
      pdf.setFont("helvetica", "bold");
      pdf.text("PRESUPUESTO", rightAlignX, rightYPosition, { align: "right" });

      rightYPosition += 7;
      pdf.setFontSize(14);
      pdf.text(`#${quote.number}`, rightAlignX, rightYPosition, { align: "right" });

      rightYPosition += 7;
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Fecha: ${formatDate(quote.createdAt)}`, rightAlignX, rightYPosition, { align: "right" });
      rightYPosition += 4;
      pdf.text(`Válido hasta: ${formatDate(quote.validUntil)}`, rightAlignX, rightYPosition, { align: "right" });

      yPosition = Math.max(yPosition, rightYPosition) + 10;

      // Preparar datos para la tabla
      const hasDiscounts = quote.items.some(item => item.discount && item.discount > 0);

      const tableHeaders = hasDiscounts
        ? ["Producto", "Precio", "Cant.", "Desc.", "Subtotal"]
        : ["Producto", "Precio", "Cant.", "Subtotal"];

      // Guardar los nombres de productos para usar en didParseCell
      const productNames = quote.items.map(item => item.product.name);

      const tableData = quote.items.map((item) => {
        const productName = item.product.name;
        const variant = item.variant ? `Medida: ${item.variant.size}` : "";
        const description = item.product.description || "";
        const fullDescription = [productName, variant, description]
          .filter(Boolean)
          .join("\n");

        const row = [
          fullDescription,
          formatearPrecio(item.unitPrice),
          item.quantity.toString(),
        ];

        if (hasDiscounts) {
          row.push(item.discount ? `${item.discount}%` : "-");
        }

        row.push(formatearPrecio(item.subtotal));

        return row;
      });

      // Generar tabla con autoTable
      autoTable(pdf, {
        head: [tableHeaders],
        body: tableData,
        startY: yPosition,
        margin: margins,
        styles: {
          fontSize: 9,
          cellPadding: 4,
        },
        headStyles: {
          fillColor: [245, 245, 245],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          halign: "left", // Por defecto izquierda
        },
        columnStyles: {
          0: { cellWidth: hasDiscounts ? 90 : 105 }, // Producto - ocupa el espacio restante
          1: { halign: "right", cellWidth: 30 }, // Precio - alineado a la derecha
          2: { halign: "center", cellWidth: 20 }, // Cantidad - centrado
          3: { halign: hasDiscounts ? "center" : "right", cellWidth: hasDiscounts ? 20 : 35 }, // Descuento (si existe) o Subtotal
          ...(hasDiscounts && { 4: { halign: "right", cellWidth: 35 } }), // Subtotal cuando hay descuentos
        },
        tableWidth: "auto", // Que la tabla ocupe el ancho disponible entre los márgenes
        didParseCell: (data) => {
          // Alinear los headers de las columnas numéricas
          if (data.section === "head") {
            if (data.column.index === 1) {
              // Header "Precio" - alineado a la derecha
              data.cell.styles.halign = "right";
            } else if (data.column.index === 2) {
              // Header "Cant." - centrado
              data.cell.styles.halign = "center";
            } else if (data.column.index === 3) {
              // Header "Desc." (si existe) o "Subtotal" - según corresponda
              data.cell.styles.halign = hasDiscounts ? "center" : "right";
            } else if (hasDiscounts && data.column.index === 4) {
              // Header "Subtotal" cuando hay descuentos - alineado a la derecha
              data.cell.styles.halign = "right";
            }
          }
        },
        rowPageBreak: "avoid", // Evita que las filas se corten entre páginas
        didDrawCell: (data) => {
          // Dibujar el nombre del producto en negrita encima de lo que ya se dibujó
          if (data.section === "body" && data.column.index === 0) {
            const productName = productNames[data.row.index];
            const cell = data.cell;

            // Obtener posición de la celda
            const x = cell.x + cell.padding("left");
            const y = cell.y + cell.padding("top") + 2.5; // Ajuste para alinear con el texto

            // Dibujar un rectángulo blanco sobre la primera línea para "borrar" el texto normal
            const textWidth = pdf.getTextWidth(productName);
            pdf.setFillColor(255, 255, 255); // Blanco

            // Si la fila tiene color de fondo, usar ese color
            if (data.row.index % 2 === 0 && cell.styles.fillColor) {
              const fillColor = cell.styles.fillColor;
              if (Array.isArray(fillColor)) {
                pdf.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
              }
            }

            pdf.rect(x, y - 2.5, textWidth + 1, 3.5, 'F');

            // Dibujar el nombre en negrita
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(9);
            pdf.setTextColor(0, 0, 0);
            pdf.text(productName, x, y);

            // Restaurar la fuente normal para el resto
            pdf.setFont("helvetica", "normal");
          }
        },
      });

      // Agregar totales después de la tabla (solo se ejecuta una vez al final)
      const finalY = (pdf as any).lastAutoTable.finalY + 10;
      const totalsX = pageWidth - margins.right - 60;

      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");

      pdf.text("Subtotal:", totalsX, finalY, { align: "left" });
      pdf.text(formatearPrecio(quote.subtotal), pageWidth - margins.right, finalY, { align: "right" });

      pdf.text(`IVA (${quote.taxRate}%):`, totalsX, finalY + 6, { align: "left" });
      pdf.text(formatearPrecio(quote.tax), pageWidth - margins.right, finalY + 6, { align: "right" });

      pdf.setFont("helvetica", "bold");
      pdf.line(totalsX, finalY + 9, pageWidth - margins.right, finalY + 9);
      pdf.text("Total:", totalsX, finalY + 14, { align: "left" });
      pdf.text(formatearPrecio(quote.total), pageWidth - margins.right, finalY + 14, { align: "right" });

      // Descargar el PDF
      pdf.save(`presupuesto-${quote.number}.pdf`);
    } catch (error) {
      console.error("Error al generar el PDF:", error);
      toast.error("Error al generar el PDF");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Presupuestos</h1>
        <Button
          asChild
          className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
        >
          <Link href="/publimar/banderas/presupuestos/nuevo">
            Nuevo presupuesto
          </Link>
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
                  setCurrentPage(1); // Reset a la primera página cuando se busca
                }}
              />
            </div>
            <div>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as EQuoteStatus | "all");
                  setCurrentPage(1); // Reset a la primera página cuando se filtra
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filtrar por estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value={EQuoteStatus.DRAFT}>Borrador</SelectItem>
                  <SelectItem value={EQuoteStatus.SENT}>Enviado</SelectItem>
                  <SelectItem value={EQuoteStatus.CONFIRMED}>
                    Confirmado
                  </SelectItem>
                  <SelectItem value={EQuoteStatus.REJECTED}>
                    Rechazado
                  </SelectItem>
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
                  Mostrando {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, filteredQuotes?.length || 0)} de {filteredQuotes?.length || 0} presupuestos
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Válido hasta</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentItems && currentItems.length > 0 ? (
                    currentItems.map((quote) => {
                      return (
                        <TableRow key={quote.id}>
                          <TableCell className="font-medium">
                            {quote.number}
                          </TableCell>
                          <TableCell>{quote.client.name}</TableCell>
                          <TableCell>{formatDate(quote.createdAt)}</TableCell>
                          <TableCell>{formatDate(quote.validUntil)}</TableCell>
                          <TableCell>{formatearPrecio(quote.total)}</TableCell>
                          <TableCell>
                            {quote.status === EQuoteStatus.CONFIRMED || quote.status === EQuoteStatus.REJECTED ? (
                              // Badge estático para presupuestos confirmados o rechazados
                              <span
                                className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium min-w-[80px] h-6 w-24 ${
                                  quote.status === EQuoteStatus.CONFIRMED
                                    ? "bg-green-100 text-green-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {quote.status === EQuoteStatus.CONFIRMED ? "Confirmado" : "Rechazado"}
                              </span>
                            ) : (
                              // Select editable para presupuestos no finalizados
                              <Select
                                value={quote.status}
                                onValueChange={(newStatus: EQuoteStatus) =>
                                  handleStatusChange(quote.id, newStatus)
                                }
                              >
                                <SelectTrigger
                                  className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium border-none shadow-none cursor-pointer transition-colors min-w-[80px] h-6 ${
                                    quote.status === EQuoteStatus.DRAFT
                                      ? "bg-slate-100 text-slate-800 hover:bg-slate-200 w-24"
                                      : "bg-blue-100 text-blue-800 hover:bg-blue-200 w-24"
                                  } [&>svg]:hidden`}
                                >
                                  <SelectValue>
                                    {quote.status === EQuoteStatus.DRAFT ? "Borrador" : "Enviado"}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={EQuoteStatus.DRAFT}>
                                    Borrador
                                  </SelectItem>
                                  <SelectItem value={EQuoteStatus.SENT}>
                                    Enviado
                                  </SelectItem>
                                  <SelectItem value={EQuoteStatus.CONFIRMED}>
                                    Confirmado
                                  </SelectItem>
                                  <SelectItem value={EQuoteStatus.REJECTED}>
                                    Rechazado
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Ver presupuesto"
                                className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                                onClick={() => handleViewQuote(quote.id, quote.number)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                title="Descargar"
                                className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDownload(quote);
                                }}
                                disabled={downloading === quote.id}
                                type="button"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-slate-500"
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

      {/* Modal de detalles de presupuesto */}
      <QuoteDetailsModal
        isOpen={showModal}
        onClose={handleCloseModal}
        quoteId={selectedQuoteId}
      />
    </div>
  );
}

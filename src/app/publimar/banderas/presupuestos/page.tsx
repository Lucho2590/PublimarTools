'use client';

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, doc, updateDoc, where } from "firebase/firestore";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatCuit } from "@/lib/cuit";
import { getTaxConditionLabel } from "@/lib/taxCondition";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { TablePagination } from "@/components/admin/TablePagination";
import collections from "@/lib/collections";
import { EQuoteStatus, TQuote } from "@/types/quote";
import { Eye, Download, FileText, Send, CheckCircle2, Coins, Plus, Search, Loader2, MoreVertical } from "lucide-react";
// jsPDF y jspdf-autotable (~1.6MB) se cargan bajo demanda dentro de handleDownload.
import { toast } from "sonner";
import { DocumentData } from "firebase/firestore";
import { formatearPrecio, generateSlug, redondearTotal } from "@/lib/utils";
import { formatItemDiscount } from "@/lib/totals";
import QuoteDetailsModal from "./modalPresupuestos/quoteDetailsModal";
import { EClientSection } from "@/types/client";

export default function PresupuestosPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebouncedValue(searchTerm);
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
  const filteredQuotes = useMemo(() => quotesData
    ?.filter((quote: DocumentData) => {
      const matchesSearch =
        quote.number.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        quote.client.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase());

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
    })) as (TQuote & { id: string })[], [quotesData, debouncedSearchTerm, statusFilter]);

  // Calcular índices para la paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredQuotes?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((filteredQuotes?.length || 0) / itemsPerPage);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // KPIs de resumen sobre TODOS los presupuestos de banderas (dashboard estable,
  // no depende de la búsqueda ni del filtro de estado).
  const stats = useMemo(() => {
    const list = (quotesData ?? []) as DocumentData[];
    let enviados = 0;
    let confirmados = 0;
    let montoTotal = 0;
    for (const q of list) {
      if (q.status === EQuoteStatus.SENT) enviados++;
      if (q.status === EQuoteStatus.CONFIRMED) confirmados++;
      montoTotal += Number(q.total) || 0;
    }
    return { total: list.length, enviados, confirmados, montoTotal };
  }, [quotesData]);

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

      // Carga bajo demanda de las librerías de PDF (evita ~1.6MB en el bundle inicial)
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

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
        (quote.client.cuit ?? (quote.client as { taxId?: string }).taxId)
          ? { label: "CUIT/CUIL:", value: formatCuit(quote.client.cuit ?? (quote.client as { taxId?: string }).taxId ?? "") }
          : null,
        quote.client.taxCondition
          ? { label: "Cond. fiscal:", value: getTaxConditionLabel(quote.client.taxCondition) }
          : null,
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
          // El descuento de línea puede ser % o monto fijo.
          row.push(item.discount ? formatItemDiscount(item) : "-");
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
      const totalsX = pageWidth - margins.right - 60;
      const valuesX = pageWidth - margins.right;

      // Descuentos generales del presupuesto. Cuando se desglosa IVA, el subtotal guardado
      // ya es el neto, que es la misma base sobre la que se calcula el descuento porcentual.
      const pdfSubtotal = Number(quote.subtotal) || 0;
      const pdfTax = Number(quote.taxAmount ?? quote.tax) || 0;
      const discountPercentage = Number(quote.discountPercentage) || 0;
      const manualDiscount = Number(quote.manualDiscount) || 0;
      const percentageDiscountAmount = (pdfSubtotal * discountPercentage) / 100;
      // Recalculamos el total en vez de confiar en el guardado: hay presupuestos viejos
      // cuyo total quedó sin restar el descuento.
      const pdfTotal = redondearTotal(
        pdfSubtotal + pdfTax - (percentageDiscountAmount + manualDiscount)
      );

      const totalsRows: { label: string; value: string }[] = [
        { label: "Subtotal:", value: formatearPrecio(pdfSubtotal) },
        { label: `IVA (${quote.taxRate}%):`, value: formatearPrecio(pdfTax) },
      ];

      if (discountPercentage > 0) {
        totalsRows.push({
          label: `Descuento (${discountPercentage}%):`,
          value: `-${formatearPrecio(redondearTotal(percentageDiscountAmount))}`,
        });
      }

      if (manualDiscount > 0) {
        totalsRows.push({
          label: "Descuento:",
          value: `-${formatearPrecio(redondearTotal(manualDiscount))}`,
        });
      }

      // Alto del bloque: una fila cada 6mm + la línea separadora y el Total
      const totalsHeight = totalsRows.length * 6 + 8;
      let ty = (pdf as any).lastAutoTable.finalY + 10;

      if (ty + totalsHeight > pageHeight - margins.bottom) {
        pdf.addPage();
        ty = margins.top + 10;
      }

      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");

      totalsRows.forEach((row) => {
        pdf.text(row.label, totalsX, ty, { align: "left" });
        pdf.text(row.value, valuesX, ty, { align: "right" });
        ty += 6;
      });

      pdf.setFont("helvetica", "bold");
      pdf.line(totalsX, ty - 3, valuesX, ty - 3);
      pdf.text("Total:", totalsX, ty + 2, { align: "left" });
      pdf.text(formatearPrecio(pdfTotal), valuesX, ty + 2, { align: "right" });

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
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Presupuestos</h1>
          <p className="text-slate-600 text-sm mt-1">
            Seguí el estado y el monto de tus presupuestos
          </p>
        </div>
        <Button asChild className="bg-blue-900 hover:bg-blue-800 text-white">
          <Link href="/publimar/banderas/presupuestos/nuevo">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo presupuesto
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Presupuestos"
          value={stats.total}
          icon={FileText}
          variant="blue"
        />
        <SummaryCard
          title="Enviados"
          value={stats.enviados}
          icon={Send}
          variant="amber"
        />
        <SummaryCard
          title="Confirmados"
          value={stats.confirmados}
          icon={CheckCircle2}
          variant="green"
        />
        <SummaryCard
          title="Monto total"
          value={formatearPrecio(stats.montoTotal)}
          icon={Coins}
          variant="slate"
        />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <Label className="mb-2 block">Buscar</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por número o cliente..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Estado</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as EQuoteStatus | "all");
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-full md:w-[200px]">
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
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">
                Presupuestos
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {filteredQuotes?.length || 0} resultados
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {currentItems && currentItems.length > 0 ? (
              <div className="space-y-1">
                {currentItems.map((quote) => {
                  const meta = [
                    quote.number,
                    `Vence ${formatDate(quote.validUntil)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div
                      key={quote.id}
                      onClick={() => handleViewQuote(quote.id, quote.number)}
                      className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors duration-150 group cursor-pointer"
                    >
                      {/* Icono */}
                      <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-blue-600" />
                      </div>

                      {/* Cliente + meta */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {quote.client?.name || "-"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {meta}
                        </p>
                      </div>

                      {/* Total */}
                      <div className="hidden sm:block text-right shrink-0 w-32">
                        <p className="text-sm font-medium">
                          {formatearPrecio(quote.total)}
                        </p>
                      </div>

                      {/* Estado */}
                      <div
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {quote.status === EQuoteStatus.CONFIRMED ||
                        quote.status === EQuoteStatus.REJECTED ? (
                          <span
                            className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium h-6 w-24 ${
                              quote.status === EQuoteStatus.CONFIRMED
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {quote.status === EQuoteStatus.CONFIRMED
                              ? "Confirmado"
                              : "Rechazado"}
                          </span>
                        ) : (
                          <Select
                            value={quote.status}
                            onValueChange={(newStatus: EQuoteStatus) =>
                              handleStatusChange(quote.id, newStatus)
                            }
                          >
                            <SelectTrigger
                              className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium border-none shadow-none cursor-pointer transition-colors h-6 w-24 ${
                                quote.status === EQuoteStatus.DRAFT
                                  ? "bg-slate-100 text-slate-800 hover:bg-slate-200"
                                  : "bg-blue-100 text-blue-800 hover:bg-blue-200"
                              } [&>svg]:hidden`}
                            >
                              <SelectValue>
                                {quote.status === EQuoteStatus.DRAFT
                                  ? "Borrador"
                                  : "Enviado"}
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
                      </div>

                      {/* Acciones */}
                      <div
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              title="Acciones"
                              className="h-8 w-8 text-slate-500 hover:text-slate-900"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-44 p-1">
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                              onClick={() =>
                                handleViewQuote(quote.id, quote.number)
                              }
                            >
                              <Eye className="h-4 w-4" />
                              Ver presupuesto
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                              onClick={() => handleDownload(quote)}
                              disabled={downloading === quote.id}
                            >
                              {downloading === quote.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                              Descargar PDF
                            </button>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {searchTerm || statusFilter !== "all"
                  ? "No se encontraron presupuestos con los filtros aplicados."
                  : "No hay presupuestos disponibles. ¡Crea tu primer presupuesto!"}
              </div>
            )}

            {filteredQuotes && filteredQuotes.length > 0 && (
              <div className="border-t">
                <TablePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredQuotes?.length ?? 0}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(n) => {
                    setItemsPerPage(n);
                    setCurrentPage(1);
                  }}
                  pageSizeOptions={[10, 15, 25]}
                />
              </div>
            )}
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

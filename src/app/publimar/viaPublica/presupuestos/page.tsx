'use client';

import { useState } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, where, doc, updateDoc, serverTimestamp, getDoc, addDoc, getDocs } from "firebase/firestore";
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
import { EClientSection } from "@/types/client";
import { Eye, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EBillingStatus } from "@/types/billing";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatearPrecio } from "@/lib/utils";

export default function PresupuestosViaPublicaPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [downloading, setDownloading] = useState<string | null>(null);
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

  // Descarga de PDF para presupuestos de Vía Pública
  const handleDownloadPDF = async (quote: TQuote) => {
    try {
      setDownloading(quote.id);

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margins = { top: 10, right: 10, bottom: 20, left: 10 };

      // Cargar y agregar la imagen del header
      const headerImg = new Image();
      headerImg.src = "/imagenes/encabezadoVP-pr.png";

      await new Promise((resolve, reject) => {
        headerImg.onload = resolve;
        headerImg.onerror = reject;
      });

      const imgAspectRatio = headerImg.width / headerImg.height;
      const imgWidth = pageWidth;
      const imgHeight = imgWidth / imgAspectRatio;

      pdf.addImage(headerImg, "PNG", 0, 0, imgWidth, imgHeight);

      let yPosition = margins.top + imgHeight + 10;

      // Columna izquierda - Info del cliente
      const leftColumnX = margins.left;
      const rightAlignX = pageWidth - margins.right;

      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("Información del Cliente", leftColumnX, yPosition);

      yPosition += 7;
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");

      const clientInfo = [
        { label: "Cliente:", value: quote.client?.name || "-" },
        quote.client?.email ? { label: "Email:", value: quote.client.email } : null,
        quote.client?.phone ? { label: "Teléfono:", value: quote.client.phone } : null,
        quote.client?.address ? { label: "Dirección:", value: quote.client.address } : null,
        quote.client?.cuit ? { label: "CUIT/CUIL:", value: formatCuit(quote.client.cuit) } : null,
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

      const quoteAny = quote as any;
      let finalY = yPosition;
      const allItems = quote.items || [];

      // Group items: by periodoGroupId, or by matching fechaSalida+dias, or individual
      type ItemGroup = { fechaSalida: string; dias: number | null; items: any[] };
      const groups: ItemGroup[] = [];
      const individualItems: any[] = [];
      const processedGroupIds = new Set<string>();

      allItems.forEach((item: any) => {
        if (item.periodoGroupId) {
          if (processedGroupIds.has(item.periodoGroupId)) return;
          processedGroupIds.add(item.periodoGroupId);
          const groupItems = allItems.filter((i: any) => i.periodoGroupId === item.periodoGroupId);
          groups.push({
            fechaSalida: formatDate(item.fechaSalida),
            dias: item.dias || null,
            items: groupItems,
          });
        } else {
          individualItems.push(item);
        }
      });

      // Also group individual items with the same fechaSalida+dias
      const individualGroupMap = new Map<string, any[]>();
      const trueIndividuals: any[] = [];
      individualItems.forEach((item: any) => {
        const fechaStr = formatDate(item.fechaSalida);
        const key = `${fechaStr}|${item.dias || ""}`;
        if (fechaStr !== "-" && item.dias) {
          if (!individualGroupMap.has(key)) individualGroupMap.set(key, []);
          individualGroupMap.get(key)!.push(item);
        } else {
          trueIndividuals.push(item);
        }
      });

      // Merge individual items with same date into groups
      individualGroupMap.forEach((items, key) => {
        if (items.length > 1) {
          const [fechaSalida, dias] = key.split("|");
          groups.push({ fechaSalida, dias: dias ? Number(dias) : null, items });
        } else {
          trueIndividuals.push(items[0]);
        }
      });

      // Render grouped items (one table per group with date header)
      const tableStyles = {
        styles: { fontSize: 9, cellPadding: 4, lineWidth: 0, lineColor: [220, 220, 220] } as any,
        headStyles: { fillColor: [255, 255, 255], textColor: [80, 80, 80], fontStyle: "bold", halign: "left", lineWidth: { bottom: 0.3 }, lineColor: [200, 200, 200] } as any,
        bodyStyles: { lineWidth: { bottom: 0.15 }, lineColor: [230, 230, 230] } as any,
        alternateRowStyles: { fillColor: false as any },
      };

      const renderGroupTable = (group: ItemGroup) => {
        if (finalY > pageHeight - 80) {
          pdf.addPage();
          finalY = margins.top + 10;
        }

        // Group header with date range
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        const fechaInicioStr = group.fechaSalida;
        let label = "";
        if (fechaInicioStr !== "-" && group.dias) {
          // Calculate end date from first item
          const firstItem = group.items[0];
          const fechaFinStr = firstItem.fechaSalida ? (() => {
            const d = firstItem.fechaSalida.toDate ? firstItem.fechaSalida.toDate() : new Date(firstItem.fechaSalida.seconds ? firstItem.fechaSalida.seconds * 1000 : firstItem.fechaSalida);
            const end = new Date(d);
            end.setDate(end.getDate() + (group.dias! - 1));
            return end.toLocaleDateString('es-AR');
          })() : "-";
          label = `${fechaInicioStr} a ${fechaFinStr} — ${group.dias} días`;
        } else if (group.dias) {
          label = `${group.dias} días`;
        } else if (fechaInicioStr !== "-") {
          label = fechaInicioStr;
        }
        if (label) {
          pdf.text(label, margins.left, finalY);
          finalY += 2;
        }

        const tableHeaders = ["Dispositivo", "Cant.", "Precio", "Subtotal"];
        const productNames = group.items.map((i: any) => i.productName || "");
        const tableData = group.items.map((item: any) => [
          item.productName || "",
          (item.quantity || 0).toString(),
          formatearPrecio(item.unitPrice || 0),
          formatearPrecio((item.quantity || 0) * (item.unitPrice || 0)),
        ]);

        autoTable(pdf, {
          head: [tableHeaders],
          body: tableData,
          startY: finalY,
          margin: margins,
          ...tableStyles,
          columnStyles: {
            0: { cellWidth: 105 },
            1: { halign: "center", cellWidth: 20 },
            2: { halign: "right", cellWidth: 30 },
            3: { halign: "right", cellWidth: 35 },
          },
          tableWidth: "auto",
          didParseCell: (data) => {
            if (data.section === "head") {
              if (data.column.index === 1) data.cell.styles.halign = "center";
              else if (data.column.index >= 2) data.cell.styles.halign = "right";
            }
          },
          rowPageBreak: "avoid",
          didDrawCell: (data) => {
            if (data.section === "body" && data.column.index === 0) {
              const productName = productNames[data.row.index];
              if (!productName) return;
              const cell = data.cell;
              const x = cell.x + cell.padding("left");
              const y = cell.y + cell.padding("top") + 2.5;
              const textWidth = pdf.getTextWidth(productName);
              pdf.setFillColor(255, 255, 255);
              pdf.rect(x, y - 2.5, textWidth + 1, 3.5, "F");
              pdf.setFont("helvetica", "bold");
              pdf.setFontSize(9);
              pdf.setTextColor(0, 0, 0);
              pdf.text(productName, x, y);
              pdf.setFont("helvetica", "normal");
            }
          },
        });

        finalY = (pdf as any).lastAutoTable.finalY + 10;
      };

      // Render groups
      groups.forEach((group) => renderGroupTable(group));

      // Render individual items (with their own date columns)
      if (trueIndividuals.length > 0) {
        if (finalY > pageHeight - 80) {
          pdf.addPage();
          finalY = margins.top + 10;
        }

        const tableHeaders = ["Dispositivo", "Cant.", "Salida", "Días", "Precio", "Subtotal"];
        const productNames = trueIndividuals.map((i: any) => i.productName || "");
        const tableData = trueIndividuals.map((item: any) => [
          item.productName || "",
          (item.quantity || 0).toString(),
          formatDate(item.fechaSalida),
          item.dias ? item.dias.toString() : "-",
          formatearPrecio(item.unitPrice || 0),
          formatearPrecio((item.quantity || 0) * (item.unitPrice || 0)),
        ]);

        autoTable(pdf, {
          head: [tableHeaders],
          body: tableData,
          startY: finalY,
          margin: margins,
          ...tableStyles,
          columnStyles: {
            0: { cellWidth: 65 },
            1: { halign: "center", cellWidth: 18 },
            2: { cellWidth: 30 },
            3: { halign: "center", cellWidth: 18 },
            4: { halign: "right", cellWidth: 30 },
            5: { halign: "right", cellWidth: 30 },
          },
          tableWidth: "auto",
          didParseCell: (data) => {
            if (data.section === "head") {
              if (data.column.index === 1 || data.column.index === 3) data.cell.styles.halign = "center";
              else if (data.column.index >= 4) data.cell.styles.halign = "right";
            }
          },
          rowPageBreak: "avoid",
          didDrawCell: (data) => {
            if (data.section === "body" && data.column.index === 0) {
              const productName = productNames[data.row.index];
              if (!productName) return;
              const cell = data.cell;
              const x = cell.x + cell.padding("left");
              const y = cell.y + cell.padding("top") + 2.5;
              const textWidth = pdf.getTextWidth(productName);
              pdf.setFillColor(255, 255, 255);
              pdf.rect(x, y - 2.5, textWidth + 1, 3.5, "F");
              pdf.setFont("helvetica", "bold");
              pdf.setFontSize(9);
              pdf.setTextColor(0, 0, 0);
              pdf.text(productName, x, y);
              pdf.setFont("helvetica", "normal");
            }
          },
        });

        finalY = (pdf as any).lastAutoTable.finalY + 10;
      }

      // Fallback: if no items were rendered (shouldn't happen but just in case)
      if (groups.length === 0 && trueIndividuals.length === 0 && allItems.length > 0) {
        const tableHeaders = ["Dispositivo", "Cant.", "Precio", "Subtotal"];
        const tableData = allItems.map((item: any) => [
          item.productName || "",
          (item.quantity || 0).toString(),
          formatearPrecio(item.unitPrice || 0),
          formatearPrecio((item.quantity || 0) * (item.unitPrice || 0)),
        ]);

        autoTable(pdf, {
          head: [tableHeaders],
          body: tableData,
          startY: yPosition,
          margin: margins,
          ...tableStyles,
          columnStyles: {
            0: { cellWidth: 105 },
            1: { halign: "center", cellWidth: 20 },
            2: { halign: "right", cellWidth: 30 },
            3: { halign: "right", cellWidth: 35 },
          },
          tableWidth: "auto",
        });

        finalY = (pdf as any).lastAutoTable.finalY + 10;
      }

      const totalsX = pageWidth - margins.right - 60;

      // Impresiones (si aplica)
      if (quoteAny.conImpresiones && quoteAny.impresiones) {
        if (finalY > pageHeight - 60) {
          pdf.addPage();
          finalY = margins.top + 10;
        }

        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.text("Impresiones / Afiches", margins.left, finalY);
        finalY += 7;

        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");

        if (quoteAny.impresiones.venta) {
          pdf.text("Impresiones:", margins.left, finalY);
          pdf.text(formatearPrecio(quoteAny.impresiones.venta), margins.left + 40, finalY);
          finalY += 5;
        }
        if (quoteAny.impresiones.flete) {
          pdf.text("Flete:", margins.left, finalY);
          pdf.text(formatearPrecio(quoteAny.impresiones.flete), margins.left + 40, finalY);
          finalY += 5;
        }

        finalY += 5;
      }

      // Formas de pago (si existen)
      if (quoteAny.formasPago && quoteAny.formasPago.length > 0) {
        if (finalY > pageHeight - 60) {
          pdf.addPage();
          finalY = margins.top + 10;
        }

        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.text("Formas de Pago", margins.left, finalY);
        finalY += 2;

        const payHeaders = ["Tipo", "Monto", "Cuenta", "Factura"];
        const payData = quoteAny.formasPago.map((fp: any) => [
          fp.tipo || "-",
          formatearPrecio(fp.monto || 0),
          fp.cuenta || "-",
          fp.factura ? (fp.tipoFactura ? `Sí (${fp.tipoFactura})` : "Sí") : "No",
        ]);

        autoTable(pdf, {
          head: [payHeaders],
          body: payData,
          startY: finalY,
          margin: margins,
          styles: { fontSize: 9, cellPadding: 3, lineWidth: 0, lineColor: [220, 220, 220] },
          headStyles: { fillColor: [255, 255, 255], textColor: [80, 80, 80], fontStyle: "bold", lineWidth: { bottom: 0.3 }, lineColor: [200, 200, 200] },
          bodyStyles: { lineWidth: { bottom: 0.15 }, lineColor: [230, 230, 230] },
          alternateRowStyles: { fillColor: false as any },
          columnStyles: {
            0: { cellWidth: 55, halign: "left" },
            1: { cellWidth: 45, halign: "right" },
            2: { cellWidth: 50, halign: "left" },
            3: { cellWidth: 40, halign: "center" },
          },
          tableWidth: "auto",
        });

        finalY = (pdf as any).lastAutoTable.finalY + 10;
      }

      // Totales
      if (finalY > pageHeight - 40) {
        pdf.addPage();
        finalY = margins.top + 10;
      }

      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");

      const subtotalDispositivos = quoteAny.subtotalDispositivos || quote.subtotal || 0;
      pdf.text("Subtotal Dispositivos:", totalsX, finalY, { align: "left" });
      pdf.text(formatearPrecio(subtotalDispositivos), rightAlignX, finalY, { align: "right" });

      if (quoteAny.conImpresiones && quoteAny.ventaImpresiones) {
        finalY += 6;
        pdf.text("Impresiones:", totalsX, finalY, { align: "left" });
        pdf.text(formatearPrecio(quoteAny.ventaImpresiones), rightAlignX, finalY, { align: "right" });
      }

      finalY += 6;
      pdf.setFont("helvetica", "bold");
      pdf.line(totalsX, finalY - 2, rightAlignX, finalY - 2);
      const totalAmount = quoteAny.totalVenta || quote.total || 0;
      pdf.text("Total:", totalsX, finalY + 3, { align: "left" });
      pdf.text(formatearPrecio(totalAmount), rightAlignX, finalY + 3, { align: "right" });

      // Notas
      if (quote.notes) {
        finalY += 15;
        if (finalY > pageHeight - 30) {
          pdf.addPage();
          finalY = margins.top + 10;
        }
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.text("Notas:", margins.left, finalY);
        finalY += 5;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        const splitNotes = pdf.splitTextToSize(quote.notes, pageWidth - margins.left - margins.right);
        pdf.text(splitNotes, margins.left, finalY);
      }

      pdf.save(`Pr-${quote.client?.name || quote.number}.pdf`);
    } catch (error) {
      console.error("Error al generar el PDF:", error);
      toast.error("Error al generar el PDF");
    } finally {
      setDownloading(null);
    }
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
                              disabled={downloading === quote.id}
                              className="bg-green-600 hover:bg-green-700 hover:text-white text-white h-8 w-8"
                            >
                              {downloading === quote.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
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

'use client';

import { useState } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy } from "firebase/firestore";
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
import collections from "@/lib/collections";
import { EQuoteStatus, TQuote } from "@/types/quote";
import { Edit, Eye, Download } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { DocumentData } from "firebase/firestore";
import { formatearPrecio } from "@/lib/utils";
import QuoteDetailsModal from "./modalPresupuestos/quoteDetailsModal";

export default function PresupuestosPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<EQuoteStatus | "all">("all");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const firestore = useFirestore();

  // Función para manejar la vista de presupuesto en modal
  const handleViewQuote = (quoteId: string) => {
    setSelectedQuoteId(quoteId);
    setShowModal(true);
  };

  // Función para cerrar el modal y limpiar el estado
  const handleCloseModal = () => {
    setShowModal(false);
    // Delay para permitir que la animación de cierre termine antes de limpiar el ID
    setTimeout(() => {
      setSelectedQuoteId(null);
    }, 150);
  };

  // Consulta a Firestore
  const quotesCollection = collection(firestore, collections.QUOTES);
  const quotesQuery = query(quotesCollection, orderBy("createdAt", "desc"));

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

      // Crear un iframe para aislar los estilos
      const iframe = document.createElement("iframe");
      iframe.style.position = "absolute";
      iframe.style.left = "-9999px";
      iframe.style.top = "-9999px";
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) throw new Error("No se pudo crear el documento");

      // Agregar estilos base
      doc.head.innerHTML = `
        <style>
          body {
            width: 210mm;
            min-height: 297mm;
            padding: 20mm;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
            background: white;
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: white;
            color: #333;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #f5f5f5;
          }
          .header {
            text-align: center;
            width: 100%;
          }
          .section {
            margin-bottom: 20px;
          }
          .total-section {
            margin-left: auto;
            width: 250px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
          }
          .total-row.final {
            border-top: 1px solid #ddd;
            font-weight: bold;
          }
          .header-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 20px;
          }
          .header-info {
            font-size: 12px;
          }
          .header-num {
            text-align: right;
            font-size: 14px;
          }
        </style>
      `;

      // Agregar el contenido
      const hasDiscounts = quote.items.some(item => item.discount && item.discount > 0);

      doc.body.innerHTML = `
        <div class="header">
          <img src="/imagenes/encabezado-pr.jpg" alt="Logo" style="width: 100%; max-width: 100%; height: auto; margin-bottom: 20px;" />
        </div>
        <div style=" justify-content: space-between; margin-left: 23px; margin-right:23px">
        <div class="header-row">
          <div class="header-info">
            <h2 style="margin-bottom: 10px; font-size: 16px;">Información del Cliente</h2>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; font-size: 12px;">
              <strong>Cliente:</strong> <span>${quote.client.name}</span>
              ${quote.client.email ? `<strong>Email:</strong> <span>${quote.client.email}</span>` : ""}
              ${quote.client.phone ? `<strong>Tel:</strong> <span>${quote.client.phone}</span>` : ""}
              ${quote.client.address ? `<strong>Dir:</strong> <span>${quote.client.address}</span>` : ""}
              ${quote.client.cuit ? `<strong>CUIT:</strong> <span>${quote.client.cuit}</span>` : ""}
            </div>
          </div>
          <div class="header-num">
            <h1 style="margin: 0; font-size: 24px; color: #000;">PRESUPUESTO</h1>
            <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: bold;">#${quote.number}</p>
            <div style="font-size: 12px; margin-top: 8px;">
              <div><strong>Fecha:</strong> ${formatDate(quote.createdAt)}</div>
              <div><strong>Válido hasta:</strong> ${formatDate(quote.validUntil)}</div>
            </div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th style="text-align: right;">Precio</th>
              <th style="text-align: center;">Cant.</th>
              ${hasDiscounts ? '<th style="text-align: center;">Desc.</th>' : ''}
              <th style="text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${quote.items
              .map(
                (item) => `
              <tr>
                <td>
                  <strong>${item.product.name}</strong>
                  ${
                    item.variant
                      ? `<br><small>Medida: ${item.variant.size}</small>`
                      : ""
                  }
                  ${item.product.description ? `<br><small>${item.product.description}</small>` : ""}
                </td>
                <td style="text-align: right;">${formatearPrecio(
                  item.unitPrice
                )}</td>
                <td style="text-align: center;">${item.quantity}</td>
                ${hasDiscounts ? `<td style="text-align: center;">${
                  item.discount ? `${item.discount}%` : "-"
                }</td>` : ''}
                <td style="text-align: right;">${formatearPrecio(
                  item.subtotal
                )}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
        <div class="total-section">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>${formatearPrecio(quote.subtotal)}</span>
          </div>
          <div class="total-row">
            <span>IVA (${quote.taxRate}%):</span>
            <span>${formatearPrecio(quote.tax)}</span>
          </div>
          <div class="total-row final">
            <span>Total:</span>
            <span>${formatearPrecio(quote.total)}</span>
          </div>
        </div>
        </div>
      `;

      // Esperar a que el iframe se cargue
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Convertir el contenido a canvas
      const canvas = await html2canvas(doc.body, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      // Crear el PDF
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        imgWidth,
        imgHeight
      );

      // Descargar el PDF
      pdf.save(`presupuesto-${quote.number}.pdf`);

      // Limpiar
      document.body.removeChild(iframe);
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
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as EQuoteStatus | "all")
                }
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
            <div className="overflow-x-auto px-6">
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
                  {filteredQuotes && filteredQuotes.length > 0 ? (
                    filteredQuotes.map((quote) => {
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
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                quote.status === EQuoteStatus.DRAFT
                                  ? "bg-slate-100 text-slate-800"
                                  : quote.status === EQuoteStatus.SENT
                                  ? "bg-blue-100 text-blue-800"
                                  : quote.status === EQuoteStatus.CONFIRMED
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {quote.status === EQuoteStatus.DRAFT
                                ? "Borrador"
                                : quote.status === EQuoteStatus.SENT
                                ? "Enviado"
                                : quote.status === EQuoteStatus.CONFIRMED
                                ? "Confirmado"
                                : "Rechazado"}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Ver presupuesto"
                                className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                                onClick={() => handleViewQuote(quote.id)}
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

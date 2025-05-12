"use client";

import { useState } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, where } from "firebase/firestore";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import collections from "~/lib/collections";
import { EQuoteStatus, TQuote } from "~/types/quote";
import { Edit, Eye, Download } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "react-hot-toast";
import { DocumentData } from "firebase/firestore";
import { formatearPrecio } from "~/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";

export default function PresupuestosPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<EQuoteStatus | "all">("all");
  const [downloading, setDownloading] = useState<string | null>(null);
  const firestore = useFirestore();
  const [quotes, setQuotes] = useState<(TQuote & { id: string })[]>([]);

  // Consulta a Firestore
  const quotesCollection = collection(firestore, collections.QUOTES);
  const quotesQuery = query(quotesCollection, orderBy("createdAt", "desc"));

  const { status, data: quotesData } = useFirestoreCollectionData(quotesQuery, {
    idField: "id",
  });

  // Filtrar presupuestos según la búsqueda y estado
  const filteredQuotes = quotesData?.filter((quote: DocumentData) => {
    const matchesSearch =
      quote.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.client.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || quote.status === statusFilter;

    return matchesSearch && matchesStatus;
  }).map((quote: DocumentData) => ({
    ...quote,
    createdAt: quote.createdAt?.toDate?.() || new Date(quote.createdAt),
    updatedAt: quote.updatedAt?.toDate?.() || new Date(quote.updatedAt),
    validUntil: quote.validUntil?.toDate?.() || new Date(quote.validUntil),
    sentAt: quote.sentAt?.toDate?.() || undefined,
    confirmedAt: quote.confirmedAt?.toDate?.() || undefined,
    rejectedAt: quote.rejectedAt?.toDate?.() || undefined,
    comments: quote.comments?.map((comment: any) => ({
      ...comment,
      createdAt: comment.createdAt?.toDate?.() || new Date(comment.createdAt)
    })) || []
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
  

  // console.log(formatDate(quotesData?.[0]?.validUntil))

  const handleDownload = async (quote: TQuote) => {
    try {
      setDownloading(quote.id);
      
      // Crear un iframe para aislar los estilos
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.left = '-9999px';
      iframe.style.top = '-9999px';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) throw new Error('No se pudo crear el documento');

      // Agregar estilos base
      doc.head.innerHTML = `
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: white;
            color: #333;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
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
            margin-bottom: 20px;
          }
          .section {
            margin-bottom: 20px;
          }
          .total-section {
            margin-left: auto;
            width: 300px;
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
        </style>
      `;

      // Agregar el contenido
      doc.body.innerHTML = `
        <div class="header">
          <h1>PRESUPUESTO</h1>
          <p>#${quote.number}</p>
        </div>
        
        <div class="section">
          <h2>Información del Cliente</h2>
          <p><strong>${quote.client.name}</strong></p>
          ${quote.client.email ? `<p>Email: ${quote.client.email}</p>` : ''}
          ${quote.client.phone ? `<p>Teléfono: ${quote.client.phone}</p>` : ''}
          ${quote.client.address ? `<p>Dirección: ${quote.client.address}</p>` : ''}
          ${quote.client.cuit ? `<p>CUIT/CUIL: ${quote.client.cuit}</p>` : ''}
        </div>
        
        <div class="section">
          <h2>Detalles del Presupuesto</h2>
          <p>Fecha: ${formatDate(quote.createdAt)}</p>
          <p>Válido hasta: ${formatDate(quote.validUntil)}</p>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th style="text-align: right;">Precio</th>
              <th style="text-align: center;">Cant.</th>
              <th style="text-align: center;">Desc.</th>
              <th style="text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${quote.items.map(item => `
              <tr>
                <td>
                  <strong>${item.product.name}</strong>
                  ${item.variant ? `<br><small>Medida: ${item.variant.size}</small>` : ''}
                  ${item.notes ? `<br><small>Nota: ${item.notes}</small>` : ''}
                </td>
                <td style="text-align: right;">$${item.unitPrice.toFixed(2)}</td>
                <td style="text-align: center;">${item.quantity}</td>
                <td style="text-align: center;">${item.discount ? `${item.discount}%` : '-'}</td>
                <td style="text-align: right;">$${item.subtotal.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="total-section">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>$${quote.subtotal.toFixed(2)}</span>
          </div>
          <div class="total-row">
            <span>IVA (${quote.taxRate}%):</span>
            <span>$${quote.taxAmount.toFixed(2)}</span>
          </div>
          <div class="total-row final">
            <span>Total:</span>
            <span>$${quote.total.toFixed(2)}</span>
          </div>
        </div>
      `;

      // Esperar a que el iframe se cargue
      await new Promise(resolve => setTimeout(resolve, 100));

      // Convertir el contenido a canvas
      const canvas = await html2canvas(doc.body, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      // Crear el PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, imgHeight);
      
      // Descargar el PDF
      pdf.save(`presupuesto-${quote.number}.pdf`);
      
      // Limpiar
      document.body.removeChild(iframe);
    } catch (error) {
      console.error('Error al generar el PDF:', error);
      toast.error('Error al generar el PDF');
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
                onValueChange={(value) => setStatusFilter(value as EQuoteStatus | "all")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filtrar por estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value={EQuoteStatus.DRAFT}>Borrador</SelectItem>
                  <SelectItem value={EQuoteStatus.SENT}>Enviado</SelectItem>
                  <SelectItem value={EQuoteStatus.CONFIRMED}>Confirmado</SelectItem>
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
                              <Link
                                href={`/publimar/banderas/presupuestos/${quote.number}`}
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Ver"
                                  className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>

                              <Link
                                href={`/publimar/banderas/presupuestos/${quote.id}/editar`}
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Editar"
                                  className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </Link>

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
    </div>
  );
}

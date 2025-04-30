"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFirestore, useFirestoreDoc, useSigninCheck, useFirestoreCollectionData } from "reactfire";
import { doc, updateDoc, collection, query, where } from "firebase/firestore";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { toast } from "sonner";
import { Share2, Printer, ArrowLeft, Check } from "lucide-react";
import collections from "~/lib/collections";
import { EQuoteStatus, TQuote } from "~/types/quote";

export default function PresupuestoPage({
  params,
}: {
  params: { id: string };
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDownload = searchParams.get("download") === "true";
  const firestore = useFirestore();
  const { status: authStatus, data: signInCheckResult } = useSigninCheck();

  // Verificar autenticación
  if (authStatus === "loading") {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!signInCheckResult.signedIn) {
    router.push("/login");
    return null;
  }

  // Obtener el presupuesto
  const { status, data } = useFirestoreCollectionData(
    query(
      collection(firestore, collections.QUOTES),
      where("number", "==", params.id)
    ),
    { idField: "id" }
  );

  // Convertir el data a TQuote
  const quote = data && data.length > 0 ? (data[0] as TQuote) : null;

  console.log("Número del presupuesto:", params.id);
  console.log("Status de la consulta:", status);
  console.log("Datos obtenidos:", data);
  console.log("Presupuesto procesado:", quote);

  // Formatear fecha
  const formatDate = (date: any) => {
    if (!date) return "-";
    try {
      // Si es un timestamp de Firestore
      if (typeof date === 'object' && 'seconds' in date) {
        return new Date(date.seconds * 1000).toLocaleDateString("es-AR");
      }
      // Si es una fecha normal
      return new Date(date).toLocaleDateString("es-AR");
    } catch (error) {
      console.error("Error al formatear fecha:", error);
      return "-";
    }
  };

  // Manejar compartir enlace
  const handleShareLink = () => {
    if (!quote) return;

    navigator.clipboard.writeText(quote.publicUrl);
    toast.success("Enlace copiado al portapapeles");
  };

  // Manejar impresión
  const handlePrint = () => {
    window.print();
  };

  // Cambiar estado del presupuesto
  const handleStatusChange = async (newStatus: EQuoteStatus) => {
    if (!quote) return;

    setLoading(true);
    try {
      const updateData: Partial<TQuote> = {
        status: newStatus,
        updatedAt: new Date(),
      };

      // Actualizar campos específicos según el estado
      if (newStatus === EQuoteStatus.SENT) {
        updateData.sentAt = new Date();
      } else if (newStatus === EQuoteStatus.CONFIRMED) {
        updateData.confirmedAt = new Date();
      } else if (newStatus === EQuoteStatus.REJECTED) {
        updateData.rejectedAt = new Date();
      }

      await updateDoc(doc(firestore, collections.QUOTES, quote.id), updateData);
      toast.success(`Estado actualizado a ${newStatus}`);
    } catch (error) {
      console.error("Error al actualizar estado:", error);
      toast.error("Error al actualizar el estado");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!quote || !quote.client) {
    return (
      <div className="text-center my-12">
        <h2 className="text-xl font-semibold mb-4">
          No se encontró el presupuesto o datos incompletos
        </h2>
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/banderas/presupuestos")}
        >
          Volver a presupuestos
        </Button>
      </div>
    );
  }

  // Calcular montos
  const subtotal = quote.subtotal || 0;
  const taxAmount = quote.taxAmount || 0;
  const total = quote.total || 0;

  return (
    <div className={`${isDownload ? "print:bg-white print:p-0 print:max-w-full" : ""}`}>
      <div className={`flex justify-between items-center mb-6 ${isDownload ? "print:hidden" : ""}`}>
        <div className="flex items-center">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/banderas/presupuestos")}
            className="mr-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Volver
          </Button>
          <h1 className="text-2xl font-bold">Presupuesto #{quote.number}</h1>
        </div>
        <div className="flex gap-2">
          {!isDownload && (
            <>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" /> Imprimir
              </Button>
              <Button variant="outline" onClick={handleShareLink}>
                <Share2 className="h-4 w-4 mr-2" /> Compartir
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  router.push(`/dashboard/banderas/presupuestos/${params.id}/editar`)
                }
              >
                Editar
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="print:mt-10 print:text-black">
        <div className="text-center mb-8 hidden print:block">
          <h1 className="text-2xl font-bold mb-1">PRESUPUESTO</h1>
          <p className="text-lg">#{quote.number}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Información del Cliente</CardTitle>
            </CardHeader>
            <CardContent>
              <h3 className="font-medium text-lg">{quote.client.name}</h3>
              {quote.client.email && (
                <p className="text-slate-600">Email: {quote.client.email}</p>
              )}
              {quote.client.phone && (
                <p className="text-slate-600">Teléfono: {quote.client.phone}</p>
              )}
              {quote.client.address && (
                <p className="text-slate-600">
                  Dirección: {quote.client.address}
                </p>
              )}
              {quote.client.cuit && (
                <p className="text-slate-600">
                  CUIT/CUIL: {quote.client.cuit}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detalles del Presupuesto</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Fecha:</span>
                  <span>{formatDate(quote.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Válido hasta:</span>
                  <span>{formatDate(quote.validUntil)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Estado:</span>
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
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Cant.</TableHead>
                  <TableHead>Desc.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.product.name}</p>
                        {item.variant && (
                          <p className="text-sm text-slate-500">
                            Medida: {item.variant.size}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-xs text-slate-500 mt-1">
                            Nota: {item.notes}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>${item.unitPrice.toFixed(2)}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>
                      {item.discount && item.discount > 0
                        ? `${item.discount}%`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${item.subtotal.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {quote.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notas</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{quote.notes}</p>
              </CardContent>
            </Card>
          )}

          <Card className="md:ml-auto md:w-96">
            <CardContent className="p-6">
              <div className="space-y-3 divide-y">
                <div className="flex justify-between py-2">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-600">
                    IVA ({quote.taxRate}%):
                  </span>
                  <span className="font-medium">${taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-3">
                  <span className="text-lg font-semibold">Total:</span>
                  <span className="text-lg font-bold">${total.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Acciones de acuerdo al estado actual - solo visible en panel administrativo */}
        <Card className="print:hidden ">
          <CardHeader>
            <CardTitle>Acciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 ">
              {quote.status === EQuoteStatus.DRAFT && (
                <Button
                  onClick={() => handleStatusChange(EQuoteStatus.SENT)}
                  disabled={loading}
                  className="text-center bg-blue-600 hover:bg-blue-700 "
                >
                  Marcar como enviado
                </Button>
              )}

              {quote.status === EQuoteStatus.SENT && (
                <>
                  <Button
                    onClick={() => handleStatusChange(EQuoteStatus.CONFIRMED)}
                    disabled={loading}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Check className="h-4 w-4 mr-2" /> Marcar como confirmado
                  </Button>
                  <Button
                    onClick={() => handleStatusChange(EQuoteStatus.REJECTED)}
                    disabled={loading}
                    variant="destructive"
                  >
                    Marcar como rechazado
                  </Button>
                </>
              )}

              {quote.status === EQuoteStatus.CONFIRMED && (
                <Button
                  onClick={() =>
                    router.push(`/dashboard/pedidos/nuevo?quoteId=${params.id}`)
                  }
                  disabled={loading}
                >
                  Crear Pedido
                </Button>
              )}

              {/* Siempre permitir volver a borrador para editar */}
              {quote.status !== EQuoteStatus.DRAFT && (
                <Button
                  onClick={() => handleStatusChange(EQuoteStatus.DRAFT)}
                  disabled={loading}
                  variant="outline"
                >
                  Volver a borrador
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {isDownload && (
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.onload = function() {
                window.print();
                setTimeout(function() {
                  window.close();
                }, 1000);
              }
            `,
          }}
        />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { doc, updateDoc, collection, query, where } from "firebase/firestore";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";
import { toast } from "sonner";
import { Printer, Check, X } from "lucide-react";
import collections from "~/lib/collections";
import { EQuoteStatus, TQuote } from "~/types/quote";

export default function PublicQuotePage({
  params,
}: {
  params: { id: string };
}) {
  const [loading, setLoading] = useState(false);
  const [clientComment, setClientComment] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<
    "CONFIRM" | "REJECT" | null
  >(null);
  const [success, setSuccess] = useState(false);

  const firestore = useFirestore();

  // Buscar presupuesto por ID
  const { status, data } = useFirestoreCollectionData(
    query(
      collection(firestore, collections.QUOTES),
      where("number", "==", params.id)
    ),
    { idField: "id" }
  );

  const quote = data && data.length > 0 ? (data[0] as TQuote) : null;

  // Formatear fecha con manejo de undefined
  const formatDate = (date: Date | undefined) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("es-AR");
  };

  // Manejar impresión
  const handlePrint = () => {
    window.print();
  };

  // Preparar la confirmación o rechazo
  const prepareAction = (action: "CONFIRM" | "REJECT") => {
    setConfirmationAction(action);
    setShowConfirmation(true);
  };

  // Cancelar acción
  const cancelAction = () => {
    setConfirmationAction(null);
    setShowConfirmation(false);
  };

  // Confirmar o rechazar presupuesto
  const handleConfirmAction = async () => {
    if (!quote || !confirmationAction) return;

    setLoading(true);

    try {
      const quoteRef = doc(firestore, collections.QUOTES, quote.id);
      const updateData: Partial<TQuote> = {
        updatedAt: new Date(),
      };

      if (confirmationAction === "CONFIRM") {
        updateData.status = EQuoteStatus.CONFIRMED;
        updateData.confirmedAt = new Date();
      } else {
        updateData.status = EQuoteStatus.REJECTED;
        updateData.rejectedAt = new Date();
      }

      // Agregar comentario del cliente si existe
      if (clientComment.trim()) {
        updateData.comments = [
          ...(quote.comments || []),
          {
            id: Date.now().toString(),
            userId: "client",
            userName: quote.client.name,
            text: clientComment,
            createdAt: new Date(),
            isInternal: false,
          },
        ];
      }

      await updateDoc(quoteRef, updateData);
      setSuccess(true);
    } catch (error) {
      console.error("Error al actualizar presupuesto:", error);
      toast.error("Ha ocurrido un error. Por favor, inténtelo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-red-600">
              Presupuesto no encontrado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center mb-6">
              El presupuesto que está buscando no existe o ha sido eliminado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verificar que el cliente existe
  if (!quote.client) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-red-600">
              Datos incompletos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center mb-6">
              El presupuesto tiene datos incompletos o incorrectos.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Si la acción fue exitosa, mostrar pantalla de éxito
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-green-600">
              {confirmationAction === "CONFIRM"
                ? "¡Presupuesto Aceptado!"
                : "Presupuesto Rechazado"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center mb-6">
              {confirmationAction === "CONFIRM" ? (
                <Check size={48} className="text-green-500" />
              ) : (
                <X size={48} className="text-red-500" />
              )}
            </div>
            <p className="text-center mb-6">
              {confirmationAction === "CONFIRM"
                ? "Gracias por aceptar nuestro presupuesto. Nos pondremos en contacto con usted lo antes posible."
                : "Gracias por su respuesta. Lamentamos no haber podido satisfacer sus necesidades en esta ocasión."}
            </p>
            {clientComment && (
              <div className="bg-gray-50 p-4 rounded-md mb-6">
                <p className="text-sm text-gray-500 mb-2">Su comentario:</p>
                <p className="italic">{clientComment}</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir copia
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Mostrar pantalla de confirmación si se está por confirmar o rechazar
  if (showConfirmation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">
              {confirmationAction === "CONFIRM"
                ? "Confirmar aceptación"
                : "Confirmar rechazo"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4">
              {confirmationAction === "CONFIRM"
                ? "¿Está seguro de que desea aceptar este presupuesto? Esta acción no puede deshacerse."
                : "¿Está seguro de que desea rechazar este presupuesto? Esta acción no puede deshacerse."}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Comentario (opcional):
              </label>
              <Textarea
                value={clientComment}
                onChange={(e) => setClientComment(e.target.value)}
                placeholder="Agregue cualquier comentario o indicación adicional..."
                rows={4}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={cancelAction} disabled={loading}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={loading}
              variant={
                confirmationAction === "CONFIRM" ? "default" : "destructive"
              }
            >
              {loading
                ? "Procesando..."
                : confirmationAction === "CONFIRM"
                ? "Confirmar aceptación"
                : "Confirmar rechazo"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Calcular montos
  const subtotal = quote.subtotal;
  const taxAmount = quote.taxAmount;
  const total = quote.total;

  // Verificar si el presupuesto ya fue confirmado o rechazado
  const isFinalized =
    quote.status === EQuoteStatus.CONFIRMED ||
    quote.status === EQuoteStatus.REJECTED;

  return (
    <div className="flex flex-col min-h-screen bg-white print:p-0">
      {/* Header no imprimible */}
      <header className="bg-slate-900 text-white py-4 print:hidden">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center">
            <Image
              src="/logo.png"
              alt="Logo"
              width={40}
              height={40}
              className="mr-2"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
              }}
            />
            <h1 className="text-xl font-bold">Presupuesto {quote.number}</h1>
          </div>
          <Button
            variant="outline"
            onClick={handlePrint}
            className="text-white border-white hover:bg-slate-800"
          >
            <Printer className="h-4 w-4 mr-2" /> Imprimir
          </Button>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8 print:pt-0">
        <div className="print:mt-0 print:text-black">
          <div className="text-center mb-8">
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
                  <p className="text-slate-600">
                    Teléfono: {quote.client.phone}
                  </p>
                )}
                {quote.client.address && (
                  <p className="text-slate-600">
                    Dirección: {quote.client.address}
                  </p>
                )}
                {quote.client.taxId && (
                  <p className="text-slate-600">
                    CUIT/CUIL: {quote.client.taxId}
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
                              Variante: {item.variant.size}
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
                    <span className="text-lg font-bold">
                      ${total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Botones de acción - solo visibles si no está finalizado */}
          {!isFinalized && (
            <Card className="print:hidden">
              <CardHeader>
                <CardTitle>Acciones</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4">
                  Por favor, revise este presupuesto y confirme su aceptación o
                  rechazo.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Button
                    onClick={() => prepareAction("CONFIRM")}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Check className="h-4 w-4 mr-2" /> Aceptar Presupuesto
                  </Button>
                  <Button
                    onClick={() => prepareAction("REJECT")}
                    variant="destructive"
                  >
                    <X className="h-4 w-4 mr-2" /> Rechazar Presupuesto
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Información de estado para presupuestos ya finalizados */}
          {isFinalized && (
            <Card className="print:hidden">
              <CardHeader>
                <CardTitle>
                  {quote.status === EQuoteStatus.CONFIRMED
                    ? "Presupuesto Aceptado"
                    : "Presupuesto Rechazado"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center mb-4">
                  {quote.status === EQuoteStatus.CONFIRMED ? (
                    <Check size={24} className="text-green-500 mr-2" />
                  ) : (
                    <X size={24} className="text-red-500 mr-2" />
                  )}
                  <p>
                    {quote.status === EQuoteStatus.CONFIRMED
                      ? `Este presupuesto fue aceptado el ${formatDate(
                          quote.confirmedAt
                        )}.`
                      : `Este presupuesto fue rechazado el ${formatDate(
                          quote.rejectedAt
                        )}.`}
                  </p>
                </div>

                {/* Mostrar comentarios del cliente si hay */}
                {quote.comments &&
                  quote.comments.filter((c) => !c.isInternal).length > 0 && (
                    <div className="bg-gray-50 p-4 rounded-md">
                      <p className="text-sm text-gray-500 mb-2">Comentarios:</p>
                      {quote.comments
                        .filter((c) => !c.isInternal)
                        .map((comment) => (
                          <div key={comment.id} className="mb-2 last:mb-0">
                            <p className="italic">{comment.text}</p>
                            <p className="text-xs text-gray-500">
                              {formatDate(comment.createdAt)}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <footer className="bg-slate-100 py-4 mt-8 print:mt-12 print:pt-4 print:border-t">
        <div className="container mx-auto px-4 text-center text-slate-600 text-sm">
          <p>Si tiene alguna pregunta, comuníquese con nosotros:</p>
          <p>Email: info@empresa.com | Teléfono: (123) 456-7890</p>
        </div>
      </footer>
    </div>
  );
}

'use client';

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useFirestore,
  useFirestoreCollectionData,
  useFirestoreDocData,
} from "reactfire";
import { doc, collection, query, where, orderBy } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import collections from "@/lib/collections";
import { EClientType, TClient, TClientContact } from "@/types/client";
import { formatDate, formatearPrecio, extractIdFromSlug, generateSlug } from "@/lib/utils";
import { EOrderStatus } from "@/types/order";
import { EPaymentMethod } from "@/types/sale";
import { EyeIcon } from "lucide-react";
import { SaleDetailsModal } from "../../../banderas/ventas/modalVentas/saleDetailsModal";

export default function ClienteDetallePage({
  params,
}: {
  params: { id: string };
}) {
  const firestore = useFirestore();
  const router = useRouter();

  // Extraer el ID real del slug
  const clientId = extractIdFromSlug(params.id);

  const clientRef = doc(firestore, collections.CLIENTS, clientId);
  const { status, data: client } = useFirestoreDocData(clientRef, {
    idField: "id",
  });

  // Obtener presupuestos del cliente
  const { status: quotesStatus, data: quotes } = useFirestoreCollectionData(
    query(
      collection(firestore, collections.QUOTES),
      where("client.id" , "==", clientId ), 
    ),
    { idField: "id" }
  );

  // Obtener órdenes del cliente
  const { status: ordersStatus, data: orders } = useFirestoreCollectionData(
    query(
      collection(firestore, collections.ORDERS),
      where("clientId", "==", clientId)
    ),
    { idField: "id" }
  );

  // Obtener ventas del cliente
  const { status: salesStatus, data: sales } = useFirestoreCollectionData(
    query(
      collection(firestore, collections.SALES),
      where("clientId", "==", clientId),
    ),
    { idField: "id" }
  );

  const { status: salesStatus2, data: sales2 } = useFirestoreCollectionData(
    query(
      collection(firestore, collections.SALES),
      where("client", "==", clientId),
    ),
    { idField: "id" }
  )

  // Estados para el modal de ventas
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  // Función para abrir el modal de venta
  const handleViewSale = (saleId: string) => {
    setSelectedSaleId(saleId);
    setIsSaleModalOpen(true);
  };

  // Función para cerrar el modal
  const handleCloseSaleModal = () => {
    setIsSaleModalOpen(false);
    setSelectedSaleId(null);
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center my-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-slate-900">
          Cliente no encontrado
        </h2>
        <p className="mt-2 text-slate-600">
          El cliente que buscas no existe o ha sido eliminado.
        </p>
        <Button
          asChild
          className="mt-4"
        >
          <Link href="/publimar/viaPublica/clientes">Volver a clientes</Link>
        </Button>
      </div>
    );
  }

  const typedClient = client as TClient;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Detalle del Cliente: {typedClient.name}</h1>
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="presupuestos">Presupuestos</TabsTrigger>
          <TabsTrigger value="ordenes">Órdenes</TabsTrigger>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Información General</CardTitle>
              <Button
                asChild
                size="sm"
                className="bg-blue-900 hover:bg-blue-700 text-white"
              >
                <Link href={`/publimar/viaPublica/clientes/${params.id}/editar`}>Editar</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-slate-700">Nombre</h3>
                  <p className="text-slate-900">{typedClient.name}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-700">Tipo</h3>
                  <p className="text-slate-900">
                    {typedClient.type === EClientType.COMPANY
                      ? "Empresa"
                      : "Individual"}
                  </p>
                </div>
                {typedClient.type === EClientType.COMPANY &&
                  typedClient.businessName && (
                    <div>
                      <h3 className="font-semibold text-slate-700">
                        Razón Social
                      </h3>
                      <p className="text-slate-900">
                        {typedClient.businessName}
                      </p>
                    </div>
                  )}
                <div>
                  <h3 className="font-semibold text-slate-700">Email</h3>
                  <p className="text-slate-900">{typedClient.email || "-"}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-700">Teléfono</h3>
                  <p className="text-slate-900">{typedClient.phone || "-"}</p>
                </div>
                {typedClient.address && (
                  <div className="md:col-span-2">
                    <h3 className="font-semibold text-slate-700">Dirección</h3>
                    <p className="text-slate-900">{typedClient.address}</p>
                  </div>
                )}
                {typedClient.cuit && (
                  <div>
                    <h3 className="font-semibold text-slate-700">CUIT</h3>
                    <p className="text-slate-900">{typedClient.cuit}</p>
                  </div>
                )}
                {typedClient.notes && (
                  <div className="md:col-span-2">
                    <h3 className="font-semibold text-slate-700">Notas</h3>
                    <p className="text-slate-900">{typedClient.notes}</p>
                  </div>
                )}
                {typedClient.contacts && typedClient.contacts.length > 0 && (
                  <div className="md:col-span-2">
                    <h3 className="font-semibold text-slate-700 mb-2">
                      Personas de Contacto
                    </h3>
                    <div className="space-y-4">
                      {typedClient.contacts.map((contact: TClientContact, index: number) => (
                        <div
                          key={index}
                          className="border rounded-lg p-4 bg-slate-50"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h4 className="font-medium text-slate-900">
                                {contact.name}
                              </h4>
                              {contact.position && (
                                <p className="text-sm text-slate-600">
                                  {contact.position}
                                </p>
                              )}
                            </div>
                            <div className="space-y-1">
                              {contact.email && (
                                <p className="text-sm text-slate-600">
                                  <span className="font-medium">Email:</span>{" "}
                                  {contact.email}
                                </p>
                              )}
                              {contact.phone && (
                                <p className="text-sm text-slate-600">
                                  <span className="font-medium">Teléfono:</span>{" "}
                                  {contact.phone}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="presupuestos">
          <Card>
            <CardHeader>
              <CardTitle>Presupuestos</CardTitle>
            </CardHeader>
            <CardContent>
              {quotesStatus === "loading" ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-slate-900"></div>
                </div>
              ) : quotes && quotes.length > 0 ? (
                <div className="space-y-4">
                  {quotes.map((quote) => (
                    <div
                      key={quote.id}
                      className="border rounded-lg p-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium">
                            Presupuesto #{quote.number}
                          </h3>
                          <p className="text-sm text-slate-500">
                            Fecha: {formatDate(quote.createdAt)}
                          </p>
                          <p className="text-sm text-slate-500">
                            Válido hasta: {formatDate(quote.validUntil)}
                          </p>
                        </div>
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="bg-blue-900 hover:bg-blue-700 text-white"
                          title="Ver presupuesto"
                        >
                          <Link href={`/publimar/viaPublica/presupuestos/${generateSlug(quote.number, quote.id)}`}><EyeIcon className="h-4 w-4" /></Link>
                        </Button>
                      </div>
                      <div className="mt-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            quote.status === "draft"
                              ? "bg-slate-100 text-slate-800"
                              : quote.status === "sent"
                              ? "bg-blue-100 text-blue-800"
                              : quote.status === "confirmed"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {quote.status === "draft"
                            ? "Borrador"
                            : quote.status === "sent"
                            ? "Enviado"
                            : quote.status === "confirmed"
                            ? "Confirmado"
                            : "Rechazado"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-slate-500">
                  No hay presupuestos asociados a este cliente
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <Card>
            <CardHeader>
              <CardTitle>Órdenes de Trabajo</CardTitle>
            </CardHeader>
            <CardContent>
              {ordersStatus === "loading" ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-slate-900"></div>
                </div>
              ) : orders && orders.length > 0 ? (
                <div className="space-y-4">
                  {orders.map((order: any) => (
                    <div
                      key={order.id}
                      className="border rounded-lg p-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium">
                            Orden #{order.number}
                          </h3>
                          <p className="text-sm text-slate-500">
                            Fecha de creación: {formatDate(order.createdAt)}
                          </p>
                          {order.startDate && (
                            <p className="text-sm text-slate-500">
                              Fecha de inicio: {formatDate(order.startDate)}
                            </p>
                          )}
                          {order.deliveryDate && (
                            <p className="text-sm text-slate-500">
                              Fecha de entrega: {formatDate(order.deliveryDate)}
                            </p>
                          )}
                          <p className="text-sm font-semibold mt-2">
                            Total: {formatearPrecio(order.total || 0)}
                          </p>
                        </div>
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="bg-blue-900 hover:bg-blue-700 text-white"
                        >
                          <Link href={`/publimar/viaPublica/ordenes/${generateSlug(order.number, order.id)}`}><EyeIcon className="h-4 w-4" /></Link>
                        </Button>
                      </div>
                      <div className="mt-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            order.status === EOrderStatus.IN_PROCESS
                              ? "bg-blue-100 text-blue-800"
                              : order.status === EOrderStatus.COMPLETED
                              ? "bg-green-100 text-green-800"
                              : order.status === EOrderStatus.CANCELLED
                              ? "bg-purple-100 text-purple-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {order.status === EOrderStatus.IN_PROCESS
                            ? "En Proceso"
                            : order.status === EOrderStatus.COMPLETED
                            ? "Finalizado"
                            : order.status === EOrderStatus.COMPLETED
                            ? "Entregado"
                            : "Cancelado"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-slate-500">
                  No hay órdenes asociadas a este cliente
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ventas">
          <Card>
            <CardHeader>
              <CardTitle>Ventas</CardTitle>
            </CardHeader>
            <CardContent>
              {salesStatus === "loading" || salesStatus2 === "loading" ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-slate-900"></div>
                </div>
              ) : sales && sales.length > 0 || sales2 && sales2.length > 0 ? (
                <div className="space-y-4">
                  {(sales && sales.length > 0 ? sales : sales2).map((sale: any) => (
                    <div
                      key={sale.id}
                      className="border rounded-lg p-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium">
                            Venta #{sale.number || sale.id.substring(0, 8)}
                          </h3>
                          <p className="text-sm text-slate-500">
                            Fecha: {formatDate(sale.saleDate || sale.createdAt)}
                          </p>
                          <p className="text-sm text-slate-500">
                            Método de pago: {
                              sale.paymentMethod === EPaymentMethod.CASH
                                ? "Efectivo"
                                : sale.paymentMethod === EPaymentMethod.TRANSFER
                                ? "Transferencia"
                                : sale.paymentMethod === EPaymentMethod.CREDIT_CARD
                                ? "Tarjeta"
                                : sale.paymentMethod === EPaymentMethod.CHECK
                                ? "Cheque"
                                : sale.paymentMethod === EPaymentMethod.MERCADOPAGO
                                ? "Otro"
                                : "-"
                            }
                          </p>
                          <p className="text-sm font-semibold mt-2">
                            Total: {formatearPrecio(sale.total || 0)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="bg-blue-900 hover:bg-blue-700 text-white"
                          onClick={() => handleViewSale(sale.id)}
                        >
                          <EyeIcon className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="mt-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            sale.facturas && sale.facturas.length > 0
                              ? "bg-green-100 text-green-800"
                              : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {sale.facturas && sale.facturas.length > 0 ? "Facturado" : "Sin Facturar"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-slate-500">
                  No hay ventas asociadas a este cliente
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de detalles de venta */}
      <SaleDetailsModal
        open={isSaleModalOpen}
        onOpenChange={setIsSaleModalOpen}
        saleId={selectedSaleId}
        onSuccess={handleCloseSaleModal}
      />
    </div>
  );
}

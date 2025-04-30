"use client";

import { useParams } from "next/navigation";
import { useFirestore, useFirestoreDocData, useFirestoreCollectionData } from "reactfire";
import { doc, collection, query, where } from "firebase/firestore";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import collections from "~/lib/collections";
import { EClientType, TClient } from "~/types/client";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ClienteDetallePage() {
  const params = useParams();
  const clientId = params.id as string;
  const firestore = useFirestore();
  const router = useRouter();

  const clientRef = doc(firestore, collections.CLIENTS, clientId);
  const { status, data: client } = useFirestoreDocData(clientRef, {
    idField: "id",
  });

  // Obtener presupuestos del cliente
  const { status: quotesStatus, data: quotes } = useFirestoreCollectionData(
    query(
      collection(firestore, collections.QUOTES),
      where("client.id", "==", clientId)
    ),
    { idField: "id" }
  );

  // Formatear fecha
  const formatDate = (date: any) => {
    if (!date) return "-";
    try {
      if (typeof date === 'object' && 'seconds' in date) {
        return new Date(date.seconds * 1000).toLocaleDateString("es-AR");
      }
      return new Date(date).toLocaleDateString("es-AR");
    } catch (error) {
      console.error("Error al formatear fecha:", error);
      return "-";
    }
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
        <h2 className="text-2xl font-bold text-slate-900">Cliente no encontrado</h2>
        <p className="mt-2 text-slate-600">El cliente que buscas no existe o ha sido eliminado.</p>
        <Button asChild className="mt-4">
          <Link href="/dashboard/banderas/clientes">Volver a clientes</Link>
        </Button>
      </div>
    );
  }

  const typedClient = client as unknown as TClient;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Detalle del Cliente</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Volver
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/dashboard/banderas/clientes/${clientId}/editar`)
            }
          >
            Editar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="presupuestos">Presupuestos</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Información General</CardTitle>
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
                    {typedClient.type === EClientType.COMPANY ? "Empresa" : "Individual"}
                  </p>
                </div>
                {typedClient.type === EClientType.COMPANY && typedClient.businessName && (
                  <div>
                    <h3 className="font-semibold text-slate-700">Razón Social</h3>
                    <p className="text-slate-900">{typedClient.businessName}</p>
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
                          <h3 className="font-medium">Presupuesto #{quote.number}</h3>
                          <p className="text-sm text-slate-500">
                            Fecha: {formatDate(quote.createdAt)}
                          </p>
                          <p className="text-sm text-slate-500">
                            Válido hasta: {formatDate(quote.validUntil)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              router.push(
                                `/dashboard/banderas/presupuestos/${quote.number}`
                              )
                            }
                          >
                            Ver
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              router.push(
                                `/dashboard/banderas/presupuestos/${quote.number}/editar`
                              )
                            }
                          >
                            Editar
                          </Button>
                        </div>
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
      </Tabs>
    </div>
  );
}    
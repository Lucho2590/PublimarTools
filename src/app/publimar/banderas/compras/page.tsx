"use client";

import { useState } from "react";
import { useFirestore } from "reactfire";
import { collection, addDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { useFirestoreCollectionData } from "reactfire";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "~/components/ui/table";
import { TPurchase } from "~/types/purchase";
import { TProvider } from "~/types/provider";

// Formatear precio
function formatearPrecio(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(valor);
}

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
  

export default function ComprasPage() {
  const firestore = useFirestore();
  const [form, setForm] = useState<Partial<TPurchase>>({ date: new Date().toISOString().split("T")[0] });
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Obtener proveedores para el select
  const providersCollection = collection(firestore, "providers");
  const { status: provStatus, data: providers } = useFirestoreCollectionData(providersCollection, { idField: "id" });

  // Obtener compras ordenadas por fecha descendente
  const purchasesCollection = collection(firestore, "purchases");
  const purchasesQuery = query(purchasesCollection, orderBy("date", "desc"));
  const { status: purStatus, data: purchases } = useFirestoreCollectionData(purchasesQuery, { idField: "id" });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleProviderChange = (value: string) => {
    setForm({ ...form, providerId: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const provider = providers?.find((p: any) => p.id === form.providerId);
      await addDoc(purchasesCollection, {
        ...form,
        providerName: provider?.name || "",
        date: form.date,
        amount: Number(form.amount),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setForm({ date: new Date().toISOString().split("T")[0] });
      setShowForm(false);
    } catch (error) {
      alert("Error al guardar compra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Registrar Compra</CardTitle>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.href = '/publimar/proveedores'}
            >
              Gestionar proveedores
            </Button>
            <Button variant="outline" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Ocultar" : "Agregar compra"}
            </Button>
          </div>
        </CardHeader>
        {showForm && (
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Fecha</Label>
                <Input name="date" type="date" value={form.date || ""} onChange={handleChange} required />
              </div>
              <div>
                <Label>Proveedor</Label>
                <Select value={form.providerId || ""} onValueChange={handleProviderChange} required>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers && providers.map((prov: any) => (
                      <SelectItem key={prov.id} value={prov.id}>{prov.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Descripción / Nota</Label>
                <textarea name="description" value={form.description || ""} onChange={handleChange} className="w-full border rounded p-2 min-h-[40px]" required />
              </div>
              <div>
                <Label>Monto</Label>
                <Input name="amount" type="number" min="0" step="0.01" value={form.amount || ""} onChange={handleChange} required />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
            
                <Button type="submit" disabled={loading}>
                  {loading ? "Guardando..." : "Registrar Compra"}
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial de Compras</CardTitle>
        </CardHeader>
        <CardContent>
          {purStatus === "loading" ? (
            <p>Cargando compras...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases && purchases.length > 0 ? (
                    purchases.map((compra: any) => (
                      <TableRow key={compra.id}>
                        <TableCell>{formatDate(compra.date)}</TableCell>
                        <TableCell>{compra.providerName || "-"}</TableCell>
                        <TableCell>{compra.description}</TableCell>
                        <TableCell className="text-right">{formatearPrecio(Number(compra.amount))}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-500 p-4">No hay compras registradas</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

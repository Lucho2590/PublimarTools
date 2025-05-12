"use client";

import { useState } from "react";
import { useFirestore } from "reactfire";
import { collection, addDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { useFirestoreCollectionData } from "reactfire";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "~/components/ui/table";
import { TProvider } from "~/types/provider";
import Link from "next/link";

export default function ProveedoresPage() {
  const firestore = useFirestore();
  const [form, setForm] = useState<Partial<TProvider>>({});
  const [loading, setLoading] = useState(false);

  // Obtener proveedores ordenados por nombre
  const providersCollection = collection(firestore, "providers");
  const providersQuery = query(providersCollection, orderBy("name"));
  const { status, data: providers } = useFirestoreCollectionData(providersQuery, { idField: "id" });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(providersCollection, {
        ...form,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setForm({});
    } catch (error) {
      alert("Error al guardar proveedor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <Button
        variant="outline"
        className="mb-4"
        onClick={() => window.history.back()}
      >
        Volver
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Agregar Proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nombre/Razón social</Label>
              <Input name="name" value={form.name || ""} onChange={handleChange} required />
            </div>
            <div>
              <Label>Email</Label>
              <Input name="email" value={form.email || ""} onChange={handleChange} type="email" />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input name="phone" value={form.phone || ""} onChange={handleChange} />
            </div>
            <div>
              <Label>Dirección</Label>
              <Input name="address" value={form.address || ""} onChange={handleChange} />
            </div>
            <div>
              <Label>CUIT/CUIL</Label>
              <Input name="cuit" value={form.cuit || ""} onChange={handleChange} />
            </div>
            <div>
              <Label>Persona de contacto</Label>
              <Input name="contactPerson" value={form.contactPerson || ""} onChange={handleChange} />
            </div>
            <div className="md:col-span-2">
              <Label>Notas</Label>
              <textarea name="notes" value={form.notes || ""} onChange={handleChange} className="w-full border rounded p-2 min-h-[40px]" />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={loading}>{loading ? "Guardando..." : "Agregar Proveedor"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Proveedores Registrados</CardTitle>
        </CardHeader>
        <CardContent>
          {status === "loading" ? (
            <p>Cargando proveedores...</p>
          ) : (
            <div className="overflow-x-auto ">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Dirección</TableHead>
                    <TableHead>CUIT/CUIL</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers && providers.length > 0 ? (
                    providers.map((prov: any) => (
                      <TableRow key={prov.id}>
                        <TableCell className="font-medium">{prov.name}</TableCell>
                        <TableCell>{prov.email}</TableCell>
                        <TableCell>{prov.phone}</TableCell>
                        <TableCell>{prov.address}</TableCell>
                        <TableCell>{prov.cuit}</TableCell>
                        <TableCell>{prov.contactPerson}</TableCell>
                        <TableCell>{prov.notes}</TableCell>
                        <TableCell className="text-center">
                          <Link href={`/publimar/proveedores/${prov.id}`} className="text-blue-700 hover:underline">Editar</Link>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-slate-500 p-4">No hay proveedores registrados</TableCell>
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
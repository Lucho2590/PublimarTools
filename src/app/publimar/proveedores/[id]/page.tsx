"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFirestore, useFirestoreDocData } from "reactfire";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { TProvider } from "~/types/provider";

export default function EditarProveedorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const firestore = useFirestore();
  const providerRef = doc(firestore, "providers", params.id);
  const { status, data } = useFirestoreDocData(providerRef, { idField: "id" });
  const [form, setForm] = useState<Partial<TProvider>>({});
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (data) setForm(data as TProvider);
  }, [data]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateDoc(providerRef, {
        ...form,
        updatedAt: new Date(),
      });
      router.push("/publimar/proveedores");
    } catch (error) {
      alert("Error al actualizar proveedor");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("¿Seguro que deseas eliminar este proveedor?")) return;
    setDeleting(true);
    try {
      await deleteDoc(providerRef);
      router.push("/publimar/proveedores");
    } catch (error) {
      alert("Error al eliminar proveedor");
    } finally {
      setDeleting(false);
    }
  };

  if (status === "loading") return <p className="p-8">Cargando proveedor...</p>;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Editar Proveedor</CardTitle>
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
            <div className="md:col-span-2 flex justify-between gap-4 mt-4">
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Eliminando..." : "Eliminar"}
              </Button>
              <Button type="submit" disabled={loading}>{loading ? "Guardando..." : "Guardar Cambios"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
} 
'use client';

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFirestore, useFirestoreDocData } from "reactfire";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
// import collections from "@/lib/collections";
import { TProvider } from "@/types/provider";

export default function EditarProveedorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const firestore = useFirestore();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState<Partial<TProvider>>({
    name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
    cuit: "",
    contactPerson: "",
  });

  // Obtener el proveedor
  const { status, data } = useFirestoreDocData(
    doc(firestore, "providers", params.id),
    { idField: "id" }
  );

  useEffect(() => {
    if (data) setFormData(data as TProvider);
  }, [data]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateDoc(doc(firestore, "providers", params.id), {
        ...formData,
        updatedAt: new Date(),
      });
      toast.success("Proveedor actualizado correctamente");
      router.push("/publimar/proveedores");
    } catch (error) {
      console.error("Error al actualizar proveedor:", error);
      toast.error("Error al actualizar el proveedor");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("¿Estás seguro de que deseas eliminar este proveedor?")) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(firestore, "providers", params.id));
      router.push("/publimar/proveedores");
    } catch (error) {
      console.error("Error al eliminar proveedor:", error);
      toast.error("Error al eliminar el proveedor");
    } finally {
      setDeleting(false);
    }
  };

  if (status === "loading") return <p className="p-8">Cargando proveedor...</p>;

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-4">
      <Button
        variant="outline"
        onClick={() => router.push("/publimar/proveedores")}
      >
        Volver
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Editar Proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nombre/Razón social</Label>
              <Input name="name" value={formData.name || ""} onChange={handleChange} required />
            </div>
            <div>
              <Label>Email</Label>
              <Input name="email" value={formData.email || ""} onChange={handleChange} type="email" />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input name="phone" value={formData.phone || ""} onChange={handleChange} />
            </div>
            <div>
              <Label>Dirección</Label>
              <Input name="address" value={formData.address || ""} onChange={handleChange} />
            </div>
            <div>
              <Label>CUIT/CUIL</Label>
              <Input name="cuit" value={formData.cuit || ""} onChange={handleChange} />
            </div>
            <div>
              <Label>Persona de contacto</Label>
              <Input name="contactPerson" value={formData.contactPerson || ""} onChange={handleChange} />
            </div>
            <div className="md:col-span-2">
              <Label>Notas</Label>
              <textarea name="notes" value={formData.notes || ""} onChange={handleChange} className="w-full border rounded p-2 min-h-[40px]" />
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
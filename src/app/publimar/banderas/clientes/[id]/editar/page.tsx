"use client";

import { useParams, useRouter } from "next/navigation";
import { useFirestore, useFirestoreDocData } from "reactfire";
import { doc, updateDoc } from "firebase/firestore";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import collections from "~/lib/collections";
import { EClientType, EClientStatus, TClient, TClientContact } from "~/types/client";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";

export default function EditarClientePage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  const firestore = useFirestore();

  const clientRef = doc(firestore, collections.CLIENTS, clientId);
  const { status, data: client } = useFirestoreDocData(clientRef, {
    idField: "id",
  });

  const [formData, setFormData] = useState<Partial<TClient>>({
    name: "",
    type: EClientType.INDIVIDUAL,
    status: EClientStatus.ACTIVE,
    businessName: "",
    email: "",
    phone: "",
    address: "",
    cuit: "",
    notes: "",
    contacts: [],
  });

  const [contacts, setContacts] = useState<TClientContact[]>([]);

  const [isLoading, setIsLoading] = useState(false);

  // Actualizar el formulario cuando se cargan los datos del cliente
  if (status === "success" && client && !formData.name) {
    setFormData(client as unknown as TClient);
    setContacts(client.contacts || [{ name: "", email: "", phone: "" }]);
  }

  const handleContactChange = (
    index: number,
    field: keyof TClientContact,
    value: string
  ) => {
    const updatedContacts = [...contacts];
    updatedContacts[index] = {
      ...updatedContacts[index],
      [field]: value,
    };
    setContacts(updatedContacts);
  };

  const addContact = () => {
    setContacts([...contacts, { name: "", email: "", phone: "" }]);
  };

  const removeContact = (index: number) => {
    if (contacts.length > 1) {
      const updatedContacts = contacts.filter((_, i) => i !== index);
      setContacts(updatedContacts);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Filtrar contactos vacíos
      const filteredContacts = contacts.filter(
        (contact) =>
          contact.name.trim() !== "" ||
          contact.email.trim() !== "" ||
          contact.phone.trim() !== ""
      );

      await updateDoc(clientRef, {
        ...formData,
        contacts: filteredContacts,
        updatedAt: new Date(),
      });

      toast.success("Cliente actualizado correctamente");
      router.push(`/publimar/banderas/clientes/${clientId}`);
    } catch (error) {
      console.error("Error al actualizar el cliente:", error);
      toast.error("Error al actualizar el cliente");
    } finally {
      setIsLoading(false);
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
          <Link href="/publimar/banderas/clientes">Volver a clientes</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Editar Cliente</h1>
        <Button variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Información General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, type: value as EClientType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EClientType.INDIVIDUAL}>Individual</SelectItem>
                    <SelectItem value={EClientType.COMPANY}>Empresa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.type === EClientType.COMPANY && (
                <div className="space-y-2">
                  <Label htmlFor="businessName">Razón Social</Label>
                  <Input
                    id="businessName"
                    value={formData.businessName}
                    onChange={(e) =>
                      setFormData({ ...formData, businessName: e.target.value })
                    }
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Dirección</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuit">CUIT</Label>
                <Input
                  id="cuit"
                  value={formData.cuit}
                  onChange={(e) =>
                    setFormData({ ...formData, cuit: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                />
              </div>
            </div>

            <Card className="mt-6">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Contactos</CardTitle>
                <Button
                  type="button"
                  onClick={addContact}
                  variant="outline"
                  size="sm"
                >
                  Añadir contacto
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {contacts.map((contact, index) => (
                  <div key={index} className="border p-4 rounded-md">
                    <div className="flex justify-between mb-4">
                      <h3 className="font-medium">Contacto {index + 1}</h3>
                      {contacts.length > 1 && (
                        <Button
                          type="button"
                          onClick={() => removeContact(index)}
                          variant="ghost"
                          size="sm"
                          className="text-red-500"
                        >
                          Eliminar
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`contact-name-${index}`}>Nombre</Label>
                        <Input
                          id={`contact-name-${index}`}
                          value={contact.name}
                          onChange={(e) =>
                            handleContactChange(index, "name", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`contact-email-${index}`}>Email</Label>
                        <Input
                          id={`contact-email-${index}`}
                          type="email"
                          value={contact.email}
                          onChange={(e) =>
                            handleContactChange(index, "email", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`contact-phone-${index}`}>Teléfono</Label>
                        <Input
                          id={`contact-phone-${index}`}
                          value={contact.phone}
                          onChange={(e) =>
                            handleContactChange(index, "phone", e.target.value)
                          }
                        />
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="space-y-2">
                        <Label htmlFor={`contact-position-${index}`}>
                          Cargo/Posición
                        </Label>
                        <Input
                          id={`contact-position-${index}`}
                          value={contact.position || ""}
                          onChange={(e) =>
                            handleContactChange(index, "position", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

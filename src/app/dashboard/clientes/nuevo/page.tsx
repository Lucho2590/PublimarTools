"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFirestore } from "reactfire";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { toast } from "sonner";
import collections from "~/lib/collections";
import { EClientType, EClientStatus, TClientContact } from "~/types/client";

export default function NuevoClientePage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const firestore = useFirestore();

  // Estado para los contactos del cliente
  const [contacts, setContacts] = useState<TClientContact[]>([
    { name: "", email: "", phone: "" },
  ]);

  const [formData, setFormData] = useState({
    name: "",
    type: EClientType.COMPANY,
    status: EClientStatus.ACTIVE,
    email: "",
    phone: "",
    address: "",
    taxId: "",
    notes: "",
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

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
    setLoading(true);

    try {
      // Filtrar contactos vacíos
      const filteredContacts = contacts.filter(
        (contact) =>
          contact.name.trim() !== "" ||
          contact.email.trim() !== "" ||
          contact.phone.trim() !== ""
      );

      // Crear un nuevo cliente en Firestore
      const clientData: Record<string, any> = {
        ...formData,
        contacts: filteredContacts,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Eliminar campos vacíos
      Object.keys(clientData).forEach((key) => {
        if (clientData[key] === "") {
          delete clientData[key];
        }
      });

      const clientsCollection = collection(firestore, collections.CLIENTS);
      await addDoc(clientsCollection, clientData);

      toast.success("Cliente creado con éxito");
      router.push("/dashboard/clientes");
    } catch (error) {
      console.error("Error al crear el cliente:", error);
      toast.error("Error al crear el cliente");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Crear nuevo cliente</h1>
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/clientes")}
        >
          Cancelar
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Información básica</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre o Razón Social</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxId">CUIT/CUIL</Label>
                <Input
                  id="taxId"
                  name="taxId"
                  value={formData.taxId}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <select
                  id="type"
                  name="type"
                  className="w-full p-2 border border-slate-300 rounded-md"
                  value={formData.type}
                  onChange={handleChange}
                  required
                >
                  <option value={EClientType.COMPANY}>Empresa</option>
                  <option value={EClientType.INDIVIDUAL}>Individual</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Estado</Label>
                <select
                  id="status"
                  name="status"
                  className="w-full p-2 border border-slate-300 rounded-md"
                  value={formData.status}
                  onChange={handleChange}
                  required
                >
                  <option value={EClientStatus.ACTIVE}>Activo</option>
                  <option value={EClientStatus.INACTIVE}>Inactivo</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Dirección</Label>
              <Input
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
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

        <Card>
          <CardFooter className="flex justify-between pt-6">
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/clientes")}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : "Guardar cliente"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}

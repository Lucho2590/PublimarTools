"use client";

import { redirect, useRouter } from "next/navigation";
import { useFirestore, useFirestoreDocData } from "reactfire";
import { doc, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CuitInput } from "@/components/cuit-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import collections from "@/lib/collections";
import {
  EClientType,
  EClientStatus,
  EClientSection,
  EClientTaxCondition,
  TClient,
  TClientContact,
} from "@/types/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  Trash2,
  Plus,
  Loader2,
  ArrowLeft,
  Users,
  Save,
} from "lucide-react";

const taxConditionOptions: {
  value: EClientTaxCondition;
  label: string;
  invoice: string;
}[] = [
  {
    value: EClientTaxCondition.IVA_INSCRIPTO,
    label: "IVA Inscripto",
    invoice: "Factura A",
  },
  {
    value: EClientTaxCondition.IVA_EXENTO,
    label: "IVA Exento",
    invoice: "Factura B",
  },
  {
    value: EClientTaxCondition.IVA_NO_ALCANZADO,
    label: "IVA No Alcanzado",
    invoice: "Factura B",
  },
  {
    value: EClientTaxCondition.CONSUMIDOR_FINAL,
    label: "Consumidor Final",
    invoice: "Factura B",
  },
];

export default function EditarClientePage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const firestore = useFirestore();
  const clientRef = doc(firestore, collections.CLIENTS, params.id);
  const { status, data: client } = useFirestoreDocData(clientRef, {
    idField: "id",
  });

  const [formData, setFormData] = useState<Partial<TClient>>({
    name: "",
    type: EClientType.INDIVIDUAL,
    status: EClientStatus.ACTIVE,
    section: EClientSection.BANDERAS,
    businessName: "",
    fantasyName: "",
    email: "",
    phone: "",
    address: "",
    cuit: "",
    taxCondition: undefined,
    reference: "",
    notes: "",
    contacts: [],
  });

  const [contacts, setContacts] = useState<TClientContact[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (status === "success" && client && !formData.name) {
      setFormData(client as unknown as TClient);
      setContacts(client.contacts || [{ name: "", email: "", phone: "" }]);
    }
  }, [status, client, formData.name]);

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
      const filteredContacts = contacts.filter(
        (contact) =>
          contact.name.trim() !== "" ||
          contact.email.trim() !== "" ||
          contact.phone.trim() !== ""
      );

      const finalFormData = { ...formData };
      if (finalFormData.type === EClientType.COMPANY) {
        finalFormData.name =
          finalFormData.fantasyName ||
          finalFormData.businessName ||
          finalFormData.name;
      }

      await updateDoc(clientRef, {
        ...finalFormData,
        contacts: filteredContacts,
        updatedAt: new Date(),
      });

      toast.success("Cliente actualizado correctamente");
      redirect(`/publimar/banderas/clientes/${params.id}`);
    } catch (error) {
      console.error("Error al actualizar el cliente:", error);
      toast.error("Error al actualizar el cliente");
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-2xl font-bold tracking-tight">
          Cliente no encontrado
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          El cliente que buscas no existe o ha sido eliminado.
        </p>
        <Button asChild className="mt-6">
          <Link href="/publimar/banderas/clientes">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Volver a clientes
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Editar cliente</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Actualizá los datos y la condición fiscal del cliente
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Cancelar
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Información general
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo de cliente</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: EClientType) =>
                    setFormData({ ...formData, type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EClientType.INDIVIDUAL}>
                      Persona física
                    </SelectItem>
                    <SelectItem value={EClientType.COMPANY}>Empresa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuit">
                  {formData.type === EClientType.COMPANY ? "CUIT" : "CUIT / CUIL"}
                </Label>
                <CuitInput
                  id="cuit"
                  value={formData.cuit || ""}
                  onValueChange={(digits) =>
                    setFormData({ ...formData, cuit: digits })
                  }
                />
              </div>

              {formData.type === EClientType.INDIVIDUAL ? (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name">Nombre completo *</Label>
                  <Input
                    id="name"
                    value={formData.name || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Razón Social *</Label>
                    <Input
                      id="businessName"
                      value={formData.businessName || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          businessName: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fantasyName">Nombre de Fantasía</Label>
                    <Input
                      id="fantasyName"
                      value={formData.fantasyName || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          fantasyName: e.target.value,
                        })
                      }
                      placeholder="Si difiere de la razón social"
                    />
                  </div>
                </>
              )}

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="taxCondition">Condición frente al IVA</Label>
                <Select
                  value={formData.taxCondition ?? "none"}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      taxCondition:
                        value === "none"
                          ? undefined
                          : (value as EClientTaxCondition),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar condición fiscal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin definir</SelectItem>
                    {taxConditionOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label} · {opt.invoice}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  value={formData.phone || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Dirección</Label>
                <Input
                  id="address"
                  value={formData.address || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="reference">Referencia</Label>
                <Input
                  id="reference"
                  value={formData.reference || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, reference: e.target.value })
                  }
                  placeholder="Referencia del cliente..."
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  value={formData.notes || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              Personas de contacto
            </CardTitle>
            <Button
              type="button"
              onClick={addContact}
              variant="outline"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Añadir contacto
            </Button>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {contacts.map((contact, index) => (
              <div
                key={index}
                className="p-4 rounded-lg bg-slate-50 space-y-3"
              >
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold">
                    Contacto {index + 1}
                  </h3>
                  {contacts.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeContact(index)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                    <Label htmlFor={`contact-position-${index}`}>
                      Cargo / Posición
                    </Label>
                    <Input
                      id={`contact-position-${index}`}
                      value={contact.position || ""}
                      onChange={(e) =>
                        handleContactChange(index, "position", e.target.value)
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
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" />
                Guardar cambios
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

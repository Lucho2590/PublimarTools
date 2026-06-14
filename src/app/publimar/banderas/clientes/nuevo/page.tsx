"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFirestore, useUser } from "reactfire";
import { collection, addDoc, serverTimestamp, doc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CuitInput } from "@/components/cuit-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import collections from "@/lib/collections";
import {
  EClientType,
  EClientStatus,
  EClientSection,
  EClientTaxCondition,
  TClientContact,
} from "@/types/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Save,
  Trash2,
  Plus,
  Loader2,
  ArrowLeft,
  Users,
} from "lucide-react";
import { useAuditLog } from "@/hooks/useAuditLog";
import { buildChanges } from "@/lib/auditLog";
import {
  EAuditAction,
  EAuditEntityType,
  EAuditSection,
} from "@/types/auditLog";
import { taxConditionOptions } from "@/lib/taxCondition";

export default function NuevoClientePage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const firestore = useFirestore();
  const { data: user } = useUser();
  const { logEvent } = useAuditLog();

  const [contacts, setContacts] = useState<TClientContact[]>([
    { name: "", email: "", phone: "" },
  ]);

  const [formData, setFormData] = useState<{
    name: string;
    type: EClientType;
    status: EClientStatus;
    section: EClientSection;
    businessName: string;
    fantasyName: string;
    email: string;
    phone: string;
    address: string;
    cuit: string;
    taxCondition: EClientTaxCondition | undefined;
    reference: string;
    notes: string;
  }>({
    name: "",
    type: EClientType.COMPANY,
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
      setContacts(contacts.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (formData.type === EClientType.COMPANY) {
      if (!formData.businessName) {
        toast.error("La razón social es requerida");
        return;
      }
    } else {
      if (!formData.name) {
        toast.error("El nombre del cliente es requerido");
        return;
      }
    }
    if (!user) {
      toast.error("Debes estar logueado para crear un cliente");
      return;
    }
    setLoading(true);

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
          finalFormData.fantasyName || finalFormData.businessName;
      }

      const clientData: Record<string, any> = {
        ...finalFormData,
        contacts: filteredContacts,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: doc(firestore, `users/${user.uid}`),
        updatedBy: doc(firestore, `users/${user.uid}`),
      };

      Object.keys(clientData).forEach((key) => {
        if (
          (clientData[key] === "" || clientData[key] === undefined) &&
          key !== "name"
        ) {
          delete clientData[key];
        }
      });

      const clientsCollection = collection(firestore, collections.CLIENTS);
      const docRef = await addDoc(clientsCollection, clientData);

      await logEvent({
        section:
          finalFormData.section === EClientSection.VIA_PUBLICA
            ? EAuditSection.VIA_PUBLICA
            : EAuditSection.BANDERAS_CLIENTES,
        entityType: EAuditEntityType.CLIENT,
        entityId: docRef.id,
        entityLabel: finalFormData.name ?? null,
        action: EAuditAction.CREATE,
        description: `Creó el cliente ${finalFormData.name ?? ""}`.trim(),
        changes: buildChanges(
          null,
          { ...finalFormData, contacts: filteredContacts } as any,
          [
            "name",
            "type",
            "status",
            "section",
            "businessName",
            "fantasyName",
            "email",
            "phone",
            "address",
            "cuit",
            "taxCondition",
            "reference",
            "notes",
            "contacts",
          ]
        ),
      });

      toast.success("Cliente creado con éxito");
      router.push("/publimar/banderas/clientes");
    } catch (error) {
      console.error("Error al crear el cliente:", error);
      toast.error("Error al crear el cliente");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Crear nuevo cliente
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ingresá los datos y la condición fiscal para facturar
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/publimar/banderas/clientes")}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Cancelar
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Información básica
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo de cliente</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) =>
                    handleChange({
                      target: { name: "type", value },
                    } as any)
                  }
                >
                  <SelectTrigger className="w-full">
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
                  {formData.type === EClientType.COMPANY
                    ? "CUIT"
                    : "CUIT / CUIL"}
                </Label>
                <CuitInput
                  id="cuit"
                  name="cuit"
                  value={formData.cuit}
                  onValueChange={(digits) =>
                    setFormData((prev) => ({ ...prev, cuit: digits }))
                  }
                />
              </div>
            </div>

            {formData.type === EClientType.INDIVIDUAL ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre completo *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
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
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Razón Social *</Label>
                  <Input
                    id="businessName"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fantasyName">Nombre de Fantasía</Label>
                  <Input
                    id="fantasyName"
                    name="fantasyName"
                    value={formData.fantasyName}
                    onChange={handleChange}
                    placeholder="Si difiere de la razón social"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Input
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="taxCondition">Condición frente al IVA</Label>
              <Select
                value={formData.taxCondition ?? "none"}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    taxCondition:
                      value === "none"
                        ? undefined
                        : (value as EClientTaxCondition),
                  }))
                }
              >
                <SelectTrigger className="w-full">
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
              <Label htmlFor="reference">Referencia</Label>
              <Input
                id="reference"
                name="reference"
                value={formData.reference}
                onChange={handleChange}
                placeholder="Referencia del cliente..."
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
                      onClick={() => removeContact(index)}
                      variant="ghost"
                      size="icon"
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
            onClick={() => router.push("/publimar/banderas/clientes")}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" />
                Guardar cliente
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

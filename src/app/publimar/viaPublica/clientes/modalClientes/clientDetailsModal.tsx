"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useFirestore,
  useFirestoreCollectionData,
  useFirestoreDocData,
} from "reactfire";
import { doc, collection, query, where, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import collections from "@/lib/collections";
import {
  EClientType,
  EClientStatus,
  TClient,
  TClientContact,
} from "@/types/client";
import { useAuditLog } from "@/hooks/useAuditLog";
import { buildChanges } from "@/lib/auditLog";
import { EAuditAction, EAuditEntityType, EAuditSection } from "@/types/auditLog";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Edit, Save, Trash2 } from "lucide-react";
import QuoteDetailsModal from "../../../banderas/presupuestos/modalPresupuestos/quoteDetailsModal";

interface ClientDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string | null;
  onClientUpdated?: () => void;
}

export default function ClientDetailsModal({
  isOpen,
  onClose,
  clientId,
  onClientUpdated,
}: ClientDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const firestore = useFirestore();
  const { logEvent } = useAuditLog();

  const [formData, setFormData] = useState<Partial<TClient>>({
    name: "",
    type: EClientType.INDIVIDUAL,
    status: EClientStatus.ACTIVE,
    businessName: "",
    fantasyName: "",
    email: "",
    phone: "",
    address: "",
    cuit: "",
    reference: "",
    notes: "",
    contacts: [],
  });

  const [contacts, setContacts] = useState<TClientContact[]>([]);

  const handleViewQuote = (quoteId: string) => {
    setSelectedQuoteId(quoteId);
    setShowQuoteModal(true);
  };

  const resetModalState = useCallback(() => {
    setIsEditing(false);
    setFormData({
      name: "",
      type: EClientType.INDIVIDUAL,
      status: EClientStatus.ACTIVE,
      businessName: "",
      fantasyName: "",
      email: "",
      phone: "",
      address: "",
      cuit: "",
      reference: "",
      notes: "",
      contacts: [],
    });
    setContacts([]);
  }, []);

  // Get client data
  const clientRef = clientId
    ? doc(firestore, collections.CLIENTS, clientId)
    : null;
  const { status, data: client } = useFirestoreDocData(
    clientRef || doc(firestore, collections.CLIENTS, "dummy"),
    {
      idField: "id",
    }
  );

  // Get client quotes
  const { status: quotesStatus, data: quotes } = useFirestoreCollectionData(
    clientId
      ? query(
          collection(firestore, collections.QUOTES),
          where("client.id", "==", clientId)
        )
      : query(
          collection(firestore, collections.QUOTES),
          where("__name__", "==", "nonexistent")
        ),
    { idField: "id" }
  );

  // Reset form when modal closes or client changes
  useEffect(() => {
    if (!isOpen) {
      resetModalState();
      return;
    }

    if (status === "success" && client && clientId) {
      const typedClient = client as TClient;
      setFormData(typedClient);
      setContacts(typedClient.contacts || [{ name: "", email: "", phone: "" }]);
    }
  }, [isOpen, status, client, clientId, resetModalState]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (status === "success" && client && clientId) {
      const typedClient = client as TClient;
      setFormData(typedClient);
      setContacts(typedClient.contacts || [{ name: "", email: "", phone: "" }]);
    }
    setIsEditing(false);
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
    if (!clientRef) return;

    setIsLoading(true);

    try {
      // Filter empty contacts
      const filteredContacts = contacts.filter(
        (contact) =>
          contact.name.trim() !== "" ||
          contact.email.trim() !== "" ||
          contact.phone.trim() !== ""
      );

      const finalFormData = { ...formData };
      if (finalFormData.type === EClientType.COMPANY) {
        finalFormData.name = finalFormData.fantasyName || finalFormData.businessName || finalFormData.name;
      }

      const beforeData = client as TClient | undefined;
      const afterData = { ...finalFormData, contacts: filteredContacts };
      await updateDoc(clientRef, {
        ...finalFormData,
        contacts: filteredContacts,
        updatedAt: new Date(),
      });

      const watched = [
        'name', 'type', 'status', 'section', 'businessName', 'fantasyName',
        'razonesSociales', 'email', 'phone', 'address', 'cuit', 'reference', 'notes', 'contacts',
      ];
      const changes = buildChanges(beforeData as any, afterData as any, watched);
      const changedFields = Object.keys(changes.after ?? {});
      await logEvent({
        section: EAuditSection.VIA_PUBLICA,
        entityType: EAuditEntityType.CLIENT,
        entityId: clientId!,
        entityLabel: beforeData?.name ?? finalFormData.name ?? null,
        action: EAuditAction.UPDATE,
        description: changedFields.length
          ? `Editó el cliente ${beforeData?.name ?? ''} (${changedFields.join(', ')})`.trim()
          : `Editó el cliente ${beforeData?.name ?? ''}`.trim(),
        changes,
      });

      toast.success("Cliente actualizado correctamente");
      setIsEditing(false);
      onClientUpdated?.();
    } catch (error) {
      console.error("Error al actualizar el cliente:", error);
      toast.error("Error al actualizar el cliente");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !clientId) return null;

  if (status === "loading" && clientId) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!client && clientId) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-slate-900">
              Cliente no encontrado
            </h2>
            <p className="mt-2 text-slate-600">
              El cliente que buscas no existe o ha sido eliminado.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const typedClient = client as TClient;


  console.log(typedClient);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex justify-between items-center">
            <span>{isEditing ? "Editar Cliente" : "Detalle del Cliente"}</span>
            <div className="flex gap-2">
              {!isEditing ? (
                <>
                  <Button
                    className="bg-blue-900 hover:bg-blue-600 text-white"
                    onClick={handleEdit}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  {/* <Button
                    className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                    variant="outline"
                    onClick={onClose}
                  >
                    Cerrar
                  </Button> */}
                </>
              ) : (
                <>
           
                  <Button 
                     className="bg-red-500 hover:bg-red-600 text-white"
                    onClick={handleCancelEdit}
                    variant="outline"
                  >
                    Cancelar
                  </Button>
            
                </>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {!isEditing ? (
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
                      <h3 className="font-semibold text-slate-700">Tipo</h3>
                      <p className="text-slate-900">
                        {typedClient.type === EClientType.COMPANY
                          ? "Empresa"
                          : "Particular"}
                      </p>
                    </div>
                    {typedClient.type === EClientType.INDIVIDUAL ? (
                      <div>
                        <h3 className="font-semibold text-slate-700">Nombre</h3>
                        <p className="text-slate-900">{typedClient.name}</p>
                      </div>
                    ) : (
                      <>
                        {typedClient.businessName && (
                          <div>
                            <h3 className="font-semibold text-slate-700">Razón Social</h3>
                            <p className="text-slate-900">{typedClient.businessName}</p>
                          </div>
                        )}
                        {typedClient.fantasyName && (
                          <div>
                            <h3 className="font-semibold text-slate-700">Nombre de Fantasía</h3>
                            <p className="text-slate-900">{typedClient.fantasyName}</p>
                          </div>
                        )}
                        {!typedClient.businessName && !typedClient.fantasyName && (
                          <div>
                            <h3 className="font-semibold text-slate-700">Nombre</h3>
                            <p className="text-slate-900">{typedClient.name}</p>
                          </div>
                        )}
                      </>
                    )}
                    <div>
                      <h3 className="font-semibold text-slate-700">Email</h3>
                      <p className="text-slate-900">
                        {typedClient.email || "-"}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-700">Teléfono</h3>
                      <p className="text-slate-900">
                        {typedClient.phone || "-"}
                      </p>
                    </div>
                    {typedClient.address && (
                      <div className="md:col-span-2">
                        <h3 className="font-semibold text-slate-700">
                          Dirección
                        </h3>
                        <p className="text-slate-900">{typedClient.address}</p>
                      </div>
                    )}
                    {typedClient.cuit && (
                      <div>
                        <h3 className="font-semibold text-slate-700">CUIT</h3>
                        <p className="text-slate-900">{typedClient.cuit}</p>
                      </div>
                    )}
                    {typedClient.reference && (
                      <div>
                        <h3 className="font-semibold text-slate-700">Referencia</h3>
                        <p className="text-slate-900">{typedClient.reference}</p>
                      </div>
                    )}
                    {typedClient.notes && (
                      <div className="md:col-span-2">
                        <h3 className="font-semibold text-slate-700">Notas</h3>
                        <p className="text-slate-900">{typedClient.notes}</p>
                      </div>
                    )}
                    {typedClient.contacts &&
                      typedClient.contacts.length > 0 && (
                        <div className="md:col-span-2">
                          <h3 className="font-semibold text-slate-700 mb-2">
                            Personas de Contacto
                          </h3>
                          <div className="space-y-4">
                            {typedClient.contacts.map(
                              (contact: TClientContact, index: number) => (
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
                                          <span className="font-medium">
                                            Email:
                                          </span>{" "}
                                          {contact.email}
                                        </p>
                                      )}
                                      {contact.phone && (
                                        <p className="text-sm text-slate-600">
                                          <span className="font-medium">
                                            Teléfono:
                                          </span>{" "}
                                          {contact.phone}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            )}
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
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewQuote(quote.id)}
                              >
                                Ver
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
        ) : (
          <form onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Información General</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                          Particular
                        </SelectItem>
                        <SelectItem value={EClientType.COMPANY}>
                          Empresa
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.type === EClientType.INDIVIDUAL ? (
                    <div className="space-y-2">
                      <Label htmlFor="name">Nombre completo *</Label>
                      <Input
                        id="name"
                        value={formData.name}
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
                          value={formData.businessName}
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
                          value={formData.fantasyName}
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

                  <div className="space-y-2">
                    <Label htmlFor="reference">Referencia</Label>
                    <Input
                      id="reference"
                      value={formData.reference}
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
                      className="bg-blue-900 hover:bg-blue-600 hover:text-white text-white"
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
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              title="Eliminar"
                              onClick={() => removeContact(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor={`contact-name-${index}`}>
                              Nombre
                            </Label>
                            <Input
                              id={`contact-name-${index}`}
                              value={contact.name}
                              onChange={(e) =>
                                handleContactChange(
                                  index,
                                  "name",
                                  e.target.value
                                )
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`contact-email-${index}`}>
                              Email
                            </Label>
                            <Input
                              id={`contact-email-${index}`}
                              type="email"
                              value={contact.email}
                              onChange={(e) =>
                                handleContactChange(
                                  index,
                                  "email",
                                  e.target.value
                                )
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`contact-phone-${index}`}>
                              Teléfono
                            </Label>
                            <Input
                              id={`contact-phone-${index}`}
                              value={contact.phone}
                              onChange={(e) =>
                                handleContactChange(
                                  index,
                                  "phone",
                                  e.target.value
                                )
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
                                handleContactChange(
                                  index,
                                  "position",
                                  e.target.value
                                )
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
                    className="bg-green-600 hover:bg-green-700 text-white"
                    type="submit"
                    disabled={isLoading}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {isLoading ? "Guardando..." : "Guardar cambios"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelEdit}
                    className="bg-red-500 hover:bg-red-600 text-white"
                  >
                    Cancelar
                  </Button>
              
                </div>
              </CardContent>
            </Card>
          </form>
        )}
      </DialogContent>

      {/* Modal de detalles de presupuesto */}
      <QuoteDetailsModal
        isOpen={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        quoteId={selectedQuoteId}
      />
    </Dialog>
  );
}

"use client";
export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFirestore, useUser } from "reactfire";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ArrowLeft, Calendar as CalendarIcon, Save } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useClients } from "@/hooks/useClients";
import { createCreditNote } from "@/lib/creditNotes";
import { ECreditNoteOriginType } from "@/types/creditNote";

export default function NuevaNotaCreditoPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { data: user } = useUser();
  const { clients, loading: clientsLoading } = useClients();

  const [clientId, setClientId] = useState<string>("");
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [clients]);

  const selectedClient = useMemo(
    () => sortedClients.find((c) => c.id === clientId),
    [sortedClients, clientId],
  );

  const handleSubmit = async () => {
    if (!clientId) {
      toast.error("Seleccioná un cliente");
      return;
    }
    if (!amount || amount <= 0) {
      toast.error("Ingresá un monto mayor a cero");
      return;
    }
    if (!reason.trim()) {
      toast.error("Ingresá un motivo");
      return;
    }
    if (!user?.uid) {
      toast.error("Usuario no identificado");
      return;
    }

    setSaving(true);
    try {
      const id = await createCreditNote(firestore, {
        clientId,
        clientName: selectedClient?.name ?? "",
        clientSection: selectedClient?.section,
        amount,
        reason: reason.trim(),
        originType: ECreditNoteOriginType.MANUAL,
        expiresAt: expiresAt ?? null,
        createdBy: user.uid,
      });
      toast.success("Nota de crédito creada");
      router.push(`/publimar/administracion/notas-credito/${id}`);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Error al crear la nota de crédito",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Nueva nota de crédito</h1>
          <p className="text-slate-600 text-sm mt-1">
            Registrá un saldo a favor del cliente. Podrá aplicarse al crear órdenes de trabajo o facturaciones.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion/notas-credito">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos de la nota</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2 block">Cliente *</Label>
            <Select value={clientId} onValueChange={setClientId} disabled={clientsLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccioná un cliente" />
              </SelectTrigger>
              <SelectContent>
                {sortedClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2 block">Monto *</Label>
            <MoneyInput
              value={amount || 0}
              onValueChange={(n) => setAmount(n)}
              placeholder="0"
            />
          </div>

          <div>
            <Label className="mb-2 block">Motivo *</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: acuerdo verbal por insatisfacción"
            />
          </div>

          <div>
            <Label className="mb-2 block">Vencimiento (opcional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full md:w-64 justify-start text-left font-normal",
                    !expiresAt && "text-slate-500",
                  )}
                >
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {expiresAt ? format(expiresAt, "dd/MM/yyyy", { locale: es }) : "Sin vencimiento"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={expiresAt}
                  onSelect={setExpiresAt}
                  initialFocus
                  locale={es}
                />
                {expiresAt && (
                  <div className="p-2 border-t flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpiresAt(undefined)}
                    >
                      Quitar
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button asChild variant="outline">
              <Link href="/publimar/administracion/notas-credito">Cancelar</Link>
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Guardando..." : "Crear nota de crédito"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

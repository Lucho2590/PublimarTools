"use client";

import { useCallback, useEffect, useState } from "react";
import { useFirestore } from "reactfire";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ClientSelect } from "@/components/admin/ClientSelect";
import { useAuditLog } from "@/hooks/useAuditLog";
import { fetchClientById, sectionLabel } from "@/lib/quoteClient";
import {
  EMPTY_ORDER_IMPACT,
  findOrderClientImpact,
  reassignOrderClient,
  type TOrderClientImpact,
  type TOrderClientRef,
} from "@/lib/orderClient";
import { EClientSection, TClient } from "@/types/client";
import { formatearPrecio } from "@/lib/utils";

interface ChangeOrderClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: TOrderClientRef;
  /** Se llama con el cliente ya escrito, para sincronizar el estado local. */
  onDone?: (newClient: TClient) => void;
}

function plural(n: number, singular: string, pluralForm: string) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function ChangeOrderClientDialog({
  open,
  onOpenChange,
  order,
  onDone,
}: ChangeOrderClientDialogProps) {
  const firestore = useFirestore();
  const { logEvent } = useAuditLog();

  const [selectedId, setSelectedId] = useState("");
  const [selectedClient, setSelectedClient] = useState<TClient | null>(null);
  const [impact, setImpact] = useState<TOrderClientImpact>(EMPTY_ORDER_IMPACT);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset al cerrar para no arrastrar la selección anterior.
  useEffect(() => {
    if (!open) {
      setSelectedId("");
      setSelectedClient(null);
      setImpact(EMPTY_ORDER_IMPACT);
      setSaving(false);
    }
  }, [open]);

  // El impacto depende de la orden, no de qué cliente se elija: se calcula una
  // sola vez al abrir.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingImpact(true);
    findOrderClientImpact(firestore, order)
      .then((found) => {
        if (!cancelled) setImpact(found);
      })
      .catch((err) => {
        console.error("Error al calcular el impacto:", err);
        if (!cancelled) {
          toast.error("No se pudo calcular el impacto del cambio");
          setImpact(EMPTY_ORDER_IMPACT);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingImpact(false);
      });
    return () => {
      cancelled = true;
    };
    // `order` cambia de identidad en cada render de la página; alcanza con id/quoteId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, firestore, order.id, order.quoteId]);

  const handleSelect = useCallback(
    async (clientId: string) => {
      setSelectedId(clientId);
      if (!clientId) {
        setSelectedClient(null);
        return;
      }
      try {
        const client = await fetchClientById(firestore, clientId);
        setSelectedClient(client);
      } catch (err) {
        console.error("Error al traer el cliente:", err);
        toast.error("No se pudo cargar el cliente seleccionado");
        setSelectedClient(null);
      }
    },
    [firestore],
  );

  const handleConfirm = async () => {
    if (!selectedClient) return;
    setSaving(true);
    try {
      await reassignOrderClient(firestore, logEvent, {
        order,
        newClient: selectedClient,
        impact,
      });
      toast.success(`Cliente cambiado a ${selectedClient.name}`);
      onDone?.(selectedClient);
      onOpenChange(false);
    } catch (err) {
      console.error("Error al cambiar el cliente:", err);
      toast.error("Error al cambiar el cliente de la orden");
    } finally {
      setSaving(false);
    }
  };

  const sameClient = !!selectedClient && selectedClient.id === order.clientId;
  const otherSection =
    !!selectedClient &&
    !!selectedClient.section &&
    selectedClient.section !== EClientSection.BANDERAS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cambiar cliente de la orden</DialogTitle>
          <DialogDescription>
            Orden {order.number} — actualmente asignada a{" "}
            <strong>{order.clientName || "sin cliente"}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nuevo cliente</Label>
            <ClientSelect
              value={selectedId}
              onChange={handleSelect}
              section={EClientSection.BANDERAS}
              disabled={saving}
            />
          </div>

          {loadingImpact && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculando impacto…
            </div>
          )}

          {sameClient && (
            <p className="text-sm text-gray-500">
              Es el cliente que ya tiene la orden.
            </p>
          )}

          {selectedClient && !loadingImpact && !sameClient && (
            <>
              {otherSection && (
                <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>{selectedClient.name}</strong> es un cliente de{" "}
                    {sectionLabel(selectedClient.section)}. La orden va a seguir
                    en Banderas, pero sus datos de contacto no se van a completar
                    automáticamente desde la ficha del cliente.
                  </div>
                </div>
              )}

              {impact.kind === "quote" ? (
                <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p>
                      Esta orden viene del presupuesto{" "}
                      <strong>{impact.quote.number}</strong>. También se va a
                      reasignar ese presupuesto y todo lo que generó:
                    </p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      <li>
                        {plural(impact.impact.orders.length, "orden", "órdenes")} (
                        {impact.impact.orders.map((o) => o.number).join(", ")})
                      </li>
                      {impact.impact.sales.length > 0 && (
                        <li>
                          {plural(impact.impact.sales.length, "venta", "ventas")} (
                          {impact.impact.sales.map((s) => s.number).join(", ")})
                        </li>
                      )}
                      {impact.impact.billings.length > 0 && (
                        <li>
                          {plural(
                            impact.impact.billings.length,
                            "facturación",
                            "facturaciones",
                          )}{" "}
                          (
                          {impact.impact.billings
                            .map((b) =>
                              b.totalPaid > 0
                                ? `${b.number} — ${formatearPrecio(b.totalPaid)} ya cobrados`
                                : b.number,
                            )
                            .join(", ")}
                          )
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border p-3 text-sm space-y-1">
                  {impact.sales.length === 0 ? (
                    <p className="text-gray-600">
                      Esta orden no tiene ventas asociadas.
                    </p>
                  ) : (
                    <>
                      <p className="font-medium text-gray-700">
                        Se reasignarán también:
                      </p>
                      <ul className="list-disc pl-5 text-gray-600 space-y-0.5">
                        <li>
                          {plural(impact.sales.length, "venta", "ventas")} (
                          {impact.sales.map((s) => s.number).join(", ")})
                        </li>
                      </ul>
                    </>
                  )}
                </div>
              )}

              {impact.creditNotes.length > 0 && (
                <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    Hay {impact.creditNotes.length} nota(s) de crédito aplicadas (
                    {impact.creditNotes.map((n) => n.number).join(", ")}) que{" "}
                    <strong>no se reasignan</strong>: siguen perteneciendo al
                    cliente que las recibió. Requieren revisión manual.
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500">
                Los datos cargados a mano en la orden (CUIT, dirección, teléfono,
                email, referencia) no se modifican. El cambio se guarda
                inmediatamente.
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedClient || sameClient || loadingImpact || saving}
          >
            {saving ? "Cambiando..." : "Cambiar cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import {
  EMPTY_IMPACT,
  fetchClientById,
  findQuoteClientImpact,
  impactIsEmpty,
  reassignQuoteClient,
  sectionLabel,
  type TQuoteClientImpact,
  type TQuoteClientSnapshot,
} from "@/lib/quoteClient";
import { TClient } from "@/types/client";
import { formatearPrecio } from "@/lib/utils";

interface ChangeQuoteClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: { id: string; number: string; client?: TQuoteClientSnapshot | null };
  /** Se llama con el snapshot ya escrito, para sincronizar el estado local. */
  onDone?: (newClient: TClient) => void;
}

export function ChangeQuoteClientDialog({
  open,
  onOpenChange,
  quote,
  onDone,
}: ChangeQuoteClientDialogProps) {
  const firestore = useFirestore();
  const { logEvent } = useAuditLog();

  const [selectedId, setSelectedId] = useState("");
  const [selectedClient, setSelectedClient] = useState<TClient | null>(null);
  const [impact, setImpact] = useState<TQuoteClientImpact>(EMPTY_IMPACT);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentClient = quote.client;
  const currentSection = currentClient?.section;

  // Reset al cerrar para no arrastrar la selección anterior.
  useEffect(() => {
    if (!open) {
      setSelectedId("");
      setSelectedClient(null);
      setImpact(EMPTY_IMPACT);
      setSaving(false);
    }
  }, [open]);

  // El impacto depende del presupuesto, no de qué cliente se elija: se calcula
  // una sola vez al abrir en vez de en cada selección.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingImpact(true);
    findQuoteClientImpact(firestore, quote.id)
      .then((found) => {
        if (!cancelled) setImpact(found);
      })
      .catch((err) => {
        console.error("Error al calcular el impacto:", err);
        if (!cancelled) {
          toast.error("No se pudo calcular el impacto del cambio");
          setImpact(EMPTY_IMPACT);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingImpact(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, firestore, quote.id]);

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
      await reassignQuoteClient(firestore, logEvent, {
        quoteId: quote.id,
        quoteNumber: quote.number,
        previousClient: currentClient,
        newClient: selectedClient,
        impact,
      });
      toast.success(`Cliente cambiado a ${selectedClient.name}`);
      onDone?.(selectedClient);
      onOpenChange(false);
    } catch (err) {
      console.error("Error al cambiar el cliente:", err);
      toast.error("Error al cambiar el cliente del presupuesto");
    } finally {
      setSaving(false);
    }
  };

  const sameClient = !!selectedClient && selectedClient.id === currentClient?.id;
  const movesSection =
    !!selectedClient &&
    !!currentSection &&
    selectedClient.section !== currentSection;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cambiar cliente del presupuesto</DialogTitle>
          <DialogDescription>
            Presupuesto {quote.number} — actualmente asignado a{" "}
            <strong>{currentClient?.name || "sin cliente"}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nuevo cliente</Label>
            <ClientSelect
              value={selectedId}
              onChange={handleSelect}
              section={currentSection}
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
              Es el cliente que ya tiene el presupuesto.
            </p>
          )}

          {selectedClient && !loadingImpact && !sameClient && (
            <>
              {movesSection && (
                <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    Este presupuesto pasará de{" "}
                    <strong>{sectionLabel(currentSection)}</strong> a{" "}
                    <strong>{sectionLabel(selectedClient.section)}</strong>. Va a dejar
                    de aparecer en el listado de presupuestos de{" "}
                    {sectionLabel(currentSection)}.
                  </div>
                </div>
              )}

              <div className="rounded-md border p-3 text-sm space-y-1">
                {impactIsEmpty(impact) ? (
                  <p className="text-gray-600">
                    Este presupuesto no tiene órdenes, ventas ni facturaciones
                    asociadas.
                  </p>
                ) : (
                  <>
                    <p className="font-medium text-gray-700">
                      Se reasignarán también:
                    </p>
                    <ul className="list-disc pl-5 text-gray-600 space-y-0.5">
                      {impact.orders.length > 0 && (
                        <li>
                          {impact.orders.length}{" "}
                          {impact.orders.length === 1 ? "orden" : "órdenes"} (
                          {impact.orders.map((o) => o.number).join(", ")})
                        </li>
                      )}
                      {impact.sales.length > 0 && (
                        <li>
                          {impact.sales.length}{" "}
                          {impact.sales.length === 1 ? "venta" : "ventas"} (
                          {impact.sales.map((s) => s.number).join(", ")})
                        </li>
                      )}
                      {impact.billings.length > 0 && (
                        <li>
                          {impact.billings.length}{" "}
                          {impact.billings.length === 1
                            ? "facturación"
                            : "facturaciones"}{" "}
                          (
                          {impact.billings
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
                  </>
                )}
              </div>

              {impact.creditNotes.length > 0 && (
                <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    Hay {impact.creditNotes.length} nota(s) de crédito aplicadas a
                    este presupuesto (
                    {impact.creditNotes.map((n) => n.number).join(", ")}) que{" "}
                    <strong>no se reasignan</strong>: siguen perteneciendo al
                    cliente que las recibió. Requieren revisión manual.
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500">
                Los datos cargados a mano en las órdenes (CUIT, dirección,
                teléfono, email, referencia) no se modifican.
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

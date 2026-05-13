"use client";

import { useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";
import { useClientAvailableCredit } from "@/hooks/useCreditNotes";
import { formatearPrecio } from "@/lib/utils";

export interface ClientCreditBannerProps {
  clientId: string | null | undefined;
  /** Monto total del documento que se está creando, para calcular sobrante perdido. */
  documentTotal?: number;
  /** Id de la NC actualmente seleccionada por el form. */
  selectedNoteId?: string | null;
  /** Llamado cuando el usuario aplica/desaplica una nota. */
  onSelect: (noteId: string | null) => void;
}

/**
 * Banner reutilizable que muestra el saldo a favor de un cliente
 * y permite seleccionar una nota de crédito para aplicar al documento.
 *
 * Reglas:
 * - No se renderiza si el cliente no tiene saldo disponible.
 * - Solo se puede aplicar UNA nota por documento (se usa completa).
 * - Si la nota supera el total, se muestra el sobrante que se perdería.
 */
export function ClientCreditBanner({
  clientId,
  documentTotal,
  selectedNoteId,
  onSelect,
}: ClientCreditBannerProps) {
  const { notes, total, loading } = useClientAvailableCredit(clientId);

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );

  // Si cambia el cliente o desaparece la nota seleccionada, desaplicar.
  useEffect(() => {
    if (selectedNoteId && !notes.find((n) => n.id === selectedNoteId)) {
      onSelect(null);
    }
  }, [notes, selectedNoteId, onSelect]);

  if (!clientId || loading || total <= 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Wallet className="h-5 w-5 text-amber-800" />
            <span className="font-semibold text-amber-900">
              Este cliente tiene saldo a favor: {formatearPrecio(total)}
            </span>
            <Badge variant="secondary" className="bg-amber-200 text-amber-900 hover:bg-amber-200">
              {notes.length} nota{notes.length === 1 ? "" : "s"}
            </Badge>
          </div>

          {selectedNote ? (
            <div className="flex items-center justify-between gap-2 flex-wrap rounded-md border border-amber-300 bg-white px-3 py-2">
              <div className="text-sm">
                <span className="text-slate-600">Aplicada al guardar:</span>{" "}
                <span className="font-medium">{selectedNote.number}</span>{" "}
                <span className="text-slate-600">·</span>{" "}
                <span className="font-semibold">{formatearPrecio(selectedNote.amount)}</span>
                {documentTotal != null && selectedNote.amount > documentTotal && (
                  <span className="block text-xs text-amber-700">
                    Se perderá un sobrante de {formatearPrecio(selectedNote.amount - documentTotal)} (la NC se usa completa).
                  </span>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => onSelect(null)}>
                Quitar
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-amber-900">
                Elegí una nota para aplicarla al guardar el documento. Se usa completa: si supera el total, el sobrante se pierde.
              </p>
              <div className="flex flex-col gap-2">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2"
                  >
                    <div className="text-sm">
                      <span className="font-medium">{n.number}</span>{" "}
                      <span className="text-slate-600">·</span>{" "}
                      <span className="font-semibold">{formatearPrecio(n.amount)}</span>
                      {n.reason && (
                        <span className="block text-xs text-slate-500">{n.reason}</span>
                      )}
                    </div>
                    <Button size="sm" onClick={() => onSelect(n.id)}>
                      Aplicar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

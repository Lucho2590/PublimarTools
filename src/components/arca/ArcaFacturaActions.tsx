"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "reactfire";
import { FileDown, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { ArcaApiError, emitirNotaCredito, getComprobante, newRequestId } from "@/lib/arca/api";
import { downloadArcaInvoicePdf } from "@/lib/arca/pdf";
import { cbteTipoLabel } from "@/lib/arca/constants";
import { round2 } from "@/lib/arca/amounts";
import { cn, formatearPrecio } from "@/lib/utils";
import type { TArcaInvoice } from "@/types/arca";
import type { TFactura } from "@/types/order";

/** Badge "ARCA · CAE" para una factura emitida por web service. */
export function ArcaBadge({ factura }: { factura: TFactura }) {
  if (!factura.arcaInvoiceId) return null;
  return (
    <span
      className="inline-flex items-center rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[11px] font-medium"
      title={factura.cae ? `CAE ${factura.cae}` : undefined}
    >
      ARCA{factura.cae ? ` · CAE ${factura.cae}` : ""}
    </span>
  );
}

/** Descargar PDF + emitir nota de crédito para una factura ARCA. */
export function ArcaFacturaActions({ factura, className }: { factura: TFactura; className?: string }) {
  const { data: user } = useUser();
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [ncOpen, setNcOpen] = useState(false);
  if (!factura.arcaInvoiceId) return null;

  const pdf = async () => {
    setLoadingPdf(true);
    try {
      const inv = await getComprobante(user, factura.arcaInvoiceId!);
      await downloadArcaInvoicePdf(inv);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    } finally {
      setLoadingPdf(false);
    }
  };

  return (
    <div className={cn("flex gap-1", className)}>
      <Button type="button" size="sm" variant="outline" onClick={pdf} disabled={loadingPdf} title="Descargar PDF">
        {loadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      </Button>
      {factura.kind !== "nc" && (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setNcOpen(true)}
            title="Emitir nota de crédito"
            className="text-red-600 hover:text-red-700"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <NotaCreditoDialog open={ncOpen} onOpenChange={setNcOpen} facturaId={factura.arcaInvoiceId} />
        </>
      )}
    </div>
  );
}

function NotaCreditoDialog({
  open,
  onOpenChange,
  facturaId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  facturaId: string;
}) {
  const { data: user } = useUser();
  const [factura, setFactura] = useState<TArcaInvoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [parcial, setParcial] = useState(false);
  const [monto, setMonto] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emitted, setEmitted] = useState<TArcaInvoice | null>(null);
  const requestIdRef = useRef(newRequestId());

  useEffect(() => {
    if (!open) return;
    setParcial(false);
    setMonto(0);
    setMotivo("");
    setConfirming(false);
    setError(null);
    setEmitted(null);
    requestIdRef.current = newRequestId();
    setLoading(true);
    getComprobante(user, facturaId)
      .then(setFactura)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar la factura"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facturaId, user?.uid]);

  const restante = factura ? round2(factura.impTotal - (Number(factura.ncTotal) || 0)) : 0;
  // Con NCs previas, lo que queda se emite como ajuste (no como anulación con detalle).
  const esTotal = !parcial;
  const importe = esTotal ? restante : round2(monto);
  const letra = factura?.letra ?? "";
  const blocker = !factura
    ? null
    : factura.anulada
    ? "La factura ya está anulada"
    : importe <= 0
    ? "El monto tiene que ser mayor a cero"
    : importe > restante + 0.009
    ? `No puede superar ${formatearPrecio(restante)}`
    : null;

  const emit = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setEmitting(true);
    setError(null);
    try {
      const nc = await emitirNotaCredito(user, {
        requestId: requestIdRef.current,
        facturaId,
        ...(esTotal ? {} : { monto: importe }),
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      });
      setEmitted(nc);
      toast.success(`Nota de Crédito ${nc.letra} ${nc.numeroFormateado} autorizada`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo emitir la nota de crédito");
      if (e instanceof ArcaApiError && e.status !== 502 && e.status !== 409) requestIdRef.current = newRequestId();
    } finally {
      setEmitting(false);
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !emitting && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nota de crédito {letra}</DialogTitle>
          <DialogDescription>
            {factura
              ? `${cbteTipoLabel(factura.cbteTipo)} ${factura.numeroFormateado} · ${factura.receptor.razonSocial}`
              : "Cargando factura…"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : emitted ? (
          <div className="space-y-4">
            <p className="text-sm rounded border border-emerald-200 bg-emerald-50 text-emerald-900 px-3 py-2">
              Nota de Crédito {emitted.letra} {emitted.numeroFormateado} por {formatearPrecio(emitted.impTotal)}
              {" "}· CAE {emitted.cae}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Button
                onClick={() =>
                  downloadArcaInvoicePdf(emitted).catch((e) =>
                    toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF"),
                  )
                }
              >
                <FileDown className="h-4 w-4 mr-1.5" />
                Descargar PDF
              </Button>
            </DialogFooter>
          </div>
        ) : factura ? (
          <div className="space-y-4">
            <div className="text-sm rounded bg-slate-50 border p-3 space-y-1">
              <div className="flex justify-between">
                <span>Total factura</span>
                <span>{formatearPrecio(factura.impTotal)}</span>
              </div>
              {Number(factura.ncTotal) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Notas de crédito previas</span>
                  <span>-{formatearPrecio(Number(factura.ncTotal))}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span>Disponible para acreditar</span>
                <span>{formatearPrecio(restante)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              {[
                [false, Number(factura.ncTotal) > 0 ? "Todo lo disponible" : "Anular toda la factura"],
                [true, "Monto parcial"],
              ].map(([value, text]) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => {
                    setParcial(value as boolean);
                    setConfirming(false);
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    parcial === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  {text as string}
                </button>
              ))}
            </div>

            {parcial && (
              <div className="space-y-1.5">
                <Label>Monto (IVA incluido)</Label>
                <MoneyInput value={monto} onValueChange={setMonto} placeholder="0" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Motivo (opcional)</Label>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: error en el monto" />
            </div>

            {!parcial && !(Number(factura.ncTotal) > 0) && (
              <p className="text-xs text-muted-foreground">
                Anula la factura completa. Si incluía pagos de la orden, vuelven a quedar disponibles para facturar.
              </p>
            )}
            {blocker && <p className="text-xs rounded bg-red-50 text-red-700 px-2 py-1.5">{blocker}</p>}
            {error && <p className="text-sm rounded border border-red-200 bg-red-50 text-red-800 px-3 py-2">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={emitting}>
                Cancelar
              </Button>
              <Button
                variant={confirming ? "destructive" : "default"}
                onClick={emit}
                disabled={emitting || !!blocker}
              >
                {emitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Emitiendo…
                  </>
                ) : confirming ? (
                  `Confirmar NC ${letra} por ${formatearPrecio(importe)}`
                ) : (
                  "Emitir nota de crédito"
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          error && <p className="text-sm rounded border border-red-200 bg-red-50 text-red-800 px-3 py-2">{error}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

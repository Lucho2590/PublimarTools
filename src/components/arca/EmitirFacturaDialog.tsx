"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "reactfire";
import { AlertTriangle, CheckCircle2, FileDown, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CuitInput } from "@/components/cuit-input";
import { ArcaPadronBadge, ValidarCuitButton, padronSnapshot } from "./ValidarCuitButton";
import { ArcaApiError, consultarPadron, emitirFactura, newRequestId } from "@/lib/arca/api";
import {
  buildSingleItem,
  buildTotalItems,
  invoicedNet,
  listInvoiceablePayments,
  round2,
  splitIva,
  summarizeLines,
} from "@/lib/arca/amounts";
import {
  CONDICION_FISCAL,
  DOC_TIPO,
  LEYENDA_MONOTRIBUTO,
  LEYENDA_TRANSPARENCIA,
  leyendasFor,
} from "@/lib/arca/constants";
import { downloadArcaInvoicePdf } from "@/lib/arca/pdf";
import { cleanCuit, formatCuit, isValidCuitChecksum } from "@/lib/cuit";
import { taxConditionOptions } from "@/lib/taxCondition";
import { cn, formatDate, formatearPrecio } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS, EPaymentMethod } from "@/types/sale";
import { EClientTaxCondition, TClient } from "@/types/client";
import type {
  TArcaAlcance,
  TArcaInvoice,
  TArcaPadronSnapshot,
  TArcaReceptorOrigen,
  TArcaSource,
} from "@/types/arca";

/** Revalidar en ARCA si la última consulta tiene más de 30 días. */
const PADRON_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type TReceptorOption = {
  key: string;
  label: string;
  origen: TArcaReceptorOrigen;
  razonIndex?: number;
  docTipo: number;
  docNro: string;
  razonSocial: string;
  condicion?: EClientTaxCondition;
  domicilio: string;
  padron?: TArcaPadronSnapshot;
};

type TForm = {
  optionKey: string;
  docTipo: number;
  docNro: string;
  razonSocial: string;
  condicion?: EClientTaxCondition;
  domicilio: string;
  padron?: TArcaPadronSnapshot;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: TArcaSource;
  /** Orden o venta tal como viene de Firestore (con id). */
  doc: Record<string, any> & { id: string };
  /** Ficha del cliente (para sus razones sociales y condición IVA). */
  client?: TClient | null;
  onEmitted?: (invoice: TArcaInvoice) => void;
};

function buildReceptorOptions(doc: Props["doc"], client?: TClient | null): TReceptorOption[] {
  const options: TReceptorOption[] = [];
  const docCuit = cleanCuit(doc.cuit);
  const clientCuit = cleanCuit(client?.cuit);
  const clientName = client?.businessName || client?.name || doc.clientName || "";

  if (docCuit && docCuit !== clientCuit) {
    options.push({
      key: "documento",
      label: `Datos ${doc.number ? `del documento N° ${doc.number}` : "del documento"} · ${formatCuit(docCuit)}`,
      origen: "documento",
      docTipo: DOC_TIPO.CUIT,
      docNro: docCuit,
      razonSocial: doc.clientName || clientName,
      condicion: client?.taxCondition,
      domicilio: doc.direccion || client?.address || "",
    });
  }
  if (client) {
    const dni = String(client.dni || "").replace(/\D/g, "");
    options.push({
      key: "cliente",
      label: `${clientName || "Cliente"}${clientCuit ? ` · ${formatCuit(clientCuit)}` : dni ? ` · DNI ${dni}` : ""}`,
      origen: "cliente",
      docTipo: clientCuit ? DOC_TIPO.CUIT : dni ? DOC_TIPO.DNI : DOC_TIPO.CONSUMIDOR_FINAL,
      docNro: clientCuit || dni,
      razonSocial: clientName,
      condicion: client.taxCondition,
      domicilio: client.address || doc.direccion || "",
      padron: client.arcaPadron,
    });
    (client.razonesSociales || []).forEach((rs, i) => {
      const cuit = cleanCuit(rs.cuit);
      options.push({
        key: `rs-${i}`,
        label: `${rs.razonSocial}${cuit ? ` · ${formatCuit(cuit)}` : ""}`,
        origen: "razonSocialAlt",
        razonIndex: i,
        docTipo: cuit ? DOC_TIPO.CUIT : DOC_TIPO.CONSUMIDOR_FINAL,
        docNro: cuit,
        razonSocial: rs.razonSocial,
        condicion: rs.taxCondition,
        domicilio: rs.domicilio || "",
        padron: rs.arcaPadron,
      });
    });
  } else if (docCuit) {
    options.push({
      key: "documento",
      label: `${doc.clientName || "Datos del documento"} · ${formatCuit(docCuit)}`,
      origen: "documento",
      docTipo: DOC_TIPO.CUIT,
      docNro: docCuit,
      razonSocial: doc.clientName || "",
      domicilio: doc.direccion || "",
    });
  }
  options.push({
    key: "manual",
    label: "Otro CUIT / consumidor final",
    origen: "manual",
    docTipo: DOC_TIPO.CUIT,
    docNro: "",
    razonSocial: "",
    domicilio: "",
  });
  return options;
}

function formFromOption(o: TReceptorOption): TForm {
  return {
    optionKey: o.key,
    docTipo: o.docTipo,
    docNro: o.docNro,
    razonSocial: o.razonSocial,
    condicion: o.condicion,
    domicilio: o.domicilio,
    padron: o.padron,
  };
}

const padronIsFresh = (p?: TArcaPadronSnapshot) =>
  !!p?.validatedAt && Date.now() - new Date(p.validatedAt).getTime() < PADRON_MAX_AGE_MS;

export function EmitirFacturaDialog({ open, onOpenChange, source, doc, client, onEmitted }: Props) {
  const { data: user } = useUser();
  const options = useMemo(() => buildReceptorOptions(doc, client), [doc, client]);
  const [form, setForm] = useState<TForm>(() => formFromOption(options[0]));
  const [padronNote, setPadronNote] = useState<string | null>(null);
  const [autoValidating, setAutoValidating] = useState(false);

  const total = round2(Number(source === "sale" ? doc.finalTotal ?? doc.total : doc.total) || 0);
  const facturado = invoicedNet(doc.facturas);
  const pendiente = Math.max(0, round2(total - facturado));
  const payments = useMemo(() => (source === "order" ? listInvoiceablePayments(doc) : []), [doc, source]);
  const freePayments = payments.filter((p) => !p.arcaInvoiceId);

  const defaultAlcance: TArcaAlcance =
    freePayments.length > 0 ? "pago" : facturado > 0.009 ? "saldo" : "total";
  const [alcance, setAlcance] = useState<TArcaAlcance>(defaultAlcance);
  const [pagoKeys, setPagoKeys] = useState<string[]>([]);
  const [montoLibre, setMontoLibre] = useState(0);
  const [descripcion, setDescripcion] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emitted, setEmitted] = useState<TArcaInvoice | null>(null);
  const requestIdRef = useRef<string>(newRequestId());

  // Reset al abrir.
  useEffect(() => {
    if (!open) return;
    setForm(formFromOption(options[0]));
    setPadronNote(null);
    setAlcance(defaultAlcance);
    setPagoKeys(freePayments.length === 1 ? [freePayments[0].key] : []);
    setMontoLibre(0);
    setDescripcion("");
    setConfirming(false);
    setError(null);
    setEmitted(null);
    requestIdRef.current = newRequestId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const label = source === "order" ? "Orden" : "Venta";
  const docNumber = doc.number ? String(doc.number) : doc.id;
  const lines: any[] = Array.isArray(doc.items) ? doc.items : [];
  const defaultDesc = `Pago a cuenta ${label} N° ${docNumber}${lines.length ? ` – ${summarizeLines(lines)}` : ""}`;

  const monto = (() => {
    switch (alcance) {
      case "total":
        return total;
      case "saldo":
        return pendiente;
      case "pago":
        return round2(payments.filter((p) => pagoKeys.includes(p.key)).reduce((s, p) => s + p.amount, 0));
      case "libre":
        return round2(montoLibre);
    }
  })();
  const items =
    alcance === "total"
      ? buildTotalItems(lines, total)
      : buildSingleItem(
          descripcion || (alcance === "saldo" ? `Saldo ${label} N° ${docNumber}` : defaultDesc),
          monto,
        );
  const { neto, iva } = splitIva(monto);
  const fiscal = form.condicion ? CONDICION_FISCAL[form.condicion] : null;
  const leyendas = form.condicion ? leyendasFor(form.condicion) : [];

  const applyPadron = (snapshot: TArcaPadronSnapshot) => {
    setForm((prev) => {
      if (prev.condicion && prev.condicion !== snapshot.condicion) {
        setPadronNote(
          `ARCA informa ${CONDICION_FISCAL[snapshot.condicion].label}; en la ficha figuraba ${CONDICION_FISCAL[prev.condicion].label}. Se usa la de ARCA.`,
        );
      } else {
        setPadronNote(null);
      }
      return {
        ...prev,
        razonSocial: snapshot.razonSocial || prev.razonSocial,
        domicilio: snapshot.domicilio || prev.domicilio,
        condicion: snapshot.condicion,
        padron: snapshot,
      };
    });
  };

  const selectedOption = options.find((o) => o.key === form.optionKey);
  const cacheTarget =
    client?.id && selectedOption && cleanCuit(form.docNro) === cleanCuit(selectedOption.docNro)
      ? selectedOption.origen === "cliente"
        ? { clientId: client.id }
        : selectedOption.origen === "razonSocialAlt"
        ? { clientId: client.id, razonIndex: selectedOption.razonIndex ?? null }
        : undefined
      : undefined;

  // Validación automática en el padrón si la consulta guardada está vencida.
  useEffect(() => {
    if (!open || form.docTipo !== DOC_TIPO.CUIT || !isValidCuitChecksum(form.docNro)) return;
    if (padronIsFresh(form.padron)) return;
    let cancelled = false;
    setAutoValidating(true);
    consultarPadron(user, form.docNro, cacheTarget)
      .then((r) => {
        if (!cancelled) applyPadron(padronSnapshot(r));
      })
      .catch(() => undefined) // el botón manual muestra el error si hace falta
      .finally(() => !cancelled && setAutoValidating(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.optionKey, form.docTipo, form.docNro]);

  // Bloqueos antes de emitir.
  const blockers: string[] = [];
  if (!form.condicion) blockers.push("Falta la condición frente al IVA del receptor");
  if (fiscal?.requiresCuit && form.docTipo !== DOC_TIPO.CUIT)
    blockers.push(`${fiscal.label} lleva Factura A: requiere CUIT`);
  if (form.docTipo === DOC_TIPO.CUIT && !isValidCuitChecksum(form.docNro)) blockers.push("El CUIT no es válido");
  if (form.docTipo === DOC_TIPO.DNI && !/^\d{7,8}$/.test(form.docNro)) blockers.push("El DNI no es válido");
  if (form.docTipo === DOC_TIPO.CONSUMIDOR_FINAL && form.condicion !== EClientTaxCondition.CONSUMIDOR_FINAL)
    blockers.push("Sin documento solo se puede facturar a consumidor final");
  if (form.docTipo !== DOC_TIPO.CONSUMIDOR_FINAL && !form.razonSocial.trim())
    blockers.push("Falta la razón social / nombre");
  if (monto <= 0) blockers.push(alcance === "pago" ? "Elegí al menos un pago" : "El monto tiene que ser mayor a cero");
  if (monto > pendiente + 0.009)
    blockers.push(`El monto supera lo pendiente de facturar (${formatearPrecio(pendiente)})`);
  if (alcance === "total" && facturado > 0.009) blockers.push("Ya hay facturas: facturá el saldo o un monto libre");
  const warnings: string[] = [];
  if (form.padron && form.padron.estadoClave && form.padron.estadoClave.toUpperCase() !== "ACTIVO")
    warnings.push(`ARCA informa la clave fiscal del receptor como ${form.padron.estadoClave}`);
  if (!doc.applyIVA && alcance === "total")
    warnings.push("Esta operación no tenía el IVA desglosado: el total se toma como precio final con IVA incluido.");

  const emit = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setEmitting(true);
    setError(null);
    try {
      const invoice = await emitirFactura(user, {
        requestId: requestIdRef.current,
        source,
        sourceId: doc.id,
        receptor: {
          docTipo: form.docTipo,
          docNro: form.docTipo === DOC_TIPO.CONSUMIDOR_FINAL ? "0" : form.docNro,
          razonSocial: form.razonSocial,
          condicion: form.condicion!,
          domicilio: form.domicilio,
          origen: selectedOption?.origen || "manual",
        },
        alcance,
        ...(alcance === "pago" ? { pagoKeys } : {}),
        ...(alcance === "libre" ? { monto } : {}),
        ...(alcance !== "total" && descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
      });
      setEmitted(invoice);
      onEmitted?.(invoice);
      toast.success(`${invoice.letra === "A" ? "Factura A" : "Factura B"} ${invoice.numeroFormateado} autorizada`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo emitir la factura";
      setError(msg);
      // Rechazo definitivo: el próximo intento es un comprobante nuevo.
      // Error transitorio (sin respuesta de ARCA): se reintenta con el mismo id.
      if (e instanceof ArcaApiError && e.status !== 502 && e.status !== 409) requestIdRef.current = newRequestId();
    } finally {
      setEmitting(false);
      setConfirming(false);
    }
  };

  const downloadPdf = async () => {
    if (!emitted) return;
    try {
      await downloadArcaInvoicePdf(emitted);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !emitting && onOpenChange(o)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Emitir factura en ARCA
          </DialogTitle>
          <DialogDescription>
            {label} N° {docNumber} · Facturado {formatearPrecio(facturado)} de {formatearPrecio(total)}
          </DialogDescription>
        </DialogHeader>

        {emitted ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
              <div className="text-sm space-y-1">
                <p className="font-semibold text-emerald-900">
                  {emitted.letra === "A" ? "Factura A" : "Factura B"} {emitted.numeroFormateado} autorizada
                </p>
                <p className="text-emerald-800">
                  {emitted.receptor.razonSocial} · {formatearPrecio(emitted.impTotal)}
                </p>
                <p className="text-emerald-800">
                  CAE {emitted.cae} · vence {emitted.caeVto?.split("-").reverse().join("/")}
                </p>
                {emitted.environment !== "produccion" && (
                  <p className="text-amber-700 font-medium">Homologación: comprobante de prueba sin validez fiscal.</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Button onClick={downloadPdf}>
                <FileDown className="h-4 w-4 mr-1.5" />
                Descargar PDF
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5 py-1">
            {/* ¿A quién? */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold">¿A quién se factura?</h4>
              <Select
                value={form.optionKey}
                onValueChange={(key) => {
                  const o = options.find((x) => x.key === key);
                  if (o) {
                    setForm(formFromOption(o));
                    setPadronNote(null);
                    setConfirming(false);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Documento</Label>
                  <div className="flex gap-2">
                    <Select
                      value={String(form.docTipo)}
                      onValueChange={(v) => setForm((p) => ({ ...p, docTipo: Number(v), docNro: "", padron: undefined }))}
                    >
                      <SelectTrigger className="w-28 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={String(DOC_TIPO.CUIT)}>CUIT</SelectItem>
                        <SelectItem value={String(DOC_TIPO.DNI)}>DNI</SelectItem>
                        <SelectItem value={String(DOC_TIPO.CONSUMIDOR_FINAL)}>Sin doc.</SelectItem>
                      </SelectContent>
                    </Select>
                    {form.docTipo === DOC_TIPO.CUIT ? (
                      <CuitInput
                        value={form.docNro}
                        onValueChange={(d) => setForm((p) => ({ ...p, docNro: d, padron: undefined }))}
                      />
                    ) : form.docTipo === DOC_TIPO.DNI ? (
                      <Input
                        value={form.docNro}
                        inputMode="numeric"
                        maxLength={8}
                        placeholder="DNI"
                        onChange={(e) => setForm((p) => ({ ...p, docNro: e.target.value.replace(/\D/g, "") }))}
                      />
                    ) : (
                      <Input value="Consumidor final" disabled />
                    )}
                  </div>
                  {form.docTipo === DOC_TIPO.CUIT && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <ValidarCuitButton
                        cuit={form.docNro}
                        cache={cacheTarget}
                        onResult={(r) => applyPadron(padronSnapshot(r))}
                      />
                      {autoValidating ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Consultando ARCA…
                        </span>
                      ) : (
                        <ArcaPadronBadge snapshot={form.padron} />
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Condición frente al IVA</Label>
                  <Select
                    value={form.condicion ?? "none"}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, condicion: v === "none" ? undefined : (v as EClientTaxCondition) }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar" />
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
                <div className="space-y-1.5">
                  <Label>Razón social / Nombre</Label>
                  <Input
                    value={form.razonSocial}
                    onChange={(e) => setForm((p) => ({ ...p, razonSocial: e.target.value }))}
                    placeholder={form.docTipo === DOC_TIPO.CONSUMIDOR_FINAL ? "Consumidor Final" : ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Domicilio</Label>
                  <Input
                    value={form.domicilio}
                    onChange={(e) => setForm((p) => ({ ...p, domicilio: e.target.value }))}
                  />
                </div>
              </div>
              {padronNote && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  {padronNote}
                </p>
              )}
            </section>

            {/* ¿Cuánto? */}
            <section className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">¿Qué se factura?</h4>
                <span className="text-xs text-muted-foreground">
                  Pendiente de facturar: <b>{formatearPrecio(pendiente)}</b>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    source === "order" && payments.length > 0 ? ["pago", "Un pago registrado"] : null,
                    ["saldo", "Lo pendiente"],
                    facturado <= 0.009 ? ["total", "El total con detalle"] : null,
                    ["libre", "Monto libre"],
                  ].filter(Boolean) as [TArcaAlcance, string][]
                ).map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setAlcance(value);
                      setConfirming(false);
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      alcance === value
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    {text}
                  </button>
                ))}
              </div>

              {alcance === "pago" && (
                <div className="rounded-md border divide-y">
                  {payments.map((p) => {
                    const invoiced = !!p.arcaInvoiceId;
                    const checked = pagoKeys.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 text-sm",
                          invoiced ? "opacity-60" : "cursor-pointer hover:bg-slate-50",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={invoiced}
                          onCheckedChange={(c) => {
                            setConfirming(false);
                            setPagoKeys((prev) => (c ? [...prev, p.key] : prev.filter((k) => k !== p.key)));
                          }}
                        />
                        <span className="w-20 text-muted-foreground">{formatDate(p.date ?? doc.createdAt)}</span>
                        <span className="flex-1">
                          {p.type === "seña" ? "Seña" : "Pago"} ·{" "}
                          {PAYMENT_METHOD_LABELS[p.method as EPaymentMethod] || String(p.method)}
                        </span>
                        <span className="font-medium">{formatearPrecio(p.amount)}</span>
                        {invoiced && (
                          <span className="text-xs rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5">Facturado</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}

              {alcance === "libre" && (
                <div className="space-y-1.5 max-w-xs">
                  <Label>Monto (IVA incluido)</Label>
                  <MoneyInput value={montoLibre} onValueChange={(n) => setMontoLibre(n)} placeholder="0" />
                </div>
              )}

              {alcance !== "total" && (
                <div className="space-y-1.5">
                  <Label>Descripción en la factura</Label>
                  <Input
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder={alcance === "saldo" ? `Saldo ${label} N° ${docNumber}` : defaultDesc}
                  />
                </div>
              )}
            </section>

            {/* Revisión */}
            <section className="space-y-2 border-t pt-4">
              <div className="rounded-lg bg-slate-50 border p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold">
                    {fiscal ? `Factura ${fiscal.letra}` : "Factura —"}
                    {form.condicion === EClientTaxCondition.MONOTRIBUTO && " (receptor monotributista)"}
                  </span>
                  <span className="text-muted-foreground">{items.length} línea{items.length === 1 ? "" : "s"}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Neto gravado</span>
                  <span>{formatearPrecio(neto)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>IVA 21%</span>
                  <span>{formatearPrecio(iva)}</span>
                </div>
                <div className="flex justify-between font-semibold text-base">
                  <span>Total</span>
                  <span>{formatearPrecio(monto)}</span>
                </div>
                {leyendas.includes(LEYENDA_MONOTRIBUTO) && (
                  <p className="text-xs text-slate-600 pt-1">Lleva la leyenda de la RG 5003 (Ley 27.618).</p>
                )}
                {leyendas.includes(LEYENDA_TRANSPARENCIA) && (
                  <p className="text-xs text-slate-600 pt-1">
                    Lleva la leyenda de Transparencia Fiscal con IVA contenido {formatearPrecio(iva)}.
                  </p>
                )}
              </div>

              {[...blockers.map((b) => ({ b, kind: "block" })), ...warnings.map((b) => ({ b, kind: "warn" }))].map(
                ({ b, kind }) => (
                  <p
                    key={b}
                    className={cn(
                      "text-xs flex items-start gap-1.5 rounded px-2 py-1.5",
                      kind === "block" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800",
                    )}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {b}
                  </p>
                ),
              )}
              {error && (
                <p className="text-sm rounded border border-red-200 bg-red-50 text-red-800 px-3 py-2">{error}</p>
              )}
            </section>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={emitting}>
                Cancelar
              </Button>
              <Button
                onClick={emit}
                disabled={emitting || blockers.length > 0}
                className={confirming ? "bg-amber-600 hover:bg-amber-700" : ""}
              >
                {emitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Emitiendo…
                  </>
                ) : confirming ? (
                  `Confirmar: Factura ${fiscal?.letra ?? ""} por ${formatearPrecio(monto)}`
                ) : (
                  "Emitir en ARCA"
                )}
              </Button>
            </DialogFooter>
            {confirming && (
              <p className="text-xs text-muted-foreground text-right -mt-2">
                Una factura autorizada no se puede borrar: solo se anula con una nota de crédito.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

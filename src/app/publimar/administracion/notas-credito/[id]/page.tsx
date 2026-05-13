"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useFirestore, useFirestoreDocData, useUser } from "reactfire";
import { doc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Ban } from "lucide-react";
import { toast } from "sonner";
import collections from "@/lib/collections";
import { formatearPrecio, formatDate } from "@/lib/utils";
import {
  CREDIT_NOTE_APPLIED_DOC_LABELS,
  CREDIT_NOTE_ORIGIN_LABELS,
  CREDIT_NOTE_STATUS_LABELS,
  ECreditNoteStatus,
  TCreditNote,
} from "@/types/creditNote";
import { EClientSection } from "@/types/client";
import { cancelCreditNote } from "@/lib/creditNotes";

const STATUS_BADGE: Record<ECreditNoteStatus, string> = {
  [ECreditNoteStatus.AVAILABLE]: "bg-green-100 text-green-800 hover:bg-green-100",
  [ECreditNoteStatus.USED]: "bg-slate-200 text-slate-700 hover:bg-slate-200",
  [ECreditNoteStatus.EXPIRED]: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  [ECreditNoteStatus.CANCELLED]: "bg-red-100 text-red-800 hover:bg-red-100",
};

function appliedToLink(n: TCreditNote): string | null {
  if (!n.appliedToDocumentId || !n.appliedToDocumentType) return null;
  switch (n.appliedToDocumentType) {
    case "order":
      return `/publimar/banderas/ordenes/${n.appliedToDocumentId}`;
    case "billing":
      return `/publimar/viaPublica/facturacion/${n.appliedToDocumentId}`;
    case "sale":
      return `/publimar/banderas/ventas`;
    case "quote":
      return `/publimar/viaPublica/presupuestos`;
    default:
      return null;
  }
}

export default function CreditNoteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const firestore = useFirestore();
  const { data: user } = useUser();
  const id = (params?.id as string) ?? "";

  const noteRef = doc(firestore, collections.CREDIT_NOTES, id);
  const { status, data } = useFirestoreDocData(noteRef, { idField: "id" });

  const note = data as TCreditNote | undefined;

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    if (!user?.uid) {
      toast.error("Usuario no identificado");
      return;
    }
    setCancelling(true);
    try {
      await cancelCreditNote(firestore, id, {
        cancelledBy: user.uid,
        reason: cancelReason.trim(),
      });
      toast.success("Nota de crédito anulada");
      setCancelOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Error al anular la nota de crédito",
      );
    } finally {
      setCancelling(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center my-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="text-center my-12">
        <p className="text-slate-600 mb-4">Nota de crédito no encontrada</p>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion/notas-credito">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Link>
        </Button>
      </div>
    );
  }

  const appliedHref = appliedToLink(note);

  return (
    <div>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{note.number}</h1>
            <Badge className={STATUS_BADGE[note.status]}>
              {CREDIT_NOTE_STATUS_LABELS[note.status]}
            </Badge>
          </div>
          <p className="text-slate-600 text-sm mt-1">
            Detalle de la nota de crédito.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/publimar/administracion/notas-credito">
              <ArrowLeft className="h-4 w-4 mr-1" /> Volver
            </Link>
          </Button>
          {note.status === ECreditNoteStatus.AVAILABLE && (
            <Button
              variant="destructive"
              onClick={() => setCancelOpen(true)}
            >
              <Ban className="h-4 w-4 mr-1" /> Anular
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos generales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-slate-500">Cliente:</span>{" "}
              <span className="font-medium">{note.clientName}</span>
            </div>
            {note.clientSection && (
              <div>
                <span className="text-slate-500">Sección:</span>{" "}
                {note.clientSection === EClientSection.BANDERAS ? "Banderas" : "Vía Pública"}
              </div>
            )}
            <div>
              <span className="text-slate-500">Monto:</span>{" "}
              <span className="font-semibold">{formatearPrecio(Number(note.amount) || 0)}</span>
            </div>
            <div>
              <span className="text-slate-500">Origen:</span>{" "}
              {CREDIT_NOTE_ORIGIN_LABELS[note.originType]}
            </div>
            <div>
              <span className="text-slate-500">Motivo:</span>{" "}
              {note.reason || "-"}
            </div>
            <div>
              <span className="text-slate-500">Emitida:</span> {formatDate(note.createdAt)}
            </div>
            {note.expiresAt && (
              <div>
                <span className="text-slate-500">Vence:</span> {formatDate(note.expiresAt)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Origen y aplicación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {note.originDocumentId && (
              <div>
                <span className="text-slate-500">Documento origen:</span>{" "}
                {note.originDocumentNumber ?? note.originDocumentId}
                {note.originDocumentType && (
                  <span className="text-xs text-slate-500 ml-1">
                    ({note.originDocumentType})
                  </span>
                )}
              </div>
            )}

            {note.status === ECreditNoteStatus.USED ? (
              <>
                <div>
                  <span className="text-slate-500">Aplicada a:</span>{" "}
                  {note.appliedToDocumentType
                    ? CREDIT_NOTE_APPLIED_DOC_LABELS[note.appliedToDocumentType]
                    : "-"}{" "}
                  {note.appliedToDocumentNumber && (
                    <span className="font-medium">{note.appliedToDocumentNumber}</span>
                  )}
                  {appliedHref && (
                    <Button asChild variant="link" size="sm" className="pl-2">
                      <Link href={appliedHref}>Ver documento</Link>
                    </Button>
                  )}
                </div>
                <div>
                  <span className="text-slate-500">Monto aplicado:</span>{" "}
                  {formatearPrecio(Number(note.appliedAmount) || 0)}
                </div>
                {note.forfeitedAmount != null && note.forfeitedAmount > 0 && (
                  <div className="text-amber-700">
                    <span className="text-slate-500">Sobrante perdido:</span>{" "}
                    {formatearPrecio(Number(note.forfeitedAmount) || 0)}
                  </div>
                )}
                {note.appliedAt && (
                  <div>
                    <span className="text-slate-500">Fecha de aplicación:</span>{" "}
                    {formatDate(note.appliedAt)}
                  </div>
                )}
              </>
            ) : note.status === ECreditNoteStatus.CANCELLED ? (
              <>
                <div>
                  <span className="text-slate-500">Anulada el:</span>{" "}
                  {note.cancelledAt ? formatDate(note.cancelledAt) : "-"}
                </div>
                {note.cancelReason && (
                  <div>
                    <span className="text-slate-500">Motivo de anulación:</span>{" "}
                    {note.cancelReason}
                  </div>
                )}
              </>
            ) : (
              <p className="text-slate-500">
                La nota está disponible para aplicarse a una orden de trabajo o facturación del cliente.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {note.items && note.items.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Items devueltos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-1">
              {note.items.map((it, idx) => (
                <div key={idx} className="flex justify-between border-b last:border-b-0 py-1">
                  <span>
                    {it.productName}
                    {it.variantName ? ` — ${it.variantName}` : ""} · x{it.quantity}
                  </span>
                  <span>{formatearPrecio(it.subtotal)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular nota de crédito</DialogTitle>
            <DialogDescription>
              Esta acción marca la nota como anulada. El saldo a favor del cliente se reduce en {formatearPrecio(Number(note.amount) || 0)}.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="mb-2 block">Motivo (opcional)</Label>
            <Textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ej: emitida por error"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? "Anulando..." : "Anular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

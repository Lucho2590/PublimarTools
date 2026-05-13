import {
  Firestore,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import collections from "@/lib/collections";
import {
  ECreditNoteStatus,
  ECreditNoteOriginType,
  TCreditNote,
  TCreditNoteAppliedDocType,
  TCreditNoteOriginDocType,
  TCreditNoteItem,
} from "@/types/creditNote";
import { EBillingStatus, TPaymentRecord } from "@/types/billing";
import { TPaymentHistory } from "@/types/order";
import { EPaymentMethod } from "@/types/sale";

export interface CreateCreditNoteInput {
  clientId: string;
  clientName: string;
  clientSection?: string;
  amount: number;
  reason: string;
  originType: ECreditNoteOriginType;
  originDocument?: {
    id: string;
    type: TCreditNoteOriginDocType;
    number?: string;
  };
  items?: TCreditNoteItem[];
  expiresAt?: Date | null;
  createdBy: string;
}

export interface ApplyCreditNoteInput {
  noteId: string;
  documentId: string;
  documentType: TCreditNoteAppliedDocType;
  documentNumber?: string;
  documentTotal: number;
  appliedBy: string;
}

export interface ApplyCreditNoteResult {
  appliedAmount: number;
  forfeitedAmount: number;
  newBalance?: number;
}

/**
 * Genera un número único de nota de crédito con formato NC-YYYYMMDD-XXX.
 */
export function generateCreditNoteNumber(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = String(Math.floor(100 + Math.random() * 900));
  return `NC-${yyyy}${mm}${dd}-${rand}`;
}

/**
 * Crea una nueva nota de crédito en la colección `creditNotes`.
 * Si originType es RETURN, originDocument debe estar definido.
 */
export async function createCreditNote(
  firestore: Firestore,
  input: CreateCreditNoteInput,
): Promise<string> {
  if (input.amount <= 0) {
    throw new Error("El monto de la nota de crédito debe ser mayor a cero");
  }
  if (input.originType === ECreditNoteOriginType.RETURN && !input.originDocument) {
    throw new Error("Una nota por devolución requiere documento de origen");
  }

  const col = collection(firestore, collections.CREDIT_NOTES);

  const payload: Record<string, any> = {
    number: generateCreditNoteNumber(),
    clientId: input.clientId,
    clientName: input.clientName,
    amount: input.amount,
    status: ECreditNoteStatus.AVAILABLE,
    originType: input.originType,
    reason: input.reason ?? "",
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.clientSection) payload.clientSection = input.clientSection;
  if (input.originDocument) {
    payload.originDocumentId = input.originDocument.id;
    payload.originDocumentType = input.originDocument.type;
    if (input.originDocument.number) {
      payload.originDocumentNumber = input.originDocument.number;
    }
  }
  if (input.items && input.items.length > 0) payload.items = input.items;
  if (input.expiresAt) payload.expiresAt = Timestamp.fromDate(input.expiresAt);

  const ref = await addDoc(col, payload);
  return ref.id;
}

/**
 * Aplica una nota de crédito a un documento de cobro (orden o facturación).
 * - Si la NC > total restante del documento, el sobrante se PIERDE (forfeit).
 * - La NC queda en estado USED con snapshot del receptor.
 * - Se ejecuta de manera atómica con runTransaction.
 */
export async function applyCreditNoteToDocument(
  firestore: Firestore,
  input: ApplyCreditNoteInput,
): Promise<ApplyCreditNoteResult> {
  const { noteId, documentId, documentType, documentNumber, documentTotal, appliedBy } = input;
  const noteRef = doc(firestore, collections.CREDIT_NOTES, noteId);

  const docCollection =
    documentType === "order"
      ? collections.ORDERS
      : documentType === "billing"
        ? collections.BILLINGS
        : documentType === "sale"
          ? collections.SALES
          : collections.QUOTES;
  const documentRef = doc(firestore, docCollection, documentId);

  return await runTransaction(firestore, async (tx) => {
    const noteSnap = await tx.get(noteRef);
    if (!noteSnap.exists()) throw new Error("La nota de crédito no existe");
    const note = noteSnap.data() as TCreditNote;

    if (note.status !== ECreditNoteStatus.AVAILABLE) {
      throw new Error(
        `La nota de crédito no está disponible (estado: ${note.status})`,
      );
    }

    const expiresAt = (note as any).expiresAt;
    if (expiresAt) {
      const expDate =
        typeof expiresAt?.toDate === "function" ? expiresAt.toDate() : new Date(expiresAt);
      if (expDate < new Date()) {
        throw new Error("La nota de crédito está vencida");
      }
    }

    const docSnap = await tx.get(documentRef);
    if (!docSnap.exists()) throw new Error("El documento receptor no existe");
    const docData = docSnap.data() as any;

    let newBalance: number | undefined;

    if (documentType === "order") {
      const currentPaid =
        Array.isArray(docData.paymentHistory)
          ? (docData.paymentHistory as TPaymentHistory[]).reduce(
              (sum, p) => sum + (Number(p.amount) || 0),
              0,
            )
          : 0;
      const remaining = Math.max(0, documentTotal - currentPaid);
      if (remaining <= 0) {
        throw new Error("La orden ya está totalmente cubierta");
      }

      const appliedAmount = Math.min(note.amount, remaining);
      const forfeitedAmount = note.amount - appliedAmount;

      const newEntry: TPaymentHistory = {
        amount: appliedAmount,
        date: new Date(),
        type: "credit_note",
        method: EPaymentMethod.CREDIT_NOTE,
        notes: `Aplicación NC ${note.number}`,
      };

      const history = Array.isArray(docData.paymentHistory)
        ? [...docData.paymentHistory, newEntry]
        : [newEntry];
      newBalance = Math.max(0, documentTotal - currentPaid - appliedAmount);

      tx.update(documentRef, {
        paymentHistory: history,
        balance: newBalance,
        updatedAt: serverTimestamp(),
      });

      tx.update(noteRef, {
        status: ECreditNoteStatus.USED,
        appliedAt: serverTimestamp(),
        appliedToDocumentId: documentId,
        appliedToDocumentType: documentType,
        appliedToDocumentNumber: documentNumber ?? null,
        appliedAmount,
        forfeitedAmount,
        appliedBy,
        updatedAt: serverTimestamp(),
      });

      return { appliedAmount, forfeitedAmount, newBalance };
    }

    if (documentType === "billing") {
      const totalAmount = Number(docData.totalAmount) || documentTotal;
      const currentPaid = Number(docData.totalPaid) || 0;
      const remaining = Math.max(0, totalAmount - currentPaid);
      if (remaining <= 0) {
        throw new Error("La facturación ya está totalmente cubierta");
      }

      const appliedAmount = Math.min(note.amount, remaining);
      const forfeitedAmount = note.amount - appliedAmount;

      const record: TPaymentRecord = {
        id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        amount: appliedAmount,
        date: new Date(),
        method: EPaymentMethod.CREDIT_NOTE,
        notes: `Aplicación NC ${note.number}`,
        registeredBy: appliedBy,
        createdAt: new Date(),
      };
      const history = Array.isArray(docData.paymentHistory)
        ? [...docData.paymentHistory, record]
        : [record];
      const newTotalPaid = currentPaid + appliedAmount;
      newBalance = Math.max(0, totalAmount - newTotalPaid);
      const newStatus =
        newBalance <= 0
          ? EBillingStatus.PAID
          : newTotalPaid > 0
            ? EBillingStatus.PARTIAL
            : EBillingStatus.PENDING;

      tx.update(documentRef, {
        paymentHistory: history,
        totalPaid: newTotalPaid,
        balance: newBalance,
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      tx.update(noteRef, {
        status: ECreditNoteStatus.USED,
        appliedAt: serverTimestamp(),
        appliedToDocumentId: documentId,
        appliedToDocumentType: documentType,
        appliedToDocumentNumber: documentNumber ?? null,
        appliedAmount,
        forfeitedAmount,
        appliedBy,
        updatedAt: serverTimestamp(),
      });

      return { appliedAmount, forfeitedAmount, newBalance };
    }

    throw new Error(
      `Aplicación a documentos de tipo "${documentType}" no implementada todavía`,
    );
  });
}

/**
 * Suma el monto disponible de notas de crédito AVAILABLE no vencidas de un cliente.
 */
export async function getClientAvailableCredit(
  firestore: Firestore,
  clientId: string,
): Promise<{ total: number; notes: TCreditNote[] }> {
  const col = collection(firestore, collections.CREDIT_NOTES);
  const q = query(
    col,
    where("clientId", "==", clientId),
    where("status", "==", ECreditNoteStatus.AVAILABLE),
  );
  const snap = await getDocs(q);
  const now = new Date();
  const notes: TCreditNote[] = [];
  let total = 0;
  snap.forEach((d) => {
    const data = d.data() as any;
    if (data.deleted) return;
    if (data.expiresAt) {
      const expDate =
        typeof data.expiresAt?.toDate === "function"
          ? data.expiresAt.toDate()
          : new Date(data.expiresAt);
      if (expDate < now) return;
    }
    notes.push({ id: d.id, ...data } as TCreditNote);
    total += Number(data.amount) || 0;
  });
  return { total, notes };
}

/**
 * Anula una nota de crédito disponible. Si ya fue usada, lanza error
 * (en MVP no se revierte la aplicación al documento receptor).
 */
export async function cancelCreditNote(
  firestore: Firestore,
  noteId: string,
  params: { cancelledBy: string; reason?: string },
): Promise<void> {
  const ref = doc(firestore, collections.CREDIT_NOTES, noteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("La nota de crédito no existe");
  const note = snap.data() as TCreditNote;
  if (note.status !== ECreditNoteStatus.AVAILABLE) {
    throw new Error(
      "Solo se pueden anular notas de crédito disponibles. " +
        "Si la nota ya fue aplicada, anulá primero el documento receptor.",
    );
  }
  await runTransaction(firestore, async (tx) => {
    tx.update(ref, {
      status: ECreditNoteStatus.CANCELLED,
      cancelledAt: serverTimestamp(),
      cancelledBy: params.cancelledBy,
      cancelReason: params.reason ?? "",
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Marca como EXPIRED las notas AVAILABLE cuya fecha de vencimiento ya pasó.
 * Pensado para uso manual o como cron job futuro.
 */
export async function expireCreditNotes(firestore: Firestore): Promise<number> {
  const col = collection(firestore, collections.CREDIT_NOTES);
  const q = query(col, where("status", "==", ECreditNoteStatus.AVAILABLE));
  const snap = await getDocs(q);
  const now = new Date();
  let expired = 0;
  for (const d of snap.docs) {
    const data = d.data() as any;
    if (!data.expiresAt) continue;
    const expDate =
      typeof data.expiresAt?.toDate === "function"
        ? data.expiresAt.toDate()
        : new Date(data.expiresAt);
    if (expDate >= now) continue;
    await runTransaction(firestore, async (tx) => {
      tx.update(d.ref, {
        status: ECreditNoteStatus.EXPIRED,
        updatedAt: serverTimestamp(),
      });
    });
    expired++;
  }
  return expired;
}

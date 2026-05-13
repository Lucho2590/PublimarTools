import { EClientSection } from "./client";

export enum ECreditNoteStatus {
  AVAILABLE = "available",
  USED = "used",
  EXPIRED = "expired",
  CANCELLED = "cancelled",
}

export enum ECreditNoteOriginType {
  RETURN = "return",
  MANUAL = "manual",
}

export type TCreditNoteOriginDocType = "sale" | "order" | "billing";
export type TCreditNoteAppliedDocType = "sale" | "order" | "quote" | "billing";

export type TCreditNoteItem = {
  productId?: string;
  variantId?: string;
  productName: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type TCreditNote = {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  clientSection?: EClientSection;

  amount: number;
  status: ECreditNoteStatus;

  originType: ECreditNoteOriginType;
  originDocumentId?: string;
  originDocumentType?: TCreditNoteOriginDocType;
  originDocumentNumber?: string;
  items?: TCreditNoteItem[];
  reason: string;

  expiresAt?: Date | null;

  appliedAt?: Date;
  appliedToDocumentId?: string;
  appliedToDocumentType?: TCreditNoteAppliedDocType;
  appliedToDocumentNumber?: string;
  appliedAmount?: number;
  forfeitedAmount?: number;
  appliedBy?: string;

  cancelledAt?: Date;
  cancelledBy?: string;
  cancelReason?: string;

  createdAt: Date;
  updatedAt: Date;
  createdBy: string;

  deleted?: boolean;
};

export const CREDIT_NOTE_STATUS_LABELS: Record<ECreditNoteStatus, string> = {
  [ECreditNoteStatus.AVAILABLE]: "Disponible",
  [ECreditNoteStatus.USED]: "Utilizada",
  [ECreditNoteStatus.EXPIRED]: "Vencida",
  [ECreditNoteStatus.CANCELLED]: "Anulada",
};

export const CREDIT_NOTE_ORIGIN_LABELS: Record<ECreditNoteOriginType, string> = {
  [ECreditNoteOriginType.RETURN]: "Devolución",
  [ECreditNoteOriginType.MANUAL]: "Manual",
};

export const CREDIT_NOTE_APPLIED_DOC_LABELS: Record<TCreditNoteAppliedDocType, string> = {
  sale: "Venta",
  order: "Orden de trabajo",
  quote: "Presupuesto",
  billing: "Facturación",
};

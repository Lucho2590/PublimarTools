export enum EMovementType {
  INCOME = "income",
  EXPENSE = "expense",
  TRANSFER_IN = "transfer_in",
  TRANSFER_OUT = "transfer_out",
  ADJUSTMENT = "adjustment",
}

export type TMovementSource =
  | "sale"
  | "purchase"
  | "billing"
  | "providerPayment"
  | "operationalExpense"
  | "manual";

export interface TAccountMovement {
  id?: string;
  accountId: string;
  date: Date;
  type: EMovementType;
  amount: number; // siempre positivo; el signo lo define `type`
  description: string;
  sourceType?: TMovementSource;
  sourceId?: string;
  counterpartyAccountId?: string; // para transferencias
  createdBy: string;
  createdAt?: Date;
}

export const MOVEMENT_TYPE_LABELS: Record<EMovementType, string> = {
  [EMovementType.INCOME]: "Ingreso",
  [EMovementType.EXPENSE]: "Egreso",
  [EMovementType.TRANSFER_IN]: "Transferencia recibida",
  [EMovementType.TRANSFER_OUT]: "Transferencia enviada",
  [EMovementType.ADJUSTMENT]: "Ajuste",
};

export const isIncomingMovement = (type: EMovementType): boolean => {
  return type === EMovementType.INCOME || type === EMovementType.TRANSFER_IN;
};

export const movementSignedAmount = (m: { type: EMovementType; amount: number }): number => {
  if (m.type === EMovementType.ADJUSTMENT) return m.amount; // ajustes pueden ser +/-
  return isIncomingMovement(m.type) ? m.amount : -m.amount;
};

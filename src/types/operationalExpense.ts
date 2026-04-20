import { EPurchaseDepartment, EPurchasePaymentMethod } from "./purchase";

export enum EExpenseCategory {
  SUELDO = "sueldo",
  ALQUILER = "alquiler",
  SERVICIO = "servicio",
  IMPUESTO = "impuesto",
  MARKETING = "marketing",
  OTRO = "otro",
}

export const EXPENSE_CATEGORY_LABELS: Record<EExpenseCategory, string> = {
  [EExpenseCategory.SUELDO]: "Sueldos",
  [EExpenseCategory.ALQUILER]: "Alquiler",
  [EExpenseCategory.SERVICIO]: "Servicios",
  [EExpenseCategory.IMPUESTO]: "Impuestos",
  [EExpenseCategory.MARKETING]: "Marketing",
  [EExpenseCategory.OTRO]: "Otro",
};

export interface TOperationalExpense {
  id?: string;
  date: string; // YYYY-MM-DD
  category: EExpenseCategory;
  description: string;
  amount: number;
  department: EPurchaseDepartment;
  accountId?: string;
  paymentMethod: EPurchasePaymentMethod;
  receiptUrl?: string;
  receiptName?: string;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export enum EAccountType {
  BANK = "bank",
  DIGITAL_WALLET = "wallet",
  CASH = "efectivo",
  CREDIT_CARD = "credit_card",
}

export enum EAccountStatus {
  ACTIVE = "active",
  ARCHIVED = "archived",
}

export enum EAccountDepartment {
  BANDERAS = "banderas",
  VIA_PUBLICA = "via_publica",
  ADMINISTRACION = "administracion",
}

export interface TAccount {
  id?: string;
  name: string;
  type: EAccountType;
  bankName?: string;
  accountNumber?: string;
  alias?: string;
  holder?: string;
  department?: EAccountDepartment;
  initialBalance: number;
  currentBalance: number;
  currency: "ARS" | "USD";
  status: EAccountStatus;
  notes?: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const ACCOUNT_TYPE_LABELS: Record<EAccountType, string> = {
  [EAccountType.BANK]: "Cuenta bancaria",
  [EAccountType.DIGITAL_WALLET]: "Billetera digital",
  [EAccountType.CASH]: "Efectivo / Caja",
  [EAccountType.CREDIT_CARD]: "Tarjeta de crédito",
};

export const ACCOUNT_DEPARTMENT_LABELS: Record<EAccountDepartment, string> = {
  [EAccountDepartment.BANDERAS]: "Banderas",
  [EAccountDepartment.VIA_PUBLICA]: "Vía Pública",
  [EAccountDepartment.ADMINISTRACION]: "Administración",
};

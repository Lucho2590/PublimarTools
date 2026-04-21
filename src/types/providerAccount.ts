export enum EProviderAccountStatus {
  ACTIVE = "active",
  CLOSED = "closed",
}

export interface TProviderAccountPayment {
  id: string;
  amount: number;
  date: string; // YYYY-MM-DD
  method: string; // "efectivo", "transferencia", etc.
  accountId?: string; // Cuenta desde la que sale el pago
  accountName?: string; // Snapshot del nombre de la cuenta
  notes?: string;
  registeredBy: string;
  registeredByName?: string;
  createdAt?: Date;
}

export interface TProviderAccount {
  id?: string;
  providerId: string;
  providerName: string;
  balance: number; // Saldo pendiente (compras - pagos)
  totalPurchases: number;
  totalPayments: number;
  status: EProviderAccountStatus;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

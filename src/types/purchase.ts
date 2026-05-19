export enum EPurchaseDepartment {
  BANDERAS = "banderas",
  VIA_PUBLICA = "via_publica",
  ADMINISTRACION = "administracion",
}

export enum EPurchasePaymentMethod {
  EFECTIVO = "efectivo",
  TARJETA = "tarjeta",
  TRANSFERENCIA = "transferencia",
  CUENTA_CORRIENTE = "cuenta_corriente",
  CHEQUE = "cheque",
  ECHEQ = "echeq",
}

export const PURCHASE_PAYMENT_METHOD_LABELS: Record<
  EPurchasePaymentMethod,
  string
> = {
  [EPurchasePaymentMethod.EFECTIVO]: "Efectivo",
  [EPurchasePaymentMethod.TARJETA]: "Tarjeta",
  [EPurchasePaymentMethod.TRANSFERENCIA]: "Transferencia",
  [EPurchasePaymentMethod.CUENTA_CORRIENTE]: "Cuenta corriente",
  [EPurchasePaymentMethod.CHEQUE]: "Cheque",
  [EPurchasePaymentMethod.ECHEQ]: "E-Cheq",
};

export interface TPurchase {
  id?: string;
  providerId: string;
  providerName?: string; // opcional para mostrar rápido
  date: string; // formato YYYY-MM-DD
  description: string;
  amount: number;
  department: EPurchaseDepartment; // Área a la que se imputa la compra
  paymentMethod?: EPurchasePaymentMethod; // Forma de pago
  accountId?: string | null; // Cuenta desde la que sale el pago
  facturaUrl?: string;
  facturaName?: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
} 
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

export interface TPurchase {
  id?: string;
  providerId: string;
  providerName?: string; // opcional para mostrar rápido
  date: string; // formato YYYY-MM-DD
  description: string;
  amount: number;
  department: EPurchaseDepartment; // Área a la que se imputa la compra
  paymentMethod?: EPurchasePaymentMethod; // Forma de pago
  facturaUrl?: string;
  facturaName?: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
} 
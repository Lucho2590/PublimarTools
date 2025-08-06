export enum EPaymentMethod {
  CASH = "cash",
  CREDIT_CARD = "credit_card",
  DEBIT_CARD = "debit_card",
  TRANSFER = "transfer",
  MERCADOPAGO = "mercadopago",
  CHECK = "cheque",
}

export interface TSaleItem {
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface TSale {
  bank?: string | null;
  id?: string;
  number: string;
  items: TSaleItem[];
  subtotal: number;
  total: number;
  // Información de IVA
  applyIVA?: boolean;
  taxRate?: number;
  taxAmount?: number;
  // Información de descuentos
  discountPercentage?: number;
  discountAmount?: number;
  manualDiscount?: number;
  paymentMethod: EPaymentMethod;
  isInvoiced: boolean;
  invoiceNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
  orderId?: string;
} 
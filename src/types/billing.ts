import { EPaymentMethod } from "./sale";

// Estados de facturación
export enum EBillingStatus {
  PENDING = "pending",    // Pendiente - sin pagos registrados
  PARTIAL = "partial",    // Parcial - pagos parciales realizados
  PAID = "paid",          // Pagado - total cubierto
}

// Forma de pago (snapshot del presupuesto, editable)
export type TBillingPaymentMethod = {
  id: string;
  tipo: string;           // "efectivo" | "transferencia" | "cheque" | "cuenta_corriente" | "canje"
  monto: number;
  cuenta?: string;        // Para transferencias
  factura: boolean;
  tipoFactura?: "A" | "C";
};

// Registro de pago individual
export type TPaymentRecord = {
  id: string;
  amount: number;
  date: Date;
  method: EPaymentMethod;
  banco?: string;         // Para transferencias
  notes?: string;
  registeredBy: string;   // User ID
  registeredByName?: string;
  createdAt: Date;
};

// Cliente snapshot para billing
export type TBillingClient = {
  id: string;
  name: string;
  section: string;
  cuit?: string;
  phone?: string;
  email?: string;
  address?: string;
};

// Item snapshot para billing
export type TBillingItem = {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  description?: string;
};

// Periodo del presupuesto
export type TBillingPeriodo = {
  fechaInicio: any;
  dias: number;
  fechaFin: any;
  notas?: string;
};

// Estructura principal de facturación
export type TBilling = {
  id: string;
  number: string;         // Número de facturación (F-VP-YYYYMMDD-XXX)

  // Referencia al presupuesto
  quoteId: string;
  quoteNumber: string;

  // Cliente (snapshot)
  client: TBillingClient;

  // Items del presupuesto (snapshot para referencia)
  items: TBillingItem[];

  // Formas de pago (editables desde el presupuesto)
  formasPago: TBillingPaymentMethod[];

  // Importes
  totalAmount: number;    // Total a pagar (del presupuesto)
  totalPaid: number;      // Total pagado
  balance: number;        // Saldo pendiente (totalAmount - totalPaid)

  // Historial de pagos
  paymentHistory: TPaymentRecord[];

  // Estado
  status: EBillingStatus;

  // Metadata
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy?: string;

  // Campos adicionales del presupuesto
  periodos?: TBillingPeriodo[];
  conImpresiones?: boolean;
  impresiones?: {
    costo: number;
    venta: number;
    flete: number;
  };
  notes?: string;
};

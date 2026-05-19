import { EPaymentMethod } from "./sale";
import { EPurchasePaymentMethod } from "./purchase";

/**
 * Configuración (documento singleton en la colección
 * `paymentAccountDefaults`, doc id "config") que mapea cada forma de pago
 * a la cuenta por defecto donde impacta el cobro/pago.
 *
 * - `sales`: usado en Ventas y Órdenes (enum EPaymentMethod).
 * - `purchases`: usado en Compras y Gastos operativos (EPurchasePaymentMethod).
 *
 * El valor es solo una sugerencia precargada en el formulario; el usuario
 * puede elegir otra cuenta al registrar el pago.
 */
export interface TPaymentAccountDefaults {
  sales?: Partial<Record<EPaymentMethod, string>>;
  purchases?: Partial<Record<EPurchasePaymentMethod, string>>;
  updatedBy?: string;
  updatedAt?: Date;
}

/** Id fijo del documento singleton de configuración. */
export const PAYMENT_ACCOUNT_DEFAULTS_DOC_ID = "config";

import { EClientTaxCondition } from "./client";

// Facturación electrónica ARCA (ex AFIP) vía web service WSFEv1.
// Emisor único: el CUIT de Banderas configurado en /publimar/administracion/arca.

export type TArcaEnvironment = "homologacion" | "produccion";

export type TArcaLetra = "A" | "B";

/** factura = Factura A/B · nc = Nota de Crédito A/B */
export type TArcaKind = "factura" | "nc";

export type TArcaInvoiceStatus = "pending" | "authorized" | "rejected" | "error";

/**
 * Qué parte del documento se factura:
 * - total: el total de la orden/venta, con el detalle de ítems.
 * - pago: uno o más pagos registrados en la orden.
 * - saldo: lo que falta facturar.
 * - libre: un monto cualquiera (sin superar lo pendiente).
 */
export type TArcaAlcance = "total" | "pago" | "saldo" | "libre";

/** De dónde salieron los datos del receptor en el diálogo de facturación. */
export type TArcaReceptorOrigen = "documento" | "cliente" | "razonSocialAlt" | "manual";

export type TArcaSource = "order" | "sale";

export type TArcaReceptor = {
  /** 80 CUIT · 96 DNI · 99 Consumidor Final sin identificar */
  docTipo: number;
  /** Solo dígitos. "0" cuando docTipo = 99. */
  docNro: string;
  razonSocial: string;
  condicion: EClientTaxCondition;
  /** Código de ARCA (RG 5616): 1 RI, 4 Exento, 5 CF, 6 Monotributo, 15 No alcanzado. */
  condicionIvaReceptorId: number;
  domicilio?: string;
  origen: TArcaReceptorOrigen;
};

/** Montos con IVA incluido (así se cargan en órdenes y ventas). */
export type TArcaItem = {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
};

export type TArcaIva = {
  /** 5 = 21% */
  id: number;
  baseImp: number;
  importe: number;
};

/** Datos del emisor congelados en cada comprobante (para el PDF). */
export type TArcaEmisorSnapshot = {
  cuit: string;
  razonSocial: string;
  domicilioComercial: string;
  iibb: string;
  inicioActividades: string;
  condicionIva: string;
};

export type TArcaMessage = { code?: number; msg: string };

export type TArcaInvoice = {
  id: string;
  environment: TArcaEnvironment;
  status: TArcaInvoiceStatus;
  kind: TArcaKind;
  letra: TArcaLetra;
  /** 1 FA · 3 NCA · 6 FB · 8 NCB */
  cbteTipo: number;
  puntoVenta: number;
  numero?: number;
  /** "0003-00000012" */
  numeroFormateado?: string;
  /** YYYY-MM-DD */
  fecha: string;
  emisor: TArcaEmisorSnapshot;
  receptor: TArcaReceptor;
  alcance: TArcaAlcance;
  /** Claves de los pagos de la orden incluidos (ver paymentKey en lib/arca/amounts). */
  pagoKeys?: string[];
  items: TArcaItem[];
  impNeto: number;
  impIVA: number;
  impTotal: number;
  iva: TArcaIva[];
  leyendas: string[];
  cae?: string;
  /** YYYY-MM-DD */
  caeVto?: string;
  observaciones?: TArcaMessage[];
  errores?: TArcaMessage[];
  orderId?: string | null;
  saleId?: string | null;
  clientId?: string | null;
  documentNumber?: string | null;
  /** Solo NC: factura que anula/ajusta. */
  facturaAsociadaId?: string | null;
  facturaAsociadaNumero?: string | null;
  facturaAsociadaCbteTipo?: number | null;
  /** Solo facturas: NCs emitidas contra esta factura. */
  ncIds?: string[];
  /** Suma de NCs autorizadas contra esta factura. */
  ncTotal?: number;
  /** true cuando las NCs cubren el total de la factura. */
  anulada?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type TArcaPadronResult = {
  cuit: string;
  razonSocial: string;
  tipoPersona: string;
  estadoClave: string;
  activo: boolean;
  condicion: EClientTaxCondition;
  /** true cuando la condición no surge de un impuesto explícito (sin IVA ni monotributo). */
  condicionInferida: boolean;
  domicilio: string;
  impuestos: { id: number; descripcion: string }[];
  actividades: string[];
  monotributoCategoria?: string;
  validatedAt: string;
};

/** Lo que se guarda en el cliente (y en cada razón social) después de validar. */
export type TArcaPadronSnapshot = {
  validatedAt: string;
  razonSocial: string;
  condicion: EClientTaxCondition;
  domicilio: string;
  estadoClave: string;
};

export type TArcaCertInfo = {
  hasKey: boolean;
  hasCsr: boolean;
  hasCert: boolean;
  csrPem?: string;
  certSubject?: string;
  certCuit?: string;
  certExpiresAt?: string;
};

/** Configuración visible para el admin (sin secretos). */
export type TArcaPublicConfig = {
  cuit: string;
  razonSocial: string;
  domicilioComercial: string;
  iibb: string;
  inicioActividades: string;
  puntoVenta: number;
  environment: TArcaEnvironment;
  /** Monto a partir del cual una Factura B a consumidor final exige DNI. */
  umbralConsumidorFinal: number;
  certs: Record<TArcaEnvironment, TArcaCertInfo>;
  encryptionConfigured: boolean;
  updatedAt?: string;
};

// Consulta de CUIT en el padrón de ARCA: ws_sr_constancia_inscripcion →
// getPersona_v2 (manual v3.4). La condición frente al IVA no viene como campo:
// se deduce de los impuestos inscriptos (20 monotributo, 30 IVA, 32 IVA exento).

import { EClientTaxCondition } from "@/types/client";
import type { TArcaPadronResult } from "@/types/arca";
import { cleanCuit, isValidCuitChecksum } from "@/lib/cuit";
import { getArcaClient } from "./client";

const IMPUESTO_MONOTRIBUTO = 20;
const IMPUESTO_IVA = 30;
const IMPUESTO_IVA_EXENTO = 32;

export class PadronError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
  }
}

// El SOAP devuelve un objeto suelto cuando hay un solo elemento.
const asArray = <T>(v: T | T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

type TRawImpuesto = { idImpuesto?: number | string; descripcionImpuesto?: string; estadoImpuesto?: string };

function activeImpuestos(list: unknown): { id: number; descripcion: string }[] {
  return asArray(list as TRawImpuesto | TRawImpuesto[])
    // Sin estado = activo (la constancia solo lista vigentes); "AC" = activo.
    .filter((i) => !i.estadoImpuesto || String(i.estadoImpuesto).toUpperCase() === "AC")
    .map((i) => ({ id: Number(i.idImpuesto), descripcion: String(i.descripcionImpuesto || "") }))
    .filter((i) => Number.isFinite(i.id));
}

function formatDomicilio(d: Record<string, unknown> | undefined): string {
  if (!d) return "";
  const parts = [d.direccion, d.localidad, d.codPostal ? `CP ${d.codPostal}` : null, d.descripcionProvincia]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean);
  return parts.join(", ");
}

export async function consultarCuit(cuitInput: string): Promise<TArcaPadronResult> {
  const cuit = cleanCuit(cuitInput);
  if (!isValidCuitChecksum(cuit)) throw new PadronError("El CUIT no es válido (revisá el dígito verificador)");

  const { arca } = await getArcaClient();
  const details = await arca.registerInscriptionProofService.getTaxpayerDetails(Number(cuit));
  if (!details) {
    throw new PadronError(
      "ARCA no devolvió datos para ese CUIT: no existe o no tiene constancia de inscripción vigente",
      404,
    );
  }
  return parsePersona(cuit, details as unknown as Record<string, any>);
}

/** Normaliza la respuesta de getPersona_v2 (separado para poder probarlo sin ARCA). */
export function parsePersona(cuit: string, raw: Record<string, any>): TArcaPadronResult {
  const generales = (raw.datosGenerales || {}) as Record<string, any>;
  const regimen = (raw.datosRegimenGeneral || {}) as Record<string, any>;
  const mono = raw.datosMonotributo as Record<string, any> | undefined;

  const impuestos = [...activeImpuestos(regimen.impuesto), ...activeImpuestos(mono?.impuesto)];
  const ids = new Set(impuestos.map((i) => i.id));
  const categoria = mono?.categoriaMonotributo as Record<string, any> | undefined;
  const esMonotributo =
    ids.has(IMPUESTO_MONOTRIBUTO) || Number(categoria?.idImpuesto) === IMPUESTO_MONOTRIBUTO || !!categoria;

  const tipoPersona = String(generales.tipoPersona || raw.tipoPersona || "");
  let condicion: EClientTaxCondition;
  let condicionInferida = false;
  if (esMonotributo) condicion = EClientTaxCondition.MONOTRIBUTO;
  else if (ids.has(IMPUESTO_IVA)) condicion = EClientTaxCondition.IVA_INSCRIPTO;
  else if (ids.has(IMPUESTO_IVA_EXENTO)) condicion = EClientTaxCondition.IVA_EXENTO;
  else {
    // Sin IVA ni monotributo: persona humana → consumidor final; sociedad →
    // no alcanzada. Se marca como inferida para que el usuario lo confirme.
    condicion = /JURIDICA/i.test(tipoPersona)
      ? EClientTaxCondition.IVA_NO_ALCANZADO
      : EClientTaxCondition.CONSUMIDOR_FINAL;
    condicionInferida = true;
  }

  const razonSocial =
    String(generales.razonSocial || "").trim() ||
    [generales.apellido, generales.nombre].filter(Boolean).join(" ").trim();
  const estadoClave = String(generales.estadoClave || raw.estadoClave || "");

  const actividades = [
    ...asArray(regimen.actividad as Record<string, any> | Record<string, any>[]),
    ...asArray(mono?.actividadMonotributista as Record<string, any> | undefined),
  ]
    .map((a) => String(a?.descripcionActividad || "").trim())
    .filter(Boolean);

  return {
    cuit,
    razonSocial,
    tipoPersona,
    estadoClave,
    activo: !estadoClave || estadoClave.toUpperCase() === "ACTIVO",
    condicion,
    condicionInferida,
    domicilio: formatDomicilio(generales.domicilioFiscal),
    impuestos,
    actividades,
    monotributoCategoria: categoria?.descripcionCategoria ? String(categoria.descripcionCategoria) : undefined,
    validatedAt: new Date().toISOString(),
  };
}

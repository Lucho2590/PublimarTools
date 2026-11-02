// Configuración del emisor (CUIT de Banderas) y certificados por ambiente.
// Vive en Firestore `arcaConfig/default` y solo la escribe el servidor.
// La clave privada se guarda cifrada (secretBox) y nunca sale del servidor.

import { generateKeyPairSync } from "crypto";
import forge from "node-forge";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import { cleanCuit, isValidCuitChecksum } from "@/lib/cuit";
import type {
  TArcaAuthCuit,
  TArcaCertInfo,
  TArcaEmisorSnapshot,
  TArcaEnvironment,
  TArcaPublicConfig,
} from "@/types/arca";
import { CONDICION_IVA_EMISOR, DEFAULT_UMBRAL_CONSUMIDOR_FINAL } from "../constants";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "./secretBox";

export const ARCA_CONFIG_COLLECTION = "arcaConfig";
export const ARCA_INVOICES_COLLECTION = "arcaInvoices";
const CONFIG_DOC = "default";

type TStoredCert = {
  keyEnc?: string;
  /** CUIT de quien entra a ARCA y genera el certificado (puede no ser el del emisor). */
  titularCuit?: string;
  /** Solo homologación: con qué CUIT se factura cuando el certificado es de otra persona. */
  authCuit?: TArcaAuthCuit;
  csrPem?: string;
  certPem?: string;
  certSubject?: string;
  certCuit?: string;
  certExpiresAt?: string;
};

type TStoredConfig = {
  cuit?: string;
  razonSocial?: string;
  domicilioComercial?: string;
  iibb?: string;
  inicioActividades?: string;
  puntoVenta?: number;
  environment?: TArcaEnvironment;
  umbralConsumidorFinal?: number;
  certs?: Partial<Record<TArcaEnvironment, TStoredCert>>;
  updatedAt?: string;
  updatedBy?: string;
};

function configRef() {
  return getFirestoreAdmin().collection(ARCA_CONFIG_COLLECTION).doc(CONFIG_DOC);
}

async function readStored(): Promise<TStoredConfig> {
  const snap = await configRef().get();
  return (snap.exists ? snap.data() : {}) as TStoredConfig;
}

type TSubjectAttr = { name?: string; shortName?: string; value?: unknown };

/** CUIT (serialNumber), alias (CN) y razón social (O) de un subject X.509. */
type TSubjectDetails = { cuit?: string; alias?: string; razonSocial?: string };

function subjectDetails(attrs: TSubjectAttr[]): TSubjectDetails {
  const get = (key: string) => {
    const a = attrs.find((x) => x.shortName === key || x.name === key);
    return typeof a?.value === "string" ? a.value : undefined;
  };
  const cuit = cleanCuit(get("serialNumber"));
  return { cuit: cuit || undefined, alias: get("CN"), razonSocial: get("O") };
}

function csrDetails(pem: string | undefined): TSubjectDetails {
  if (!pem) return {};
  try {
    return subjectDetails(forge.pki.certificationRequestFromPem(pem).subject.attributes);
  } catch {
    return {};
  }
}

function certAlias(pem: string | undefined): string | undefined {
  if (!pem) return undefined;
  try {
    return subjectDetails(forge.pki.certificateFromPem(pem).subject.attributes).alias;
  } catch {
    return undefined;
  }
}

function certInfo(c: TStoredCert | undefined): TArcaCertInfo {
  const csr = csrDetails(c?.csrPem);
  return {
    hasKey: !!c?.keyEnc,
    hasCsr: !!c?.csrPem,
    hasCert: !!c?.certPem,
    csrPem: c?.csrPem,
    certSubject: c?.certSubject,
    certCuit: c?.certCuit,
    certExpiresAt: c?.certExpiresAt,
    titularCuit: c?.titularCuit || csr.cuit,
    csrCuit: csr.cuit,
    csrAlias: csr.alias,
    csrRazonSocial: csr.razonSocial,
    certAlias: certAlias(c?.certPem),
    authCuit: c?.authCuit === "certificado" ? "certificado" : "emisor",
  };
}

export async function getPublicConfig(): Promise<TArcaPublicConfig> {
  const s = await readStored();
  return {
    cuit: s.cuit || "",
    razonSocial: s.razonSocial || "",
    domicilioComercial: s.domicilioComercial || "",
    iibb: s.iibb || "",
    inicioActividades: s.inicioActividades || "",
    puntoVenta: Number(s.puntoVenta) || 0,
    environment: s.environment || "homologacion",
    umbralConsumidorFinal: Number(s.umbralConsumidorFinal) || DEFAULT_UMBRAL_CONSUMIDOR_FINAL,
    certs: {
      homologacion: certInfo(s.certs?.homologacion),
      produccion: certInfo(s.certs?.produccion),
    },
    encryptionConfigured: isEncryptionConfigured(),
    updatedAt: s.updatedAt,
  };
}

export type TEmisorInput = {
  cuit: string;
  razonSocial: string;
  domicilioComercial: string;
  iibb: string;
  inicioActividades: string;
  puntoVenta: number;
  environment: TArcaEnvironment;
  umbralConsumidorFinal: number;
};

export async function saveEmisor(input: TEmisorInput, uid: string): Promise<void> {
  await configRef().set(
    {
      cuit: cleanCuit(input.cuit),
      razonSocial: input.razonSocial.trim(),
      domicilioComercial: input.domicilioComercial.trim(),
      iibb: input.iibb.trim(),
      inicioActividades: input.inicioActividades.trim(),
      puntoVenta: Math.max(0, Math.floor(Number(input.puntoVenta) || 0)),
      environment: input.environment === "produccion" ? "produccion" : "homologacion",
      umbralConsumidorFinal:
        Number(input.umbralConsumidorFinal) > 0
          ? Number(input.umbralConsumidorFinal)
          : DEFAULT_UMBRAL_CONSUMIDOR_FINAL,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    },
    { merge: true },
  );
}

/**
 * Genera una clave RSA 2048 + CSR para el ambiente. El CSR se sube en ARCA
 * (WSASS en homologación, "Administración de Certificados Digitales" en
 * producción) y ARCA devuelve el .crt que después se carga con `saveCertificate`.
 * Regenerar invalida el certificado anterior de ese ambiente.
 *
 * ARCA emite el certificado a nombre de quien entra con su clave fiscal (en una
 * SRL, el socio gerente), así que el CSR lleva ese CUIT (`titularCuit`). Después
 * la empresa le delega wsfe y el padrón a ese certificado y se factura con el
 * CUIT del emisor como representado.
 */
export async function generateCsr(
  environment: TArcaEnvironment,
  alias: string,
  titularCuitInput: string,
  uid: string,
): Promise<string> {
  const s = await readStored();
  const emisorCuit = cleanCuit(s.cuit);
  if (emisorCuit.length !== 11) throw new Error("Cargá y guardá el CUIT del emisor antes de generar el CSR");
  if (!s.razonSocial) throw new Error("Cargá y guardá la razón social antes de generar el CSR");
  const cuit = cleanCuit(titularCuitInput) || emisorCuit;
  if (!isValidCuitChecksum(cuit)) {
    throw new Error("El CUIT de quien entra a ARCA no es válido (revisá el dígito verificador)");
  }

  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const forgeKey = forge.pki.privateKeyFromPem(privateKey) as forge.pki.rsa.PrivateKey;
  const publicKey = forge.pki.setRsaPublicKey(forgeKey.n, forgeKey.e);

  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = publicKey;
  csr.setSubject([
    { shortName: "C", value: "AR" },
    { shortName: "O", value: s.razonSocial },
    { shortName: "CN", value: alias.trim() || "banderas-app" },
    { name: "serialNumber", value: `CUIT ${cuit}` },
  ]);
  csr.sign(forgeKey, forge.md.sha256.create());
  const csrPem = forge.pki.certificationRequestToPem(csr);

  await configRef().set(
    {
      certs: {
        [environment]: {
          keyEnc: encryptSecret(forge.pki.privateKeyToPem(forgeKey)),
          titularCuit: cuit,
          csrPem,
          certPem: null,
          certSubject: null,
          certCuit: null,
          certExpiresAt: null,
        },
      },
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    },
    { merge: true },
  );
  await clearTickets(environment);
  return csrPem;
}

/** Valida el .crt de ARCA contra la clave generada y lo guarda. */
export async function saveCertificate(
  environment: TArcaEnvironment,
  certPem: string,
  uid: string,
): Promise<TArcaCertInfo> {
  const s = await readStored();
  const stored = s.certs?.[environment];
  if (!stored?.keyEnc) throw new Error("Primero generá el CSR de este ambiente");

  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(certPem.trim());
  } catch {
    throw new Error("El archivo no es un certificado válido (se espera el .crt/.pem que entrega ARCA)");
  }

  const key = forge.pki.privateKeyFromPem(decryptSecret(stored.keyEnc)) as forge.pki.rsa.PrivateKey;
  const certKey = cert.publicKey as forge.pki.rsa.PublicKey;
  if (certKey.n.compareTo(key.n) !== 0) {
    throw new Error("El certificado no corresponde al último CSR generado para este ambiente");
  }

  // Puede ser de otro CUIT que el emisor (representante): no se valida acá.
  const serial = cert.subject.getField({ name: "serialNumber" })?.value as string | undefined;
  const certCuit = cleanCuit(serial);

  const info = {
    certPem: forge.pki.certificateToPem(cert),
    certSubject: cert.subject.attributes.map((a) => `${a.shortName || a.name}=${a.value}`).join(", "),
    certCuit: certCuit || null,
    certExpiresAt: cert.validity.notAfter.toISOString(),
  };
  await configRef().set(
    {
      certs: { [environment]: info },
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    },
    { merge: true },
  );
  await clearTickets(environment);
  return certInfo({ ...stored, ...info, certCuit: info.certCuit || undefined });
}

/** Homologación: facturar las pruebas con el CUIT del emisor o con el del certificado. */
export async function setAuthCuit(authCuit: TArcaAuthCuit, uid: string): Promise<void> {
  await configRef().set(
    {
      certs: { homologacion: { authCuit: authCuit === "certificado" ? "certificado" : "emisor" } },
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    },
    { merge: true },
  );
  await clearTickets("homologacion");
}

export type TEmisionContext = {
  environment: TArcaEnvironment;
  cuit: string;
  puntoVenta: number;
  umbralConsumidorFinal: number;
  certPem: string;
  keyPem: string;
  emisor: TArcaEmisorSnapshot;
};

/** Todo lo necesario para hablar con ARCA en el ambiente activo, o un error claro. */
export async function getEmisionContext(): Promise<TEmisionContext> {
  const s = await readStored();
  const environment = s.environment || "homologacion";
  const emisorCuit = cleanCuit(s.cuit);
  if (emisorCuit.length !== 11) throw new Error("Falta configurar el CUIT del emisor en Administración → ARCA");
  const stored = s.certs?.[environment];
  if (!stored?.keyEnc || !stored?.certPem) {
    throw new Error(
      `Falta el certificado de ${environment === "produccion" ? "producción" : "homologación"} en Administración → ARCA`,
    );
  }
  if (stored.certExpiresAt && new Date(stored.certExpiresAt).getTime() < Date.now()) {
    throw new Error("El certificado de ARCA está vencido: generá uno nuevo en Administración → ARCA");
  }
  const certCuit = cleanCuit(stored.certCuit);
  const cuit =
    environment === "homologacion" && stored.authCuit === "certificado" && certCuit.length === 11
      ? certCuit
      : emisorCuit;
  return {
    environment,
    cuit,
    puntoVenta: Number(s.puntoVenta) || 0,
    umbralConsumidorFinal: Number(s.umbralConsumidorFinal) || DEFAULT_UMBRAL_CONSUMIDOR_FINAL,
    certPem: stored.certPem,
    keyPem: decryptSecret(stored.keyEnc),
    emisor: {
      cuit,
      razonSocial: s.razonSocial || "",
      domicilioComercial: s.domicilioComercial || "",
      iibb: s.iibb || "",
      inicioActividades: s.inicioActividades || "",
      condicionIva: CONDICION_IVA_EMISOR,
    },
  };
}

// --------------------------------------------------------------------------
// Tickets WSAA (uno por ambiente y servicio, cifrados)
// --------------------------------------------------------------------------

export function ticketDocId(environment: TArcaEnvironment, service: string): string {
  return `ticket_${environment}_${service}`;
}

async function clearTickets(environment: TArcaEnvironment): Promise<void> {
  const col = getFirestoreAdmin().collection(ARCA_CONFIG_COLLECTION);
  const snap = await col.get();
  const batch = getFirestoreAdmin().batch();
  snap.docs
    .filter((d) => d.id.startsWith(`ticket_${environment}_`))
    .forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

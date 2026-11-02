// Configuración del emisor (CUIT de Banderas) y certificados por ambiente.
// Vive en Firestore `arcaConfig/default` y solo la escribe el servidor.
// La clave privada se guarda cifrada (secretBox) y nunca sale del servidor.

import { generateKeyPairSync } from "crypto";
import forge from "node-forge";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import { cleanCuit } from "@/lib/cuit";
import type {
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

function certInfo(c: TStoredCert | undefined): TArcaCertInfo {
  return {
    hasKey: !!c?.keyEnc,
    hasCsr: !!c?.csrPem,
    hasCert: !!c?.certPem,
    csrPem: c?.csrPem,
    certSubject: c?.certSubject,
    certCuit: c?.certCuit,
    certExpiresAt: c?.certExpiresAt,
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
 */
export async function generateCsr(
  environment: TArcaEnvironment,
  alias: string,
  uid: string,
): Promise<string> {
  const s = await readStored();
  const cuit = cleanCuit(s.cuit);
  if (cuit.length !== 11) throw new Error("Cargá y guardá el CUIT del emisor antes de generar el CSR");
  if (!s.razonSocial) throw new Error("Cargá y guardá la razón social antes de generar el CSR");

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

  const serial = cert.subject.getField({ name: "serialNumber" })?.value as string | undefined;
  const certCuit = cleanCuit(serial);
  if (s.cuit && certCuit && certCuit !== cleanCuit(s.cuit)) {
    throw new Error(`El certificado es del CUIT ${certCuit}, distinto al del emisor configurado`);
  }

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
  const cuit = cleanCuit(s.cuit);
  if (cuit.length !== 11) throw new Error("Falta configurar el CUIT del emisor en Administración → ARCA");
  const stored = s.certs?.[environment];
  if (!stored?.keyEnc || !stored?.certPem) {
    throw new Error(
      `Falta el certificado de ${environment === "produccion" ? "producción" : "homologación"} en Administración → ARCA`,
    );
  }
  if (stored.certExpiresAt && new Date(stored.certExpiresAt).getTime() < Date.now()) {
    throw new Error("El certificado de ARCA está vencido: generá uno nuevo en Administración → ARCA");
  }
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

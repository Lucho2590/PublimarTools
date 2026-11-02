// Cliente de los web services de ARCA (WSAA + WSFEv1 + padrón constancia de
// inscripción) sobre @arcasdk/core. El ticket de acceso WSAA dura ~12 h y ARCA
// rechaza pedir otro mientras el anterior siga vigente: en serverless no hay
// memoria compartida, así que se persiste (cifrado) en Firestore.

import { AccessTicket, Arca, type ArcaServiceName, type ITicketStoragePort } from "@arcasdk/core";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import type { TArcaEnvironment } from "@/types/arca";
import { ARCA_CONFIG_COLLECTION, getEmisionContext, ticketDocId, type TEmisionContext } from "./config";
import { decryptSecret, encryptSecret } from "./secretBox";

class FirestoreTicketStorage implements ITicketStoragePort {
  constructor(private readonly environment: TArcaEnvironment) {}

  private ref(service: ArcaServiceName) {
    return getFirestoreAdmin()
      .collection(ARCA_CONFIG_COLLECTION)
      .doc(ticketDocId(this.environment, service));
  }

  async save(ticket: AccessTicket, service: ArcaServiceName): Promise<void> {
    await this.ref(service).set({
      enc: encryptSecret(JSON.stringify(ticket.toLoginCredentials())),
      expiresAt: ticket.getExpiration().toISOString(),
      savedAt: new Date().toISOString(),
    });
  }

  async get(service: ArcaServiceName): Promise<AccessTicket | null> {
    const snap = await this.ref(service).get();
    const enc = snap.exists ? (snap.data()?.enc as string | undefined) : undefined;
    if (!enc) return null;
    try {
      return AccessTicket.create(JSON.parse(decryptSecret(enc)));
    } catch {
      return null;
    }
  }

  async delete(service: ArcaServiceName): Promise<void> {
    await this.ref(service).delete();
  }
}

export type TArcaClient = {
  arca: Arca;
  ctx: TEmisionContext;
};

export async function getArcaClient(): Promise<TArcaClient> {
  const ctx = await getEmisionContext();
  const arca = new Arca({
    production: ctx.environment === "produccion",
    cuit: Number(ctx.cuit),
    cert: ctx.certPem,
    key: ctx.keyPem,
    ticketStorage: new FirestoreTicketStorage(ctx.environment),
  });
  return { arca, ctx };
}

/** Mensaje legible para errores de red/SOAP de ARCA. */
export function describeArcaError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (/ya posee un TA valido/i.test(msg)) {
    return "ARCA indica que ya hay un ticket de acceso vigente que la app no tiene guardado. Esperá unos minutos (vence solo) y reintentá.";
  }
  if (/cms\.cert|cms\.sign|certificado (bloqueado|vencido|no emitido)/i.test(msg)) {
    return "ARCA rechazó el certificado: no fue emitido por ARCA para este ambiente, está vencido o fue revocado.";
  }
  if (/notAuthorized|no autorizado|Computador no autorizado/i.test(msg)) {
    return "El certificado no está autorizado para este servicio en ARCA (revisá la relación en el Administrador de Relaciones de Clave Fiscal).";
  }
  if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|socket hang up|timeout/i.test(msg)) {
    return "ARCA no respondió a tiempo. Reintentá en unos minutos.";
  }
  return msg;
}

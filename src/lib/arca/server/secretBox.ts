// Cifrado en reposo de la clave privada del certificado y del ticket WSAA.
// AES-256-GCM con clave de entorno ARCA_ENCRYPTION_KEY (32 bytes en base64).
// Formato del ciphertext: base64( iv[12] | authTag[16] | ciphertext ).
// Mismo esquema que src/lib/whatsapp/crypto.ts (rama de WhatsApp).

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const b64 = process.env.ARCA_ENCRYPTION_KEY;
  if (!b64) throw new Error("ARCA_ENCRYPTION_KEY no configurada en el servidor");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("ARCA_ENCRYPTION_KEY debe ser 32 bytes codificados en base64");
  }
  return key;
}

export function isEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(enc: string): string {
  const raw = Buffer.from(enc, "base64");
  if (raw.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("Secreto cifrado inválido");
  }
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// Cifrado del access token en reposo (invariante del brief: nunca en claro).
// AES-256-GCM con clave de entorno WHATSAPP_ENCRYPTION_KEY (32 bytes en base64).
// Formato del ciphertext: base64( iv[12] | authTag[16] | ciphertext ).

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const b64 = process.env.WHATSAPP_ENCRYPTION_KEY;
  if (!b64) throw new Error("WHATSAPP_ENCRYPTION_KEY no configurada");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("WHATSAPP_ENCRYPTION_KEY debe ser 32 bytes codificados en base64");
  }
  return key;
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptToken(enc: string): string {
  const raw = Buffer.from(enc, "base64");
  if (raw.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("Token cifrado inválido");
  }
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

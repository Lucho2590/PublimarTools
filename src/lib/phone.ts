// Helpers de teléfono para el celular del usuario staff.
//
// El valor que se ALMACENA es E.164 sin "+" ni "0" de trunk, con código de país
// (UY "59899123456", AR "5491123456789"). Eso es exactamente lo que produce el
// `normalizePhone` del bot de WhatsApp (src/lib/whatsapp/db.ts) cuando el
// remitente ya llega en E.164, así que el celular del operador queda comparable
// byte-a-byte contra el `phone` de las conversaciones que persiste el bot.
//
// No se puede inferir el país solo del número nacional (UY y AR solapan
// longitudes), por eso el input pide un país explícito. `detectCountry` solo
// sirve para re-hidratar un valor YA guardado (que trae el código de país).

export type PhoneCountry = "UY" | "AR";

const DIAL: Record<PhoneCountry, string> = { UY: "598", AR: "54" };

/** Deja solo dígitos. Equivalente conceptual al normalizePhone del bot. */
export function onlyDigits(value: string | undefined | null): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Toma lo que el usuario tipea en formato nacional (con o sin 0 de trunk) más el
 * país seleccionado, y devuelve E.164 sin "+" (dígitos con código de país).
 *   ("099123456", "UY")  -> "59899123456"
 *   ("1123456789", "AR") -> "5491123456789"  (antepone el 9 de móvil AR)
 */
export function normalizePhone(national: string, country: PhoneCountry): string {
  let d = onlyDigits(national);
  if (!d) return "";
  const code = DIAL[country];
  // Si ya viene con el código de país, respetarlo tal cual.
  if (d.startsWith(code)) return d;
  d = d.replace(/^0+/, ""); // quita 0 de trunk
  if (country === "AR" && !d.startsWith("9")) d = "9" + d; // móvil AR
  return code + d;
}

/** Detecta el país a partir del valor E.164 almacenado. */
export function detectCountry(e164: string | undefined | null): PhoneCountry {
  const d = onlyDigits(e164);
  if (d.startsWith("598")) return "UY";
  if (d.startsWith("54")) return "AR";
  return "UY";
}

/** Formatea el valor almacenado (E.164) a display nacional legible. */
export function formatPhone(e164: string | undefined | null): string {
  const d = onlyDigits(e164);
  if (!d) return "";
  // El código de país lo muestra el selector aparte, así que el display es solo
  // el número nacional significativo (sin código, sin "9" de móvil, sin "0" de trunk).
  if (d.startsWith("598")) {
    // UY: 8 dígitos "9XXXXXXX" -> "99 123 456"
    const nat = d.slice(3);
    return nat.replace(/^(\d{2})(\d{0,3})(\d{0,3}).*/, (_, a, b, c) =>
      [a, b, c].filter(Boolean).join(" ")
    );
  }
  if (d.startsWith("54")) {
    // AR (característica de 3 dígitos, ej. Mar del Plata 223):
    // saca el 54 y el 9 de móvil -> "AAANNNNNNN" -> "223 541-6600"
    let nat = d.slice(2);
    if (nat.startsWith("9")) nat = nat.slice(1);
    const area = nat.slice(0, 3);
    const p1 = nat.slice(3, 6);
    const p2 = nat.slice(6, 10);
    return [area, p2 ? `${p1}-${p2}` : p1].filter(Boolean).join(" ");
  }
  return d;
}

/** Validación laxa por país sobre el valor E.164. */
export function isValidPhone(e164: string | undefined | null): boolean {
  const d = onlyDigits(e164);
  if (d.startsWith("598")) return /^598\d{8}$/.test(d); // UY móvil: 598 + 8
  if (d.startsWith("54")) return /^549?\d{9,11}$/.test(d); // AR: tolerante
  return d.length >= 8;
}

/**
 * Normaliza texto para búsquedas: minúsculas y sin acentos.
 *
 * Esta función estaba copiada a mano en ~18 páginas con tres nombres distintos
 * (`normalize`, `normalizeText`, `norm`). Para código nuevo, usar esta.
 */
export function normalizeText(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

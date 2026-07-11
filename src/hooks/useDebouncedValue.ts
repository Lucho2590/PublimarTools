import { useEffect, useState } from "react";

/**
 * Devuelve una versión "retrasada" de un valor: solo se actualiza cuando el valor
 * de entrada deja de cambiar durante `delayMs`. Sirve para no recalcular filtros
 * pesados en cada tecla de un buscador.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

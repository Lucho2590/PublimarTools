"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

interface MoneyInputProps {
  /** Valor numérico actual. */
  value: number;
  /** Se llama con el número parseado en cada cambio. */
  onValueChange: (n: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

const groupInteger = (digits: string): string => {
  if (!digits) return "";
  // Quitar ceros a la izquierda (pero dejar al menos un dígito).
  const clean = digits.replace(/^0+(?=\d)/, "");
  return new Intl.NumberFormat("es-AR").format(Number(clean));
};

// Convierte texto libre a { display, numeric } estilo es-AR
// (puntos = miles, coma = decimales).
const parse = (raw: string): { display: string; numeric: number } => {
  // Solo dígitos y una coma decimal.
  let cleaned = raw.replace(/[^\d,]/g, "");
  const firstComma = cleaned.indexOf(",");
  let intDigits = cleaned;
  let decDigits = "";
  let hasComma = false;
  if (firstComma >= 0) {
    hasComma = true;
    intDigits = cleaned.slice(0, firstComma).replace(/,/g, "");
    decDigits = cleaned
      .slice(firstComma + 1)
      .replace(/,/g, "")
      .slice(0, 2);
  }
  const groupedInt = groupInteger(intDigits);
  const display =
    (groupedInt || (hasComma ? "0" : "")) +
    (hasComma ? `,${decDigits}` : "");
  const numeric = Number(
    `${intDigits || "0"}.${decDigits || "0"}`,
  );
  return { display, numeric };
};

const formatFromNumber = (n: number): string => {
  if (!n || isNaN(n)) return "";
  const fixed = Math.round(n * 100) / 100;
  const [int, dec] = String(fixed).split(".");
  const grouped = groupInteger(int);
  return dec ? `${grouped},${dec}` : grouped;
};

export function MoneyInput({
  value,
  onValueChange,
  placeholder = "0",
  className,
  disabled,
  id,
}: MoneyInputProps) {
  const [text, setText] = React.useState<string>(() =>
    formatFromNumber(value),
  );
  const focused = React.useRef(false);

  // Sincronizar cuando el valor cambia desde afuera (ej: reset del form)
  // y el input no está enfocado.
  React.useEffect(() => {
    if (focused.current) return;
    const current = parse(text).numeric;
    if (current !== value) {
      setText(formatFromNumber(value));
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Input
      id={id}
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      disabled={disabled}
      className={className}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setText(formatFromNumber(value));
      }}
      onChange={(e) => {
        const { display, numeric } = parse(e.target.value);
        setText(display);
        onValueChange(numeric);
      }}
    />
  );
}

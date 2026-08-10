"use client";

import * as React from "react";

import { Input, InputProps } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  detectCountry,
  formatPhone,
  normalizePhone,
  PhoneCountry,
} from "@/lib/phone";

export type PhoneInputProps = Omit<InputProps, "value" | "onChange" | "type"> & {
  /** Valor E.164 almacenado (ej. "59899123456"). */
  value: string | undefined | null;
  onValueChange: (e164: string) => void;
};

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onValueChange, placeholder, className, ...props }, ref) => {
    const [country, setCountry] = React.useState<PhoneCountry>(
      detectCountry(value)
    );

    // Re-hidratar el país cuando el valor externo cambia de país (ej. al recargar).
    React.useEffect(() => {
      setCountry(detectCountry(value));
    }, [value]);

    const display = formatPhone(value);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(normalizePhone(e.target.value, country));
    };

    const handleCountry = (c: PhoneCountry) => {
      setCountry(c);
      // Re-normaliza el número actual con el nuevo país seleccionado.
      onValueChange(normalizePhone(formatPhone(value), c));
    };

    return (
      <div className="flex gap-2">
        <Select
          value={country}
          onValueChange={(v) => handleCountry(v as PhoneCountry)}
        >
          <SelectTrigger className="w-[100px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="UY">🇺🇾 +598</SelectItem>
            <SelectItem value="AR">🇦🇷 +54</SelectItem>
          </SelectContent>
        </Select>
        <Input
          ref={ref}
          type="text"
          value={display}
          onChange={handleChange}
          placeholder={
            placeholder ?? (country === "AR" ? "223 541-6600" : "99 123 456")
          }
          inputMode="numeric"
          autoComplete="off"
          className={className}
          {...props}
        />
      </div>
    );
  }
);
PhoneInput.displayName = "PhoneInput";

export { PhoneInput };

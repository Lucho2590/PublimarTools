import * as React from "react";

import { Input, InputProps } from "@/components/ui/input";
import { cleanCuit, formatCuit } from "@/lib/cuit";

export type CuitInputProps = Omit<InputProps, "value" | "onChange" | "type"> & {
  value: string | undefined | null;
  onValueChange: (digits: string) => void;
};

const CuitInput = React.forwardRef<HTMLInputElement, CuitInputProps>(
  ({ value, onValueChange, placeholder, maxLength, inputMode, autoComplete, ...props }, ref) => {
    const display = formatCuit(value);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(cleanCuit(e.target.value));
    };

    return (
      <Input
        ref={ref}
        type="text"
        value={display}
        onChange={handleChange}
        placeholder={placeholder ?? "XX-XXXXXXXX-X"}
        maxLength={maxLength ?? 13}
        inputMode={inputMode ?? "numeric"}
        autoComplete={autoComplete ?? "off"}
        {...props}
      />
    );
  }
);
CuitInput.displayName = "CuitInput";

export { CuitInput };

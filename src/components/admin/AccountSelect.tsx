"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/hooks/useAccounts";
import {
  EAccountType,
  EAccountDepartment,
  ACCOUNT_TYPE_LABELS,
} from "@/types/account";

interface AccountSelectProps {
  value: string | null | undefined;
  onChange: (accountId: string) => void;
  placeholder?: string;
  /** Filtra por tipo (ej: solo BANK + DIGITAL_WALLET para transferencias). */
  allowedTypes?: EAccountType[];
  /** Filtra por departamento de la cuenta. */
  department?: EAccountDepartment;
  className?: string;
  disabled?: boolean;
  /** Si true, muestra el tipo entre paréntesis. */
  showType?: boolean;
}

export function AccountSelect({
  value,
  onChange,
  placeholder = "Seleccionar cuenta",
  allowedTypes,
  department,
  className,
  disabled,
  showType = true,
}: AccountSelectProps) {
  const { accounts, loading } = useAccounts();

  const filtered = accounts.filter((a) => {
    if (allowedTypes && !allowedTypes.includes(a.type)) return false;
    if (department && a.department && a.department !== department) return false;
    return true;
  });

  return (
    <Select
      value={value ?? undefined}
      onValueChange={onChange}
      disabled={disabled || loading}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={loading ? "Cargando…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {filtered.length === 0 && (
          <SelectItem value="__none__" disabled>
            No hay cuentas disponibles
          </SelectItem>
        )}
        {filtered.map((a) => (
          <SelectItem key={a.id} value={a.id!}>
            {a.name}
            {showType ? ` (${ACCOUNT_TYPE_LABELS[a.type]})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

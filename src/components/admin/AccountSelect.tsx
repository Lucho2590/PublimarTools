"use client";

import { useMemo } from "react";
import {
  ProductAutocomplete,
  type AutocompleteOption,
} from "@/components/ui/product-autocomplete";
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
  /** Si true, muestra el tipo en el sublabel. */
  showType?: boolean;
}

export function AccountSelect({
  value,
  onChange,
  placeholder = "Buscar cuenta por nombre o N°",
  allowedTypes,
  department,
  className,
  disabled,
  showType = true,
}: AccountSelectProps) {
  const { accounts, loading } = useAccounts();

  const options = useMemo<AutocompleteOption[]>(() => {
    return accounts
      .filter((a) => {
        if (allowedTypes && !allowedTypes.includes(a.type)) return false;
        if (department && a.department && a.department !== department)
          return false;
        return true;
      })
      .map((a) => {
        const parts: string[] = [];
        if (a.referenceNumber) parts.push(`N° ${a.referenceNumber}`);
        if (showType) parts.push(ACCOUNT_TYPE_LABELS[a.type]);
        return {
          id: a.id!,
          label: a.name,
          sublabel: parts.length ? parts.join(" · ") : undefined,
        };
      });
  }, [accounts, allowedTypes, department, showType]);

  return (
    <ProductAutocomplete
      options={options}
      value={value ?? ""}
      onChange={onChange}
      placeholder={loading ? "Cargando…" : placeholder}
      disabled={disabled || loading}
      className={className}
    />
  );
}

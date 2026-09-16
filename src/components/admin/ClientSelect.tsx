"use client";

import { useMemo } from "react";
import {
  ProductAutocomplete,
  type AutocompleteOption,
} from "@/components/ui/product-autocomplete";
import { useClients } from "@/hooks/useClients";
import { EClientSection, EClientStatus, TClient } from "@/types/client";
import { formatCuit } from "@/lib/cuit";
import { sectionLabel } from "@/lib/quoteClient";

interface ClientSelectProps {
  value: string | null | undefined;
  onChange: (clientId: string) => void;
  /**
   * Sección propia del documento. Los clientes de esa sección se listan
   * primero; los de la otra quedan al final y resaltados en ámbar.
   */
  section?: EClientSection;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ClientSelect({
  value,
  onChange,
  section,
  placeholder = "Buscar cliente por nombre o CUIT",
  disabled,
  className,
}: ClientSelectProps) {
  // Sin `section`: trae todos y el orden lo resuelve el memo de abajo.
  const { clients, loading } = useClients();

  const options = useMemo<AutocompleteOption[]>(() => {
    const active = (clients as TClient[]).filter(
      (c) => c.status !== EClientStatus.INACTIVE,
    );

    const isOwnSection = (c: TClient) => !section || c.section === section;

    const sorted = [...active].sort((a, b) => {
      const ownA = isOwnSection(a) ? 0 : 1;
      const ownB = isOwnSection(b) ? 0 : 1;
      if (ownA !== ownB) return ownA - ownB;
      return (a.name ?? "").localeCompare(b.name ?? "", "es");
    });

    return sorted.map((c) => {
      const own = isOwnSection(c);
      const parts: string[] = [];
      if (c.cuit) parts.push(formatCuit(c.cuit));
      if (!own) parts.push(sectionLabel(c.section));
      return {
        id: c.id,
        label: c.name,
        sublabel: parts.length ? parts.join(" · ") : undefined,
        // El ámbar avisa que ese cliente mueve el documento de módulo.
        sublabelClassName: own ? undefined : "text-amber-600 font-medium",
      };
    });
  }, [clients, section]);

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

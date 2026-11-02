"use client";

import { useState } from "react";
import { useUser } from "reactfire";
import { BadgeCheck, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { consultarPadron } from "@/lib/arca/api";
import { isValidCuitChecksum } from "@/lib/cuit";
import { getTaxConditionLabel } from "@/lib/taxCondition";
import { cn } from "@/lib/utils";
import type { TArcaPadronResult, TArcaPadronSnapshot } from "@/types/arca";

export function padronSnapshot(r: TArcaPadronResult): TArcaPadronSnapshot {
  return {
    validatedAt: r.validatedAt,
    razonSocial: r.razonSocial,
    condicion: r.condicion,
    domicilio: r.domicilio,
    estadoClave: r.estadoClave,
  };
}

type Props = {
  cuit: string | undefined | null;
  onResult: (result: TArcaPadronResult) => void;
  /** Guarda el resultado en el cliente (o en su razón social N) desde el servidor. */
  cache?: { clientId: string; razonIndex?: number | null };
  size?: "sm" | "default";
  className?: string;
};

/** Consulta el CUIT en el padrón de ARCA y devuelve razón social, domicilio y condición IVA. */
export function ValidarCuitButton({ cuit, onResult, cache, size = "sm", className }: Props) {
  const { data: user } = useUser();
  const [loading, setLoading] = useState(false);
  const valid = isValidCuitChecksum(cuit);

  const run = async () => {
    if (!valid || !cuit) {
      toast.error("Ingresá un CUIT válido para consultar en ARCA");
      return;
    }
    setLoading(true);
    try {
      const result = await consultarPadron(user, cuit, cache);
      onResult(result);
      if (!result.activo) {
        toast.warning(`ARCA: la clave fiscal de ${result.razonSocial} figura ${result.estadoClave}`);
      } else {
        toast.success(
          `ARCA: ${result.razonSocial} · ${getTaxConditionLabel(result.condicion)}${
            result.condicionInferida ? " (sin IVA ni monotributo: confirmá la condición)" : ""
          }`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo consultar ARCA");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={run}
      disabled={loading || !valid}
      title={valid ? "Consultar el CUIT en el padrón de ARCA" : "El CUIT no es válido"}
      className={cn("shrink-0", className)}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
      <span className="ml-1.5">Validar en ARCA</span>
    </Button>
  );
}

/** Marca "Validado en ARCA" con la fecha de la última consulta. */
export function ArcaPadronBadge({
  snapshot,
  className,
}: {
  snapshot?: TArcaPadronSnapshot | null;
  className?: string;
}) {
  if (!snapshot?.validatedAt) return null;
  const date = new Date(snapshot.validatedAt);
  const inactive = snapshot.estadoClave && snapshot.estadoClave.toUpperCase() !== "ACTIVO";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        inactive ? "text-amber-700" : "text-emerald-700",
        className,
      )}
      title={`${snapshot.razonSocial} · ${getTaxConditionLabel(snapshot.condicion)}`}
    >
      <BadgeCheck className="h-3.5 w-3.5" />
      {inactive ? `ARCA: clave ${snapshot.estadoClave}` : "Validado en ARCA"} ·{" "}
      {isNaN(date.getTime()) ? "" : date.toLocaleDateString("es-AR")}
    </span>
  );
}

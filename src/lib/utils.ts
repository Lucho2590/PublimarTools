import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatearPrecio = (valor: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(valor);
};

export const formatDate = (timestamp: any) => {
  if (!timestamp) return "-";
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toLocaleDateString("es-AR");
  }
  if (timestamp instanceof Date) {
    return timestamp.toLocaleDateString("es-AR");
  }
  return new Date(timestamp).toLocaleDateString("es-AR");
};

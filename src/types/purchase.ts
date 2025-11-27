export enum EPurchaseDepartment {
  BANDERAS = "banderas",
  VIA_PUBLICA = "via_publica",
  ADMINISTRACION = "administracion",
}

export interface TPurchase {
  id?: string;
  providerId: string;
  providerName?: string; // opcional para mostrar rápido
  date: string; // formato YYYY-MM-DD
  description: string;
  amount: number;
  department: EPurchaseDepartment; // Área a la que se imputa la compra
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
} 
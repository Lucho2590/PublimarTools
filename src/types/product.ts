import { Timestamp } from "firebase/firestore";

export enum EProductCategory {
  NATIONAL_FLAG = "Bandera Nacional",
  CUSTOM_FLAG = "Bandera Personalizada",
  ACCESSORY = "Accesorio",
}

export enum EProductStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
}

export type TProductCategory = {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TProductVariant = {
  id: string;
  size: string; // Ejemplo: "90x150"
  price: string | number;
  stock: string | number;
  sku?: string;
};

export type TProduct = {
  id: string;
  name: string;
  description: string;
  categories: string[]; // IDs de las categorías
  imageUrls: string[];
  hasVariants: boolean;
  price: number | null;
  stock: number | null;
  sku: string;
  taxRate: number; // Porcentaje de IVA
  size: string;
  variants: TProductVariant[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

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

export interface TProductVariant {
  id: string;
  size: string;
  price: number | string;
  stock: number | string;
  sku?: string;
}

export interface TProduct {
  id: string;
  name: string;
  description?: string;
  variants: TProductVariant[];
  categories: string[];
  taxRate: number;
  price: number | string;
  stock: number | string;
  category?: string;
  createdAt?: Date;
  updatedAt?: Date;
  imageUrls: never[];
  hasVariants: boolean;
  sku: string;
}

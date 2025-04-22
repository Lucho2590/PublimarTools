export enum EProductCategory {
  NATIONAL_FLAG = "Bandera Nacional",
  CUSTOM_FLAG = "Bandera Personalizada",
  ACCESSORY = "Accesorio",
}

export enum EProductStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
}

export type TProductVariant = {
  id: string;
  size: string;
  price: number;
  stock: number;
  sku?: string;
};

export type TProduct = {
  id: string;
  name: string;
  description: string;
  category: EProductCategory;
  status: EProductStatus;
  imageUrls: string[];
  hasVariants: boolean;
  price?: number; // Si no tiene variantes
  stock?: number; // Si no tiene variantes
  sku?: string;
  createdAt: Date;
  updatedAt: Date;
};

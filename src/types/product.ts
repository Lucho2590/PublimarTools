
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

  export type TProductGroup = {
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
    /** Costo unitario de la variante. Opcional: habilita el margen real en Rentabilidad. */
    cost?: number;
    /** Si false, esta variante NO descuenta stock al venderse. Ausente/undefined = descuenta (default). */
    discountStock?: boolean;
  }
  
  export interface TProduct {
    lowStock: boolean;
    ecommerce: boolean;
    salesCount: number;
    totalSales: number;
    id: string;
    name: string;
    description?: string;
    variants: TProductVariant[];
    categories: string[];
    group?: string; // ID del grupo al que pertenece
    taxRate?: number; // Opcional para compatibilidad con productos existentes
    price: number | string;
    stock: number | string;
    /** Costo unitario del producto. Opcional: habilita el margen real en Rentabilidad. */
    cost?: number;
    category?: string;
    createdAt?: Date;
    updatedAt?: Date;
    imageUrls: never[];
    hasVariants: boolean;
    sku: string;
    slug?: string;
  }
  
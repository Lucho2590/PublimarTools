export interface TPurchase {
  id?: string;
  providerId: string;
  providerName?: string; // opcional para mostrar rápido
  date: string; // formato YYYY-MM-DD
  description: string;
  amount: number;
  createdAt?: Date;
  updatedAt?: Date;
} 
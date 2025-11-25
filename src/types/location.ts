export type TLocation = {
  id: string;
  name: string;
  address?: string;
  description?: string;
  lat: number;
  lng: number;
  createdAt: Date;
  updatedAt?: Date;
};

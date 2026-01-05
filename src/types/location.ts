import { TDeviceType } from "./device";

export type TLocationDevice = {
  deviceTypeId: string;
  deviceTypeName?: string;
  quantity: number;
};

export type TLocation = {
  id: string;
  code: string;
  address?: string;
  description?: string;
  lat: number;
  lng: number;
  createdAt: Date;
  updatedAt?: Date;
  devices?: TLocationDevice[];
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactNote?: string;
  photos?: string[]; // URLs de fotos en Firebase Storage
};

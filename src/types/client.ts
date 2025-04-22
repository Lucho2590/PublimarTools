export enum EClientType {
  INDIVIDUAL = "individual",
  COMPANY = "company",
}

export enum EClientStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
}

export type TClientContact = {
  name: string;
  email: string;
  phone: string;
  position?: string;
};

export type TClient = {
  id: string;
  name: string;
  type: EClientType;
  status: EClientStatus;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string; // CUIT/CUIL
  notes?: string;
  contacts: TClientContact[];
  createdAt: Date;
  updatedAt: Date;
};

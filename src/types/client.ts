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
  businessName?: string; // Razón social para empresas
  email?: string;
  phone?: string;
  address?: string;
  cuit?: string; // CUIT/CUIL
  notes?: string;
  contacts?: TClientContact[];
  createdAt: Date;
  updatedAt: Date;
};

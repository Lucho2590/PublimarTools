import { DocumentReference } from "firebase/firestore";

export enum EClientType {
    INDIVIDUAL = "individual",
    COMPANY = "company",
  }

  export enum EClientStatus {
    ACTIVE = "active",
    INACTIVE = "inactive",
  }

  export enum EClientSection {
    BANDERAS = "banderas",
    VIA_PUBLICA = "viaPublica",
  }

  export enum EClientTaxCondition {
    IVA_INSCRIPTO = "ivaInscripto",
    IVA_EXENTO = "ivaExento",
    IVA_NO_ALCANZADO = "ivaNoAlcanzado",
    CONSUMIDOR_FINAL = "consumidorFinal",
  }

  export type TClientContact = {
    name: string;
    email: string;
    phone: string;
    position?: string;
  };

  export type TRazonSocial = {
    razonSocial: string;
    fantasyName?: string;
    cuit?: string;
    taxCondition?: EClientTaxCondition; // Condición frente al IVA
  };

  export type TClient = {
    ref: DocumentReference;
    id: string;
    name: string;
    type: EClientType;
    status: EClientStatus;
    section: EClientSection; // Sección del cliente (banderas o vía pública)
    businessName?: string; // Razón social principal para empresas
    fantasyName?: string; // Nombre de fantasía para empresas
    razonesSociales?: TRazonSocial[]; // Razones sociales adicionales
    email?: string;
    phone?: string;
    address?: string;
    cuit?: string; // CUIT/CUIL
    taxCondition?: EClientTaxCondition; // Condición frente al IVA
    reference?: string; // Referencia del cliente
    notes?: string;
    contacts?: TClientContact[];
    createdAt: Date;
    updatedAt: Date;
  };
  
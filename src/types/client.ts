import { DocumentReference } from "firebase/firestore";
import type { TArcaPadronSnapshot } from "./arca";

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
    MONOTRIBUTO = "monotributo",
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
    domicilio?: string; // Domicilio fiscal (para facturar con esta razón social)
    arcaPadron?: TArcaPadronSnapshot; // Última validación del CUIT en ARCA
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
    dni?: string; // Para Factura B a consumidor final identificado
    arcaPadron?: TArcaPadronSnapshot; // Última validación del CUIT en ARCA
    reference?: string; // Referencia del cliente
    notes?: string;
    contacts?: TClientContact[];
    /** Etiquetas de tipo de cliente (ids de settings/whatsappBot.customerSegments). */
    tags?: string[];
    createdAt: Date;
    updatedAt: Date;
  };
  
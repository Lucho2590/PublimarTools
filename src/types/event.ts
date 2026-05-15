export enum EEventSection {
  BANDERAS = "banderas",
  VIA_PUBLICA = "viaPublica",
  ADMINISTRACION = "administracion",
}

export type TEvent = {
  id: string;
  title: string;
  description?: string;
  date: Date;
  section?: EEventSection; // Sección a la que pertenece el evento
  createdBy: string;
  createdByName?: string; // Nombre del creador
  createdAt: Date;
}; 
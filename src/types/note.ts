export enum ENoteSection {
  BANDERAS = "banderas",
  VIA_PUBLICA = "viaPublica",
}

export type TNote = {
  id: string;
  userId: string; // ID del usuario dueño de la nota
  userName: string; // Nombre del usuario
  section: ENoteSection; // En qué sección está (Banderas o Vía Pública)
  content: string; // Contenido de la nota
  createdAt: Date;
  updatedAt: Date;
};

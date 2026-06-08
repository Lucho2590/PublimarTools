export enum EUserRole {
    SUPERUSER = "superuser",
    ADMIN = "admin",
    BANDERAS = "banderas",
    VIA_PUBLICA = "via_publica",
}

export enum EUserStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
}

export type TUser = {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: EUserRole;
  status: EUserStatus;
  createdAt: Date;
  lastLogin?: Date;
  /**
   * Permisos puntuales por usuario: lista de paths de módulos habilitados
   * (ej. "/publimar/administracion/finanzas"). Es aditivo respecto al rol:
   * amplía el acceso, nunca lo restringe. Ver src/lib/permissions.ts.
   */
  permissions?: string[];
};

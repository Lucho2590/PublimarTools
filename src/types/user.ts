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
  /**
   * Celular del operador en E.164 sin "+" ni "0" de trunk, con código de país
   * (UY "59899123456", AR "5491123456789"). Se guarda normalizado para ser
   * comparable directamente contra el phone que el bot de WhatsApp persiste en
   * las conversaciones. Ver src/lib/phone.ts.
   */
  phone?: string;
};

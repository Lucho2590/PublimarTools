export enum EUserRole {
  ADMIN = "admin",
  STAFF = "staff",
  VIEWER = "viewer",
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
};

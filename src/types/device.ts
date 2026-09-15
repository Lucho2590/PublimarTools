import { TPinColorKey } from "@/lib/pinColors";

export type TDeviceType = {
  id: string;
  name: string;
  description?: string;
  afiche?: number      // cuántos afiches rinde cada dispositivo
  /** Color del pin en el mapa de ubicaciones. Ausente = DEFAULT_PIN_COLOR_KEY. */
  pinColor?: TPinColorKey;
  createdAt?: Date;
  updatedAt?: Date;
};

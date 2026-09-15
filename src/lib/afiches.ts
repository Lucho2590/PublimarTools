import { TDeviceType } from "@/types/device";
import { TLocationDevice } from "@/types/location";

/** Índice `deviceTypeId -> afiches por unidad`, para no hacer un find lineal por dispositivo. */
export function buildAficheMap(deviceTypes: TDeviceType[]): Map<string, number> {
  return new Map(deviceTypes.map((dt) => [dt.id, Number(dt.afiche) || 0]));
}

/**
 * Total de afiches de una ubicación.
 * `source` puede ser el array de tipos o un Map ya construido con `buildAficheMap`.
 */
export function calcularTotalAfiches(
  locationDevices: TLocationDevice[] | undefined,
  source: TDeviceType[] | Map<string, number>,
): number {
  if (!locationDevices?.length) return 0;
  const aficheByType = source instanceof Map ? source : buildAficheMap(source);
  return locationDevices.reduce(
    (total, device) =>
      total + (Number(device.quantity) || 0) * (aficheByType.get(device.deviceTypeId) ?? 0),
    0,
  );
}

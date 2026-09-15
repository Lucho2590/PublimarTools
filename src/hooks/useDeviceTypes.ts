import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, doc, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useCallback, useMemo } from "react";
import collections from "@/lib/collections";
import { filterActive, softDelete } from "@/lib/softDelete";
import { isPinColorKey } from "@/lib/pinColors";
import { TDeviceType } from "@/types/device";

const COLLECTION_NAME = collections.DEVICES;

type TDeviceTypeInput = Omit<TDeviceType, "id" | "createdAt" | "updatedAt">;

export function useDeviceTypes() {
  const firestore = useFirestore();

  const devicesCollection = useMemo(
    () => collection(firestore, COLLECTION_NAME),
    [firestore],
  );

  // Sin orderBy de Firestore: ordena case-sensitive y descarta los docs sin el campo.
  const { status, data } = useFirestoreCollectionData(devicesCollection, {
    idField: "id",
  });

  const deviceTypes = useMemo<TDeviceType[]>(
    () =>
      filterActive(data as any[])
        .map((device) => ({
          id: device.id,
          name: device.name ?? "",
          description: device.description || undefined,
          afiche: Number(device.afiche) || 0,
          pinColor: isPinColorKey(device.pinColor) ? device.pinColor : undefined,
        }))
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
        ),
    [data],
  );

  const createDeviceType = useCallback(
    async (deviceType: TDeviceTypeInput) => {
      const docRef = await addDoc(devicesCollection, {
        ...deviceType,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    },
    [devicesCollection],
  );

  const updateDeviceType = useCallback(
    async (id: string, patch: Partial<TDeviceTypeInput>) => {
      const ref = doc(firestore, COLLECTION_NAME, id);
      await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
    },
    [firestore],
  );

  const softDeleteDeviceType = useCallback(
    async (id: string) => {
      await softDelete(firestore, COLLECTION_NAME, id);
    },
    [firestore],
  );

  return {
    deviceTypes,
    loading: status === "loading",
    error: status === "error",
    createDeviceType,
    updateDeviceType,
    softDeleteDeviceType,
  };
}

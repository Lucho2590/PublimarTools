import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection } from "firebase/firestore";
import { useMemo } from "react";
import collections from "@/lib/collections";
import { filterActive } from "@/lib/softDelete";
import { TLocation } from "@/types/location";

const COLLECTION_NAME = collections.LOCATIONS;

/** Lectura de ubicaciones activas. El alta/edición sigue viviendo en la página de Ubicaciones. */
export function useLocations() {
  const firestore = useFirestore();

  const locationsCollection = useMemo(
    () => collection(firestore, COLLECTION_NAME),
    [firestore],
  );

  const { status, data } = useFirestoreCollectionData(locationsCollection, {
    idField: "id",
  });

  const locations = useMemo<TLocation[]>(
    () =>
      filterActive(data as any[]).map((loc) => ({
        id: loc.id,
        code: loc.code,
        lat: loc.lat,
        lng: loc.lng,
        description: loc.description,
        address: loc.address,
        devices: loc.devices || [],
        photos: loc.photos || [],
        contactName: loc.contactName,
        contactPhone: loc.contactPhone,
        contactEmail: loc.contactEmail,
        contactNote: loc.contactNote,
        createdAt: loc.createdAt?.toDate?.(),
      })),
    [data],
  );

  return {
    locations,
    loading: status === "loading",
    error: status === "error",
  };
}

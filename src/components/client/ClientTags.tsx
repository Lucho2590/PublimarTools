"use client";

import { useMemo } from "react";
import { useFirestore, useFirestoreDocData } from "reactfire";
import { arrayRemove, arrayUnion, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import collections from "@/lib/collections";
import { cn } from "@/lib/utils";
import {
  BOT_CONFIG_DOC_ID,
  mergeBotConfig,
  resolveSegments,
  segmentStyle,
} from "@/lib/bot/defaults";
import { TBotCustomerSegment } from "@/types/bot";

/**
 * Etiquetas de tipo de cliente (escuela, municipio, revendedor…). Se definen en
 * WhatsApp > Bot > Entrenamiento y el bot las asigna al confirmar un pedido.
 */
export function useClientTagOptions(): TBotCustomerSegment[] {
  const firestore = useFirestore();
  const ref = useMemo(() => doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID), [firestore]);
  const { data } = useFirestoreDocData(ref);
  return useMemo(() => resolveSegments(mergeBotConfig(data as any)), [data]);
}

export function tagLabel(id: string, options: TBotCustomerSegment[]): string {
  return options.find((o) => o.id === id)?.label || id;
}

export function ClientTagBadge({
  id,
  options,
  onRemove,
}: {
  id: string;
  options: TBotCustomerSegment[];
  onRemove?: () => void;
}) {
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap inline-flex items-center gap-1",
        segmentStyle(id)
      )}
    >
      {tagLabel(id, options)}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${tagLabel(id, options)}`}
          className="hover:opacity-70"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/** Etiquetas editables de un cliente: se guardan al instante. */
export function ClientTagsEditor({ clientId, tags }: { clientId: string; tags: string[] }) {
  const firestore = useFirestore();
  const options = useClientTagOptions();
  const ref = doc(firestore, collections.CLIENTS, clientId);
  const available = options.filter((o) => !tags.includes(o.id));

  const add = async (id: string) => {
    await updateDoc(ref, { tags: arrayUnion(id), updatedAt: serverTimestamp() });
    toast.success(`Etiqueta "${tagLabel(id, options)}" agregada`);
  };
  const remove = (id: string) =>
    updateDoc(ref, { tags: arrayRemove(id), updatedAt: serverTimestamp() });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {tags.map((t) => (
        <ClientTagBadge key={t} id={t} options={options} onRemove={() => remove(t)} />
      ))}
      {available.length > 0 && (
        <Select value="" onValueChange={add}>
          <SelectTrigger className="h-7 w-auto gap-1 border-dashed text-xs px-2">
            <SelectValue placeholder="+ Tipo de cliente" />
          </SelectTrigger>
          <SelectContent>
            {available.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

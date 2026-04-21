import {
  useFirestore,
  useFirestoreCollectionData,
  useFirestoreDocData
} from 'reactfire'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  orderBy,
  query,
  limit,
  where,
  serverTimestamp,
  DocumentReference
} from 'firebase/firestore'
import { useCallback, useMemo } from 'react'
import { TClient, EClientSection } from '@/types/client'
import collections from '@/lib/collections'
import { softDelete } from '@/lib/softDelete'
import { useAuditLog } from '@/hooks/useAuditLog'
import { buildChanges } from '@/lib/auditLog'
import {
  EAuditAction,
  EAuditEntityType,
  EAuditSection,
} from '@/types/auditLog'

const COLLECTION_NAME = collections.CLIENTS

const CLIENT_WATCHED_FIELDS = [
  'name',
  'type',
  'status',
  'section',
  'businessName',
  'fantasyName',
  'razonesSociales',
  'email',
  'phone',
  'address',
  'cuit',
  'reference',
  'notes',
  'contacts',
]

function sectionForClient(section: EClientSection | undefined): EAuditSection {
  return section === EClientSection.VIA_PUBLICA
    ? EAuditSection.VIA_PUBLICA
    : EAuditSection.BANDERAS_CLIENTES
}

interface UseClientsOptions {
  pageSize?: number;
  orderByField?: string;
  orderDirection?: 'asc' | 'desc';
  section?: EClientSection;
}

export function useClients(options?: UseClientsOptions) {
  const firestore = useFirestore()
  const { logEvent } = useAuditLog()
  const pageSize = options?.pageSize
  const orderByField = options?.orderByField || "createdAt"
  const orderDirection = options?.orderDirection || "desc"
  const section = options?.section

  const clientsCollection = useMemo(
    () => collection(firestore, COLLECTION_NAME),
    [firestore]
  )

  const clientsQuery = useMemo(() => {
    let baseQuery = query(clientsCollection)

    if (section) {
      baseQuery = query(baseQuery, where("section", "==", section))
    }

    baseQuery = query(baseQuery, orderBy(orderByField, orderDirection))

    if (pageSize) {
      baseQuery = query(baseQuery, limit(pageSize))
    }

    return baseQuery
  }, [clientsCollection, orderByField, orderDirection, pageSize, section])

  const { status, data: clients } = useFirestoreCollectionData(clientsQuery, {
    idField: 'id',
  })

  const createClient = useCallback(async (client: Omit<TClient, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const docRef = await addDoc(clientsCollection, {
        ...client,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      const changes = buildChanges(null, client as any, CLIENT_WATCHED_FIELDS)
      await logEvent({
        section: sectionForClient(client.section),
        entityType: EAuditEntityType.CLIENT,
        entityId: docRef.id,
        entityLabel: client.name ?? null,
        action: EAuditAction.CREATE,
        description: `Creó el cliente ${client.name ?? ''}`.trim(),
        changes,
      })
      return docRef.id
    } catch (error) {
      console.error('Error al crear cliente:', error)
      throw new Error(`Error al crear cliente: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }, [clientsCollection, logEvent])

  const updateClient = useCallback(async (id: string, client: Partial<Omit<TClient, 'id' | 'createdAt' | 'updatedAt'>>) => {
    try {
      const docRef = doc(firestore, COLLECTION_NAME, id)
      const beforeSnap = await getDoc(docRef)
      const beforeData = beforeSnap.exists() ? (beforeSnap.data() as any) : null
      await updateDoc(docRef, {
        ...client,
        updatedAt: serverTimestamp()
      })
      const changes = buildChanges(beforeData, client as any, CLIENT_WATCHED_FIELDS)
      const changedFields = Object.keys(changes.after ?? {})
      await logEvent({
        section: sectionForClient((client.section as EClientSection | undefined) ?? beforeData?.section),
        entityType: EAuditEntityType.CLIENT,
        entityId: id,
        entityLabel: beforeData?.name ?? client.name ?? null,
        action: EAuditAction.UPDATE,
        description: changedFields.length
          ? `Editó el cliente ${beforeData?.name ?? ''} (${changedFields.join(', ')})`.trim()
          : `Editó el cliente ${beforeData?.name ?? ''}`.trim(),
        changes,
      })
    } catch (error) {
      console.error('Error al actualizar cliente:', error)
      throw new Error(`Error al actualizar cliente: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }, [firestore, logEvent])

  const deleteClient = useCallback(async (id: string) => {
    try {
      const docRef = doc(firestore, COLLECTION_NAME, id)
      const beforeSnap = await getDoc(docRef)
      const beforeData = beforeSnap.exists() ? (beforeSnap.data() as any) : null
      await softDelete(firestore, COLLECTION_NAME, id)
      await logEvent({
        section: sectionForClient(beforeData?.section),
        entityType: EAuditEntityType.CLIENT,
        entityId: id,
        entityLabel: beforeData?.name ?? null,
        action: EAuditAction.DELETE,
        description: `Eliminó el cliente ${beforeData?.name ?? ''}`.trim(),
      })
    } catch (error) {
      console.error('Error al eliminar cliente:', error)
      throw new Error(`Error al eliminar cliente: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }, [firestore, logEvent])

  return {
    clients: ((clients as TClient[]) || []).filter(c => !(c as any).deleted),
    loading: status === 'loading',
    error: status === 'error',
    createClient,
    updateClient,
    deleteClient
  }
}

export function useClientById(clientId: string | undefined) {
  const firestore = useFirestore()

  if (!clientId) {
    return {
      client: null,
      loading: false,
      error: false
    }
  }

  const clientRef = doc(firestore, COLLECTION_NAME, clientId)

  const { status, data: client } = useFirestoreDocData(clientRef, {
    idField: 'id',
  })

  return {
    client: client as TClient | null,
    loading: status === 'loading',
    error: status === 'error'
  }
}

export function useClient(id: string) {
  const firestore = useFirestore()
  const clientRef = doc(firestore, COLLECTION_NAME, id)

  const { status, data: client } = useFirestoreDocData(clientRef, {
    idField: 'id',
  })

  return {
    client: client as TClient | null,
    loading: status === 'loading',
    error: status === 'error'
  }
}

export function useClientByRef(clientRef: DocumentReference | undefined) {
  if (!clientRef) {
    return {
      client: null,
      loading: false,
      error: false
    }
  }

  const { status, data: client } = useFirestoreDocData(clientRef, {
    idField: 'id',
  })

  return {
    client: client as TClient | null,
    loading: status === 'loading',
    error: status === 'error'
  }
}

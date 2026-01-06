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
  deleteDoc,
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

const COLLECTION_NAME = collections.CLIENTS

interface UseClientsOptions {
  pageSize?: number; // Tamaño de página para paginación (limita cantidad de documentos)
  orderByField?: string; // Campo por el cual ordenar (default: "createdAt")
  orderDirection?: 'asc' | 'desc'; // Dirección del orden (default: "desc")
  section?: EClientSection; // Filtrar por sección (banderas o viaPublica)
}

export function useClients(options?: UseClientsOptions) {
  const firestore = useFirestore()
  const pageSize = options?.pageSize
  const orderByField = options?.orderByField || "createdAt"
  const orderDirection = options?.orderDirection || "desc"
  const section = options?.section

  // Memoizar la collection para evitar recrearla en cada render
  const clientsCollection = useMemo(
    () => collection(firestore, COLLECTION_NAME),
    [firestore]
  )

  // Memoizar la query con filtros opcionales
  const clientsQuery = useMemo(() => {
    let baseQuery = query(clientsCollection)

    // Filtrar por sección si se especifica
    if (section) {
      baseQuery = query(baseQuery, where("section", "==", section))
    }

    // Agregar ordenamiento
    baseQuery = query(baseQuery, orderBy(orderByField, orderDirection))

    // Si se especifica pageSize, limitar los resultados
    if (pageSize) {
      baseQuery = query(baseQuery, limit(pageSize))
    }

    return baseQuery
  }, [clientsCollection, orderByField, orderDirection, pageSize, section])
  
  const { status, data: clients } = useFirestoreCollectionData(clientsQuery, {
    idField: 'id',
  })

  // Memoizar las funciones para evitar recrearlas en cada render
  const createClient = useCallback(async (client: Omit<TClient, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const docRef = await addDoc(clientsCollection, {
        ...client,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      return docRef.id
    } catch (error) {
      console.error('Error al crear cliente:', error)
      throw new Error(`Error al crear cliente: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }, [clientsCollection])

  const updateClient = useCallback(async (id: string, client: Partial<Omit<TClient, 'id' | 'createdAt' | 'updatedAt'>>) => {
    try {
      const docRef = doc(firestore, COLLECTION_NAME, id)
      await updateDoc(docRef, {
        ...client,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error al actualizar cliente:', error)
      throw new Error(`Error al actualizar cliente: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }, [firestore])

  const deleteClient = useCallback(async (id: string) => {
    try {
      const docRef = doc(firestore, COLLECTION_NAME, id)
      await deleteDoc(docRef)
    } catch (error) {
      console.error('Error al eliminar cliente:', error)
      throw new Error(`Error al eliminar cliente: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }, [firestore])

  return {
    clients: (clients as TClient[]) || [],
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


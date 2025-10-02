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
  serverTimestamp,
  DocumentReference
} from 'firebase/firestore'
import { TClient } from '@/types/client'
import collections from '@/lib/collections'

const COLLECTION_NAME = collections.CLIENTS

export function useClients() {
  const firestore = useFirestore()
  const clientsCollection = collection(firestore, COLLECTION_NAME)
  const clientsQuery = query(clientsCollection, orderBy("createdAt", "desc"))
  
  const { status, data: clients } = useFirestoreCollectionData(clientsQuery, {
    idField: 'id',
  })

  const createClient = async (client: Omit<TClient, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const docRef = await addDoc(clientsCollection, {
        ...client,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      return docRef.id
    } catch (error) {
      console.error('Error al crear cliente:', error)
      throw new Error('Error al crear cliente')
    }
  }

  const updateClient = async (id: string, client: Partial<Omit<TClient, 'id' | 'createdAt' | 'updatedAt'>>) => {
    try {
      const docRef = doc(firestore, COLLECTION_NAME, id)
      await updateDoc(docRef, {
        ...client,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error al actualizar cliente:', error)
      throw new Error('Error al actualizar cliente')
    }
  }

  const deleteClient = async (id: string) => {
    try {
      const docRef = doc(firestore, COLLECTION_NAME, id)
      await deleteDoc(docRef)
    } catch (error) {
      console.error('Error al eliminar cliente:', error)
      throw new Error('Error al eliminar cliente')
    }
  }

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



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
  where,
  limit,
  serverTimestamp,
  getDoc
} from 'firebase/firestore'
import { useCallback, useMemo } from 'react'
import { EQuoteStatus, TQuote, TQuoteItem } from '@/types/quote'
import collections from '@/lib/collections'

const COLLECTION_NAME = collections.QUOTES

interface UseQuotesOptions {
  pageSize?: number;
  orderByField?: string;
  orderDirection?: 'asc' | 'desc';
}

export function useQuotes(options?: UseQuotesOptions) {
  const firestore = useFirestore()
  const pageSize = options?.pageSize
  const orderByField = options?.orderByField || "createdAt"
  const orderDirection = options?.orderDirection || "desc"

  const quotesCollection = useMemo(
    () => collection(firestore, COLLECTION_NAME),
    [firestore]
  )

  const quotesQuery = useMemo(() => {
    const baseQuery = query(
      quotesCollection,
      orderBy(orderByField, orderDirection)
    )

    if (pageSize) {
      return query(baseQuery, limit(pageSize))
    }

    return baseQuery
  }, [quotesCollection, orderByField, orderDirection, pageSize])

  const { status, data: quotes } = useFirestoreCollectionData(quotesQuery, {
    idField: 'id',
  })

  const createQuote = useCallback(async (quoteData: Partial<TQuote> & {
    number: string;
    client: any;
    status: EQuoteStatus;
    items: TQuoteItem[];
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    total: number;
  }) => {
    const cleanQuoteData = Object.fromEntries(
      Object.entries(quoteData).filter(([_, value]) => value !== undefined)
    )

    try {
      const docRef = await addDoc(quotesCollection, {
        ...cleanQuoteData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      return docRef.id
    } catch (error) {
      console.error('Error al crear presupuesto:', error)
      throw new Error(`Error al crear presupuesto: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }, [quotesCollection])

  const updateQuote = useCallback(async (id: string, quote: Partial<Omit<TQuote, 'id' | 'createdAt' | 'updatedAt'>>) => {
    try {
      const docRef = doc(firestore, COLLECTION_NAME, id)
      await updateDoc(docRef, {
        ...quote,
        updatedAt: serverTimestamp(),
      })
    } catch (error) {
      console.error('Error al actualizar presupuesto:', error)
      throw new Error(`Error al actualizar presupuesto: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }, [firestore])

  const deleteQuote = useCallback(async (id: string) => {
    try {
      const docRef = doc(firestore, COLLECTION_NAME, id)
      await deleteDoc(docRef)
      return true
    } catch (error) {
      console.error('Error al eliminar presupuesto:', error)
      throw new Error(`Error al eliminar presupuesto: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }, [firestore])

  const generateQuoteNumber = useCallback(() => {
    const quoteNumber = `P-${new Date().getFullYear()}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;
    return quoteNumber
  }, [])

  const changeQuoteStatus = useCallback(async (id: string, newStatus: EQuoteStatus) => {
    try {
      const updateData: any = {
        status: newStatus,
        updatedAt: serverTimestamp()
      }

      if (newStatus === EQuoteStatus.SENT) {
        updateData.sentAt = serverTimestamp()
      }

      if (newStatus === EQuoteStatus.CONFIRMED) {
        updateData.confirmedAt = serverTimestamp()
      }

      if (newStatus === EQuoteStatus.REJECTED) {
        updateData.rejectedAt = serverTimestamp()
      }

      await updateQuote(id, updateData)
    } catch (error) {
      console.error('Error al cambiar estado del presupuesto:', error)
      throw new Error(`Error al cambiar estado del presupuesto: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }, [updateQuote])

  const getQuoteById = useCallback(async (id: string): Promise<TQuote | null> => {
    try {
      const docRef = doc(firestore, COLLECTION_NAME, id)
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        } as TQuote
      } else {
        return null
      }
    } catch (error) {
      console.error('Error al obtener presupuesto por ID:', error)
      throw new Error('Error al obtener presupuesto')
    }
  }, [firestore])

  return {
    quotes: (quotes as TQuote[]) || [],
    loading: status === 'loading',
    error: status === 'error',
    createQuote,
    updateQuote,
    deleteQuote,
    generateQuoteNumber,
    changeQuoteStatus,
    getQuoteById
  }
}

export function useQuotesByClient(clientId: string) {
  const firestore = useFirestore()
  const quotesCollection = collection(firestore, COLLECTION_NAME)
  const quotesQuery = query(
    quotesCollection,
    where('client.id', '==', clientId),
    orderBy('createdAt', 'desc')
  )

  const { status, data: quotes } = useFirestoreCollectionData(quotesQuery, {
    idField: 'id',
  })

  return {
    quotes: (quotes as TQuote[]) || [],
    loading: status === 'loading',
    error: status === 'error'
  }
}

export function useQuoteById(id: string) {
  const firestore = useFirestore()
  const quoteRef = doc(firestore, COLLECTION_NAME, id)

  const { status, data: quote } = useFirestoreDocData(quoteRef, {
    idField: 'id',
  })

  return {
    quote: quote as TQuote | null,
    loading: status === 'loading',
    error: status === 'error'
  }
}

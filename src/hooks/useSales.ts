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
import { TSale, TSaleItem, EPaymentMethod } from '@/types/sale'
import collections from '@/lib/collections'
import { softDelete } from '@/lib/softDelete'

const COLLECTION_NAME = collections.SALES

interface UseSalesOptions {
  pageSize?: number; // Tamaño de página para paginación (limita cantidad de documentos)
  orderByField?: string; // Campo por el cual ordenar (default: "createdAt")
  orderDirection?: 'asc' | 'desc'; // Dirección del orden (default: "desc")
}

export function useSales(options?: UseSalesOptions) {
  const firestore = useFirestore()
  const pageSize = options?.pageSize
  const orderByField = options?.orderByField || "createdAt"
  const orderDirection = options?.orderDirection || "desc"
  
  // Memoizar la collection para evitar recrearla en cada render
  const salesCollection = useMemo(
    () => collection(firestore, COLLECTION_NAME),
    [firestore]
  )
  
  // Memoizar la query con paginación opcional
  const salesQuery = useMemo(() => {
    const baseQuery = query(
      salesCollection, 
      orderBy(orderByField, orderDirection)
    )
    
    // Si se especifica pageSize, limitar los resultados
    if (pageSize) {
      return query(baseQuery, limit(pageSize))
    }
    
    return baseQuery
  }, [salesCollection, orderByField, orderDirection, pageSize])
  
  const { status, data: sales } = useFirestoreCollectionData(salesQuery, {
    idField: 'id',
  })

  const createSale = useCallback(async (saleData: Partial<TSale> & {
    number: string;
    items: TSaleItem[];
    subtotal: number;
    total: number;
    paymentMethod: EPaymentMethod;
    isInvoiced: boolean;
  }) => {
    // Función para limpiar valores undefined recursivamente
    const cleanData = (obj: any, seen = new WeakSet()): any => {
      if (obj === null || obj === undefined) return null;
      if (typeof obj !== 'object') return obj;
      
      // Filtrar funciones y objetos internos de Firebase
      if (typeof obj === 'function') return undefined;
      
      // Protección contra referencias circulares
      if (seen.has(obj)) return {};
      seen.add(obj);
      
      if (Array.isArray(obj)) {
        return obj.map(item => cleanData(item, seen)).filter(item => item !== undefined);
      }
      
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Filtrar campos internos de Firebase/ReactFire
        if (key.startsWith('_') || 
            key === 'firestore' || 
            key === 'auth' ||
            key === 'converter' ||
            typeof value === 'function') {
          continue;
        }
        
        if (value !== undefined) {
          const cleanedValue = cleanData(value, seen);
          if (cleanedValue !== undefined) {
            cleaned[key] = cleanedValue;
          }
        }
      }
      return cleaned;
    };

    // Limpiar datos recursivamente
    const cleanSaleData = cleanData(saleData);
    
    try {
      const docRef = await addDoc(salesCollection, {
        ...cleanSaleData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      return docRef.id
    } catch (error) {
      console.error('Error al crear venta:', error)
      console.error('Datos que se intentaron guardar:', cleanSaleData)
      throw new Error(`Error al crear venta: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }, [salesCollection])

  const updateSale = useCallback(async (id: string, sale: Partial<Omit<TSale, 'id' | 'createdAt' | 'updatedAt'>>) => {
    // Función para limpiar valores undefined recursivamente
    const cleanData = (obj: any, seen = new WeakSet()): any => {
      if (obj === null || obj === undefined) return null;
      if (typeof obj !== 'object') return obj;
      
      // Filtrar funciones y objetos internos de Firebase
      if (typeof obj === 'function') return undefined;
      
      // Protección contra referencias circulares
      if (seen.has(obj)) return {};
      seen.add(obj);
      
      if (Array.isArray(obj)) {
        return obj.map(item => cleanData(item, seen)).filter(item => item !== undefined);
      }
      
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Filtrar campos internos de Firebase/ReactFire
        if (key.startsWith('_') || 
            key === 'firestore' || 
            key === 'auth' ||
            key === 'converter' ||
            typeof value === 'function') {
          continue;
        }
        
        if (value !== undefined) {
          const cleanedValue = cleanData(value, seen);
          if (cleanedValue !== undefined) {
            cleaned[key] = cleanedValue;
          }
        }
      }
      return cleaned;
    };

    // Limpiar datos recursivamente
    const cleanSaleData = cleanData(sale);

    try {
      const docRef = doc(firestore, COLLECTION_NAME, id)
      await updateDoc(docRef, {
        ...cleanSaleData,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error al actualizar venta:', error)
      throw new Error(`Error al actualizar venta: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }, [firestore])

  const deleteSale = useCallback(async (id: string) => {
    try {
      await softDelete(firestore, COLLECTION_NAME, id)
      return true
    } catch (error) {
      console.error('Error al eliminar venta:', error)
      throw new Error(`Error al eliminar venta: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }, [firestore])

  // Función auxiliar para generar número de venta
  const generateSaleNumber = useCallback(() => {
    const saleNumber = `V-${new Date().getFullYear()}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;
    return saleNumber
  }, [])

  // Función helper para crear una venta con valores por defecto
  const createSaleWithDefaults = useCallback((partialSale: Partial<TSale>) => {
    const defaults: Partial<TSale> = {
      items: [],
      subtotal: 0,
      taxRate: 0.21,
      taxAmount: 0,
      total: 0,
      applyIVA: true,
      discountPercentage: 0,
      discountAmount: 0,
      manualDiscount: 0,
      isInvoiced: false,
      invoiceNumber: null,
      ...partialSale
    }

    // Asegurar que los campos requeridos estén presentes
    if (!defaults.number) defaults.number = generateSaleNumber()
    if (!defaults.paymentMethod) defaults.paymentMethod = EPaymentMethod.CASH

    return defaults
  }, [generateSaleNumber])

  // Función para obtener una venta específica por ID (async para páginas)
  const getSaleById = useCallback(async (id: string): Promise<TSale | null> => {
    try {
      const docRef = doc(firestore, COLLECTION_NAME, id)
      const docSnap = await getDoc(docRef)
      
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        } as TSale
      } else {
        return null
      }
    } catch (error) {
      console.error('Error al obtener venta por ID:', error)
      throw new Error('Error al obtener venta')
    }
  }, [firestore])

  return {
    sales: ((sales as TSale[]) || []).filter(s => !(s as any).deleted),
    loading: status === 'loading',
    error: status === 'error',
    createSale,
    updateSale,
    deleteSale,
    generateSaleNumber,
    createSaleWithDefaults,
    getSaleById
  }
}

export function useSalesByClient(clientId: string) {
  const firestore = useFirestore()
  const salesCollection = collection(firestore, COLLECTION_NAME)
  const salesQuery = query(
    salesCollection, 
    where('clientId', '==', clientId),
    orderBy('createdAt', 'desc')
  )
  
  const { status, data: sales } = useFirestoreCollectionData(salesQuery, {
    idField: 'id',
  })

  return {
    sales: (sales as TSale[]) || [],
    loading: status === 'loading',
    error: status === 'error'
  }
}

export function useSalesByOrder(orderId: string) {
  const firestore = useFirestore()
  const salesCollection = collection(firestore, COLLECTION_NAME)
  const salesQuery = query(
    salesCollection, 
    where('orderId', '==', orderId),
    orderBy('createdAt', 'desc')
  )
  
  const { status, data: sales } = useFirestoreCollectionData(salesQuery, {
    idField: 'id',
  })

  return {
    sales: (sales as TSale[]) || [],
    loading: status === 'loading',
    error: status === 'error'
  }
}

export function useSale(id: string) {
  const firestore = useFirestore()
  const saleRef = doc(firestore, COLLECTION_NAME, id)
  
  const { status, data: sale } = useFirestoreDocData(saleRef, {
    idField: 'id',
  })

  return {
    sale: sale as TSale | null,
    loading: status === 'loading',
    error: status === 'error'
  }
}


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
  import { EOrderStatus, TOrder, TOrderItem } from '@/types/order'
  import collections from '@/lib/collections'
  import { softDelete } from '@/lib/softDelete'
  
  const COLLECTION_NAME = collections.ORDERS

  interface UseOrdersOptions {
    pageSize?: number; // Tamaño de página para paginación (limita cantidad de documentos)
    orderByField?: string; // Campo por el cual ordenar (default: "createdAt")
    orderDirection?: 'asc' | 'desc'; // Dirección del orden (default: "desc")
  }
  
  export function useOrders(options?: UseOrdersOptions) {
    const firestore = useFirestore()
    const pageSize = options?.pageSize
    const orderByField = options?.orderByField || "createdAt"
    const orderDirection = options?.orderDirection || "desc"
    
    // Memoizar la collection para evitar recrearla en cada render
    const ordenesCollection = useMemo(
      () => collection(firestore, COLLECTION_NAME),
      [firestore]
    )
    
    // Memoizar la query con paginación opcional
    const ordenesQuery = useMemo(() => {
      const baseQuery = query(
        ordenesCollection,
        orderBy(orderByField, orderDirection)
      )

      // Si se especifica pageSize, limitar los resultados
      if (pageSize) {
        return query(baseQuery, limit(pageSize))
      }

      return baseQuery
    }, [ordenesCollection, orderByField, orderDirection, pageSize])
    
    const { status, data: ordenes } = useFirestoreCollectionData(ordenesQuery, {
      idField: 'id',
    })
  
    const createOrder = useCallback(async (orderData: Partial<TOrder> & {
      number: string;
      quoteId: string;
      invoiceType: string;
      status: EOrderStatus;
      items: TOrderItem[];
      subtotal: number;
      taxRate: number;
      taxAmount: number;
      total: number;
      applyIVA: boolean;
    }) => {
      // Filtrar valores undefined
      const cleanOrderData = Object.fromEntries(
        Object.entries(orderData).filter(([_, value]) => value !== undefined)
      )
      
      try {
        const docRef = await addDoc(ordenesCollection, {
          ...cleanOrderData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
        return docRef.id
      } catch (error) {
        console.error('Error al crear orden:', error)
        console.error('Datos que se intentaron guardar:', cleanOrderData)
        throw new Error(`Error al crear orden: ${error instanceof Error ? error.message : 'Error desconocido'}`)
      }
    }, [ordenesCollection])
  
    const updateOrder = useCallback(async (id: string, orden: Partial<Omit<TOrder, 'id'  | 'createdAt' | 'updatedAt'>>) => {
      try {
        const docRef = doc(firestore, COLLECTION_NAME, id)
        await updateDoc(docRef, {
          ...orden,
          updatedAt: serverTimestamp(),
        })
      } catch (error) {
        console.error('Error al actualizar orden de trabajo:', error)
        if (error instanceof Error) {
          console.error('🚨 ERROR MESSAGE:', error.message)
          console.error('🚨 ERROR CODE:', (error as any).code)
          throw new Error(`Error al actualizar orden de trabajo: ${error.message}`)
        }
        throw new Error(`Error al actualizar orden de trabajo: ${error instanceof Error ? error.message : 'Error desconocido'}`)
      }
    }, [firestore])
  
    const deleteOrder = useCallback(async (id: string) => {
      try {
        await softDelete(firestore, COLLECTION_NAME, id)
        return true
      } catch (error) {
        console.error('Error al eliminar orden de trabajo:', error)
        throw new Error(`Error al eliminar orden de trabajo: ${error instanceof Error ? error.message : 'Error desconocido'}`)
      }
    }, [firestore])
  
    // Función auxiliar para generar número de orden
    const generateOrderNumber = useCallback(() => {
      const orderNumber = `O-${new Date().getFullYear()}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;
      return orderNumber
    }, [])

    // Función helper para crear una orden con valores por defecto
    const createOrderWithDefaults = useCallback((partialOrder: Partial<TOrder>) => {
      const defaults: Partial<TOrder> = {
        items: [],
        subtotal: 0,
        taxRate: 0.21,
        taxAmount: 0,
        total: 0,
        applyIVA: true,
        status: EOrderStatus.IN_PROCESS,
        invoiceType: 'B',
        ...partialOrder
      }

      // Asegurar que los campos requeridos estén presentes
      if (!defaults.number) defaults.number = generateOrderNumber()
      if (!defaults.quoteId) defaults.quoteId = `quote-${Date.now()}`

      return defaults
    }, [generateOrderNumber])
  
    // Función para crear orden de trabajo desde presupuesto aprobado
    // const crearOrdenDesdePresupuesto = async (presupuesto: TPresupuesto) => {
    //   try {
    //     const nuevaOrden: Omit<TOrdenTrabajo, 'id' | 'fechaCreacion' | 'fechaActualizacion'> = {
    //       numero: generarNumeroOrden(),
    //       presupuestoId: presupuesto.id!,
    //       presupuestoNumero: presupuesto.numero,
    //       clienteId: presupuesto.clienteId,
    //       vehiculoId: presupuesto.vehiculoId,
    //       estado: 'pendiente',
    //       descripcionGeneral: presupuesto.descripcionGeneral,
    //       items: presupuesto.items,
    //       subtotal: presupuesto.subtotal,
    //       descuento: presupuesto.descuento,
    //       manoDeObra: presupuesto.manoDeObra,
    //       aplicarIVA: presupuesto.aplicarIVA,
    //       impuestos: presupuesto.impuestos,
    //       total: presupuesto.total,
    //       observacionesPresupuesto: presupuesto.observaciones,
    //       prioridad: 'media' // Prioridad por defecto
    //     }
  
    //     const ordenId = await crearOrdenTrabajo(nuevaOrden)
    //     console.log(`Orden de trabajo ${nuevaOrden.numero} creada desde presupuesto ${presupuesto.numero}`)
    //     return ordenId
    //   } catch (error) {
    //     console.error('Error al crear orden desde presupuesto:', error)
    //     throw error
    //   }
    // }
  
    // Función para cambiar estado de la orden
    const changeOrderStatus = useCallback(async (id: string, nuevoEstado: TOrder['status']) => {
      try {
        const updateData: any = {
          status: nuevoEstado,
          updatedAt: serverTimestamp()
        }

        // Si se está iniciando el trabajo, agregar fecha de inicio
        if (nuevoEstado === EOrderStatus.IN_PROCESS) {
          updateData.startedAt = serverTimestamp()
        }

        // Si se está completando, agregar fecha de finalización
        if (nuevoEstado === EOrderStatus.COMPLETED) {
          updateData.completedAt = serverTimestamp()
        }
  
        await updateOrder(id, updateData)
      } catch (error) {
        console.error('Error al cambiar estado de la orden:', error)
        throw new Error(`Error al cambiar estado de la orden: ${error instanceof Error ? error.message : 'Error desconocido'}`)
      }
    }, [updateOrder])
  
    // Función para obtener una orden específica por ID (async para páginas)
    const getOrderById = useCallback(async (id: string): Promise<TOrder | null> => {
      try {
        const docRef = doc(firestore, COLLECTION_NAME, id)
        const docSnap = await getDoc(docRef)
        
        if (docSnap.exists()) {
          return {
            id: docSnap.id,
            ...docSnap.data()
          } as TOrder
        } else {
          return null
        }
      } catch (error) {
        console.error('Error al obtener orden por ID:', error)
        throw new Error('Error al obtener orden de trabajo')
      }
    }, [firestore])
  
    return {
      ordenes: ((ordenes as TOrder[]) || []).filter(o => !(o as any).deleted),
      loading: status === 'loading',
      error: status === 'error',
      createOrder,
      updateOrder,
      deleteOrder,
      generateOrderNumber,
      createOrderWithDefaults,
      changeOrderStatus,
      getOrderById
    }
  }
  
  export function useOrdenesPorCliente(clienteId: string) {
    const firestore = useFirestore()
    const ordenesCollection = collection(firestore, COLLECTION_NAME)
    const ordenesQuery = query(
      ordenesCollection, 
      where('clientId', '==', clienteId),
      orderBy('createdAt', 'desc')
    )
    
    const { status, data: ordenes } = useFirestoreCollectionData(ordenesQuery, {
      idField: 'id',
    })
  
    return {
      ordenes: (ordenes as TOrder[]) || [],
      loading: status === 'loading',
      error: status === 'error'
    }
  }
  
  export function useOrderById(id: string) {
    const firestore = useFirestore()
    const ordenRef = doc(firestore, COLLECTION_NAME, id)
    
    const { status, data: orden } = useFirestoreDocData(ordenRef, {
      idField: 'id',
    })
  
    return {
      orden: orden as TOrder | null,
      loading: status === 'loading',
      error: status === 'error'
    }
  } 
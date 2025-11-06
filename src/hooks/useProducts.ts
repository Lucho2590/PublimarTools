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
  getDoc,
  orderBy,
  query,
  serverTimestamp,
  DocumentReference
} from 'firebase/firestore'
import { TProduct } from '@/types/product'
import collections from '@/lib/collections'

const COLLECTION_NAME = collections.PRODUCTS

export function useProducts() {
  const firestore = useFirestore()
  const productsCollection = collection(firestore, COLLECTION_NAME)
  const productsQuery = query(productsCollection, orderBy("name"))
  
  const { status, data: products } = useFirestoreCollectionData(productsQuery, {
    idField: 'id',
  })

  const createProduct = async (product: Omit<TProduct, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const docRef = await addDoc(productsCollection, {
        ...product,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      return docRef.id
    } catch (error) {
      console.error('Error al crear producto:', error)
      throw new Error('Error al crear producto')
    }
  }

  const updateProduct = async (id: string, product: Partial<Omit<TProduct, 'id' | 'createdAt' | 'updatedAt'>>) => {
    try {
      const docRef = doc(firestore, COLLECTION_NAME, id)
      await updateDoc(docRef, {
        ...product,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error al actualizar producto:', error)
      throw new Error('Error al actualizar producto')
    }
  }

  const deleteProduct = async (id: string) => {
    try {
      const docRef = doc(firestore, COLLECTION_NAME, id)
      await deleteDoc(docRef)
    } catch (error) {
      console.error('Error al eliminar producto:', error)
      throw new Error('Error al eliminar producto')
    }
  }

  // Función específica para actualizar stock de una variante
  const updateVariantStock = async (productId: string, variantId: string, newStock: number) => {
    try {
      const productRef = doc(firestore, COLLECTION_NAME, productId)
      const productDoc = await getDoc(productRef)
      
      if (!productDoc.exists()) {
        throw new Error('Producto no encontrado')
      }

      const product = { id: productDoc.id, ...productDoc.data() } as TProduct
      const updatedVariants = product.variants.map(variant =>
        variant.id === variantId
          ? { ...variant, stock: newStock }
          : variant
      )

      await updateDoc(productRef, {
        variants: updatedVariants,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error al actualizar stock de variante:', error)
      throw new Error('Error al actualizar stock de variante')
    }
  }

  // Función para actualizar contadores de ventas
  const updateSalesCounters = async (productId: string, quantity: number) => {
    try {
      const productRef = doc(firestore, COLLECTION_NAME, productId)
      const productDoc = await getDoc(productRef)
      
      if (!productDoc.exists()) {
        throw new Error('Producto no encontrado')
      }

      const product = { id: productDoc.id, ...productDoc.data() } as TProduct
      const currentTotalSales = product.totalSales || 0
      const currentSalesCount = product.salesCount || 0

      await updateDoc(productRef, {
        totalSales: currentTotalSales + quantity,
        salesCount: currentSalesCount + 1,
        lastSaleDate: new Date(),
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error al actualizar contadores de ventas:', error)
      throw new Error('Error al actualizar contadores de ventas')
    }
  }

  return {
    products: (products as TProduct[]) || [],
    loading: status === 'loading',
    error: status === 'error',
    createProduct,
    updateProduct,
    deleteProduct,
    updateVariantStock,
    updateSalesCounters
  }
}

export function useProductById(productId: string | undefined) {
  const firestore = useFirestore()
  
  if (!productId) {
    return {
      product: null,
      loading: false,
      error: false
    }
  }
  
  const productRef = doc(firestore, COLLECTION_NAME, productId)
  
  const { status, data: product } = useFirestoreDocData(productRef, {
    idField: 'id',
  })

  return {
    product: product as TProduct | null,
    loading: status === 'loading',
    error: status === 'error'
  }
}

export function useProduct(productId: string) {
  const firestore = useFirestore()
  const productRef = doc(firestore, COLLECTION_NAME, productId)
  
  const { status, data: product } = useFirestoreDocData(productRef, {
    idField: 'id',
  })

  return {
    product: product as TProduct | null,
    loading: status === 'loading',
    error: status === 'error'
  }
}

export function useProductByRef(productRef: DocumentReference | undefined) {
  if (!productRef) {
    return {
      product: null,
      loading: false,
      error: false
    }
  }
  
  const { status, data: product } = useFirestoreDocData(productRef, {
    idField: 'id',
  })

  return {
    product: product as TProduct | null,
    loading: status === 'loading',
    error: status === 'error'
  }
}


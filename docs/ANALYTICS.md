# 📊 Sistema de Analytics - PublimarTools

Documentación completa del sistema de analytics que permite rastrear el comportamiento de usuarios en BanderasMDP y analizar métricas en PublimarTools.

## 🎯 Visión General

El sistema de analytics implementa un **enfoque dual de tracking**:

1. **Firebase Analytics**: Para eventos estándar de Google Analytics (GA4)
2. **Firestore Analytics**: Para análisis personalizado y dashboard administrativo

```
┌─────────────────────────────────────────┐
│     BanderasMDP (Tienda Online)         │
│                                         │
│  User Action → Track Event              │
└─────────────┬───────────────────────────┘
              │
              ├────────────────┬───────────────────┐
              │                │                   │
              ▼                ▼                   ▼
   ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐
   │   Firebase   │  │   Firestore     │  │   Firestore      │
   │   Analytics  │  │   Collections   │  │   Aggregations   │
   │   (GA4)      │  │   (Events)      │  │   (Analytics)    │
   └──────────────┘  └─────────────────┘  └──────────────────┘
                             │                      │
                             │                      │
                             ▼                      ▼
              ┌──────────────────────────────────────────┐
              │   PublimarTools (Admin Dashboard)        │
              │                                          │
              │   - Embudo de conversión                │
              │   - Top productos                       │
              │   - Búsquedas sin resultados           │
              │   - Métricas en tiempo real            │
              └──────────────────────────────────────────┘
```

## 📚 Colecciones de Firestore

### 1. `productAnalytics`

**Propósito**: Almacenar estadísticas **agregadas** por producto

**Estructura**: Documento por `productId`

```typescript
interface TProductAnalytics {
  productId: string
  productName: string
  productSku?: string

  // Métricas de visualización
  viewsCount: number           // Total de vistas
  uniqueViewsCount: number     // Vistas únicas (por sesión)
  lastViewedAt?: Timestamp     // Última vez visto

  // Métricas de carrito
  addToCartCount: number       // Veces agregado al carrito
  removeFromCartCount: number  // Veces removido del carrito

  // Métricas de conversión
  purchasedCount: number       // Cantidad vendida
  totalRevenue: number         // Ingresos totales

  // Tasas de conversión (calculadas)
  conversionRate: number       // purchasedCount / viewsCount
  cartConversionRate: number   // purchasedCount / addToCartCount

  // Metadata
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**Ejemplo de documento**:
```json
{
  "productId": "bandera-argentina-150x90",
  "productName": "Bandera Argentina 150x90cm",
  "productSku": "BA-150-90",
  "viewsCount": 342,
  "uniqueViewsCount": 187,
  "addToCartCount": 45,
  "removeFromCartCount": 8,
  "purchasedCount": 12,
  "totalRevenue": 24000,
  "conversionRate": 0.035,
  "cartConversionRate": 0.267,
  "lastViewedAt": "2026-01-04T15:30:00Z",
  "createdAt": "2025-12-01T10:00:00Z",
  "updatedAt": "2026-01-04T15:30:00Z"
}
```

### 2. `productViewEvents`

**Propósito**: Almacenar cada vista de producto **individualmente** para análisis detallado

**Estructura**: Un documento por cada vista

```typescript
interface TProductViewEvent {
  productId: string
  productName: string
  sessionId: string
  timestamp: Timestamp

  // Contexto de la vista
  source?: "tienda" | "busqueda" | "destacados" | "categorias"
  searchTerm?: string
  category?: string

  // Metadata del usuario
  metadata?: {
    userAgent?: string
    referrer?: string
    deviceType?: "mobile" | "tablet" | "desktop"
  }
}
```

**Uso**: Permite responder preguntas como:
- ¿Desde dónde llegan los usuarios a este producto?
- ¿Qué término de búsqueda los llevó aquí?
- ¿En qué horarios se ve más?

### 3. `searchQueries`

**Propósito**: Rastrear todas las búsquedas realizadas en la tienda

```typescript
interface TSearchQuery {
  searchTerm: string      // Término buscado (lowercase, trimmed)
  resultsCount: number    // Cantidad de resultados
  sessionId: string
  timestamp: Timestamp

  // Si hubo click en algún resultado
  clickedProductId?: string
  clickedPosition?: number

  // Metadata
  source?: "tienda" | "home"
}
```

**Análisis clave**:
- Búsquedas sin resultados (`resultsCount === 0`)
  - Indica productos que faltan en el catálogo
  - Oportunidades de negocio
- Términos más buscados
- Tasa de click-through

### 4. `conversionFunnels`

**Propósito**: Rastrear el embudo de conversión por sesión de usuario

**Estructura**: Un documento por `sessionId`

```typescript
interface TConversionFunnel {
  sessionId: string

  // Productos en cada etapa
  viewedProducts: string[]      // IDs de productos vistos
  addedToCart: string[]        // IDs agregados al carrito
  purchasedProducts: string[]  // IDs comprados

  // Timestamps de progresión
  firstViewAt: Timestamp
  firstAddToCartAt?: Timestamp
  checkoutAt?: Timestamp
  purchaseAt?: Timestamp

  // Estado actual del embudo
  stage: "viewed" | "added_to_cart" | "checkout" | "purchased" | "abandoned"

  // Totales
  totalProductsViewed: number
  totalProductsInCart: number
  totalProductsPurchased: number
  totalRevenue: number

  // Metadata
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**Cálculos del embudo**:
```typescript
// Tasa de conversión View → Cart
viewToCartRate = (sessionsWithCart / totalSessions) * 100

// Tasa de conversión Cart → Checkout
cartToCheckoutRate = (sessionsInCheckout / sessionsWithCart) * 100

// Tasa de conversión Checkout → Purchase
checkoutToPurchaseRate = (sessionsPurchased / sessionsInCheckout) * 100

// Tasa de conversión total
overallConversionRate = (sessionsPurchased / totalSessions) * 100
```

## 🔄 Funciones de Tracking

### Ubicación de Archivos

**BanderasMDP** (donde se trackean los eventos):
- `/lib/analytics.ts` - Firebase Analytics tracking
- `/lib/analyticsHelpers.ts` - Firestore analytics tracking

**PublimarTools** (donde se visualizan):
- `/src/app/publimar/banderas/tienda/analytics/page.tsx` - Dashboard

### Tracking de Vistas de Producto

```typescript
// lib/analyticsHelpers.ts - BanderasMDP

export async function trackProductView(
  product: TProduct,
  source?: "tienda" | "busqueda" | "destacados" | "categorias",
  searchTerm?: string
): Promise<void> {
  const sessionId = getOrCreateSessionId()

  // 1. Guardar evento individual
  const viewEvent = {
    productId: product.id,
    productName: product.name,
    sessionId,
    timestamp: serverTimestamp(),
    source,
    searchTerm,
    category: product.categories?.[0],
    metadata: {
      userAgent: window.navigator.userAgent,
      referrer: document.referrer
    }
  }

  await addDoc(collection(db, "productViewEvents"), viewEvent)

  // 2. Actualizar analytics agregados
  await updateProductAnalytics({
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    incrementViews: 1
  })

  // 3. Actualizar embudo de conversión (silencioso si falla)
  updateConversionFunnel({
    action: "view",
    productId: product.id
  }).catch(err => {
    console.warn("⚠️ Conversion funnel tracking skipped:", err.message)
  })
}
```

**Llamado**:
```typescript
// En la página de producto
useEffect(() => {
  if (product) {
    trackProductView(product, "tienda")
  }
}, [product])
```

### Tracking de Agregado al Carrito

```typescript
export async function trackProductAddToCart(
  product: TProduct,
  quantity: number
): Promise<void> {
  // Actualizar analytics agregados
  await updateProductAnalytics({
    productId: product.id,
    productName: product.name,
    incrementAddToCart: quantity
  })

  // Actualizar embudo de conversión
  updateConversionFunnel({
    action: "add_to_cart",
    productId: product.id
  }).catch(err => {
    console.warn("⚠️ Conversion funnel tracking skipped:", err.message)
  })
}
```

**Llamado**:
```typescript
const handleAddToCart = () => {
  addToCart(product, selectedVariant, quantity)
  trackProductAddToCart(product, quantity)
  trackAddToCart(product, quantity, selectedVariant?.name) // Firebase Analytics
}
```

### Tracking de Compras

```typescript
export async function trackProductPurchase(
  product: TProduct,
  quantity: number,
  revenue: number
): Promise<void> {
  await updateProductAnalytics({
    productId: product.id,
    productName: product.name,
    incrementPurchased: quantity,
    addRevenue: revenue
  })

  updateConversionFunnel({
    action: "purchase",
    productId: product.id,
    revenue
  }).catch(err => {
    console.warn("⚠️ Conversion funnel tracking skipped:", err.message)
  })
}
```

**Llamado**:
```typescript
// Cuando se confirma una orden en el admin
const handleConfirmOrder = async (order: TEcommerceOrder) => {
  // ... confirmar orden

  // Track purchase para cada producto
  for (const item of order.items) {
    await trackProductPurchase(
      item.product,
      item.quantity,
      item.price * item.quantity
    )
  }
}
```

### Tracking de Búsquedas

```typescript
export async function trackSearchQuery(
  searchTerm: string,
  resultsCount: number,
  source: "tienda" | "home" = "tienda"
): Promise<void> {
  const sessionId = getOrCreateSessionId()

  const searchQuery = {
    searchTerm: searchTerm.toLowerCase().trim(),
    resultsCount,
    sessionId,
    source,
    timestamp: serverTimestamp()
  }

  await addDoc(collection(db, "searchQueries"), searchQuery)
}
```

**Llamado**:
```typescript
const handleSearch = (term: string) => {
  const results = searchProducts(term)
  setSearchResults(results)

  // Track search
  trackSearchQuery(term, results.length)
  trackSearch(term, results.length) // Firebase Analytics
}
```

### Tracking de Checkout

```typescript
export async function trackCheckoutStarted(): Promise<void> {
  updateConversionFunnel({
    action: "checkout",
    productId: "" // No se necesita productId específico
  }).catch(err => {
    console.warn("⚠️ Conversion funnel tracking skipped:", err.message)
  })
}
```

**Llamado**:
```typescript
const handleCheckout = () => {
  trackCheckoutStarted()
  trackBeginCheckout(cartTotal, cartItemsCount) // Firebase Analytics

  // Abrir WhatsApp con mensaje
  window.open(whatsappLink, "_blank")
}
```

## 🔧 Funciones Helper

### Actualizar Analytics de Producto

```typescript
async function updateProductAnalytics(
  input: UpdateProductAnalyticsInput
): Promise<void> {
  const { productId, productName, productSku, ...increments } = input
  const docRef = doc(db, "productAnalytics", productId)
  const docSnap = await getDoc(docRef)

  if (docSnap.exists()) {
    // Actualizar documento existente
    const updateData: any = {
      updatedAt: serverTimestamp()
    }

    if (increments.incrementViews) {
      updateData.viewsCount = increment(increments.incrementViews)
      updateData.lastViewedAt = serverTimestamp()
    }
    if (increments.incrementAddToCart) {
      updateData.addToCartCount = increment(increments.incrementAddToCart)
    }
    if (increments.incrementPurchased) {
      updateData.purchasedCount = increment(increments.incrementPurchased)
    }
    if (increments.addRevenue) {
      updateData.totalRevenue = increment(increments.addRevenue)
    }

    await updateDoc(docRef, updateData)

    // Recalcular tasas de conversión
    const updatedDoc = await getDoc(docRef)
    const data = updatedDoc.data() as TProductAnalytics

    const conversionRate = data.viewsCount > 0
      ? data.purchasedCount / data.viewsCount
      : 0
    const cartConversionRate = data.addToCartCount > 0
      ? data.purchasedCount / data.addToCartCount
      : 0

    await updateDoc(docRef, {
      conversionRate,
      cartConversionRate
    })
  } else {
    // Crear nuevo documento
    const newAnalytics = {
      productId,
      productName,
      productSku,
      viewsCount: increments.incrementViews || 0,
      uniqueViewsCount: increments.incrementUniqueViews || 0,
      addToCartCount: increments.incrementAddToCart || 0,
      removeFromCartCount: increments.incrementRemoveFromCart || 0,
      purchasedCount: increments.incrementPurchased || 0,
      totalRevenue: increments.addRevenue || 0,
      conversionRate: 0,
      cartConversionRate: 0,
      lastViewedAt: increments.incrementViews ? serverTimestamp() : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }

    await setDoc(docRef, newAnalytics)
  }
}
```

**Uso de `increment()`**:
```typescript
// Firestore increment - atómico y thread-safe
updateData.viewsCount = increment(1)  // Suma 1 al valor actual
updateData.totalRevenue = increment(price)  // Suma price al total
```

### Actualizar Embudo de Conversión

```typescript
async function updateConversionFunnel(params: {
  action: "view" | "add_to_cart" | "checkout" | "purchase"
  productId: string
  revenue?: number
}): Promise<void> {
  const sessionId = getOrCreateSessionId()
  const docRef = doc(db, "conversionFunnels", sessionId)
  const docSnap = await getDoc(docRef)

  if (docSnap.exists()) {
    // Actualizar embudo existente
    const data = docSnap.data() as TConversionFunnel
    const updateData: any = {
      updatedAt: serverTimestamp()
    }

    if (params.action === "view" && !data.viewedProducts.includes(params.productId)) {
      updateData.viewedProducts = [...data.viewedProducts, params.productId]
      updateData.totalProductsViewed = data.totalProductsViewed + 1
    }

    if (params.action === "add_to_cart") {
      if (!data.addedToCart.includes(params.productId)) {
        updateData.addedToCart = [...data.addedToCart, params.productId]
        updateData.totalProductsInCart = data.totalProductsInCart + 1
      }
      if (!data.firstAddToCartAt) {
        updateData.firstAddToCartAt = serverTimestamp()
      }
      if (data.stage === "viewed") {
        updateData.stage = "added_to_cart"
      }
    }

    if (params.action === "checkout") {
      updateData.checkoutAt = serverTimestamp()
      updateData.stage = "checkout"
    }

    if (params.action === "purchase") {
      if (!data.purchasedProducts.includes(params.productId)) {
        updateData.purchasedProducts = [...data.purchasedProducts, params.productId]
        updateData.totalProductsPurchased = data.totalProductsPurchased + 1
      }
      if (params.revenue) {
        updateData.totalRevenue = data.totalRevenue + params.revenue
      }
      updateData.purchaseAt = serverTimestamp()
      updateData.stage = "purchased"
    }

    await updateDoc(docRef, updateData)
  } else {
    // Crear nuevo embudo
    const newFunnel = {
      sessionId,
      viewedProducts: params.action === "view" ? [params.productId] : [],
      addedToCart: params.action === "add_to_cart" ? [params.productId] : [],
      purchasedProducts: params.action === "purchase" ? [params.productId] : [],
      firstViewAt: serverTimestamp(),
      firstAddToCartAt: params.action === "add_to_cart" ? serverTimestamp() : undefined,
      checkoutAt: params.action === "checkout" ? serverTimestamp() : undefined,
      purchaseAt: params.action === "purchase" ? serverTimestamp() : undefined,
      stage: params.action,
      totalProductsViewed: params.action === "view" ? 1 : 0,
      totalProductsInCart: params.action === "add_to_cart" ? 1 : 0,
      totalProductsPurchased: params.action === "purchase" ? 1 : 0,
      totalRevenue: params.revenue || 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }

    await setDoc(docRef, newFunnel)
  }
}
```

### Gestión de Sesiones

```typescript
// lib/ecommerceOrderHelpers.ts

export function getOrCreateSessionId(): string {
  const SESSION_KEY = "analytics_session_id"
  const SESSION_DURATION = 30 * 60 * 1000 // 30 minutos

  if (typeof window === "undefined") return ""

  const stored = localStorage.getItem(SESSION_KEY)

  if (stored) {
    const { sessionId, timestamp } = JSON.parse(stored)
    const now = Date.now()

    // Si la sesión es válida (< 30 min), reutilizarla
    if (now - timestamp < SESSION_DURATION) {
      return sessionId
    }
  }

  // Crear nueva sesión
  const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  localStorage.setItem(SESSION_KEY, JSON.stringify({
    sessionId: newSessionId,
    timestamp: Date.now()
  }))

  return newSessionId
}
```

**Importante**: Una sesión dura 30 minutos de inactividad. Después se crea una nueva.

## 📊 Dashboard de Analytics

### Ubicación

**Ruta**: `/publimar/banderas/tienda/analytics`

**Archivo**: `src/app/publimar/banderas/tienda/analytics/page.tsx`

### Métricas Mostradas

#### 1. Embudo de Conversión

**Query**:
```typescript
const funnelQuery = query(collection(firestore, "conversionFunnels"))
const funnelSnapshot = await getDocs(funnelQuery)
const funnelData = funnelSnapshot.docs.map(doc => doc.data()) as TConversionFunnel[]
```

**Cálculos**:
```typescript
const totalSessions = funnelData.length

const viewedOnly = funnelData.filter(f => f.stage === "viewed").length

const addedToCart = funnelData.filter(
  f => f.stage === "added_to_cart" || f.stage === "checkout" || f.stage === "purchased"
).length

const checkedOut = funnelData.filter(
  f => f.stage === "checkout" || f.stage === "purchased"
).length

const purchased = funnelData.filter(f => f.stage === "purchased").length

// Tasas de conversión
const viewToCartRate = totalSessions > 0 ? (addedToCart / totalSessions) * 100 : 0
const cartToCheckoutRate = addedToCart > 0 ? (checkedOut / addedToCart) * 100 : 0
const checkoutToPurchaseRate = checkedOut > 0 ? (purchased / checkedOut) * 100 : 0
const overallConversionRate = totalSessions > 0 ? (purchased / totalSessions) * 100 : 0
```

**Visualización**:
- 4 Cards con métricas principales
- Barras de progreso mostrando cada etapa del embudo
- Porcentajes de conversión entre etapas

#### 2. Top 10 Productos Más Vistos

**Query**:
```typescript
const productsQuery = query(
  collection(firestore, "productAnalytics"),
  orderBy("viewsCount", "desc"),
  limit(10)
)
const productsSnapshot = await getDocs(productsQuery)
const productsData = productsSnapshot.docs.map(doc => ({
  ...doc.data(),
  id: doc.id
})) as TProductAnalytics[]
```

**Tabla muestra**:
- Ranking
- Nombre del producto
- SKU
- Vistas totales
- Veces en carrito
- Cantidad comprada
- Tasa de conversión (color-coded)
- Ingresos totales

**Color coding de conversión**:
```typescript
const getConversionColor = (rate: number) => {
  if (rate >= 0.1) return "text-green-600"  // ≥10% - Excelente
  if (rate >= 0.05) return "text-orange-600" // 5-10% - Regular
  return "text-red-600"                      // <5% - Bajo
}
```

#### 3. Top 10 Búsquedas Sin Resultados

**Query**:
```typescript
const searchesQuery = query(
  collection(firestore, "searchQueries"),
  where("resultsCount", "==", 0),
  orderBy("timestamp", "desc"),
  limit(50)
)
const searchesSnapshot = await getDocs(searchesQuery)
const searchesData = searchesSnapshot.docs.map(doc => doc.data()) as TSearchQuery[]
```

**Agrupación por término**:
```typescript
const groupedSearches = searchesWithNoResults.reduce((acc, search) => {
  const term = search.searchTerm.toLowerCase()
  if (!acc[term]) {
    acc[term] = { term, count: 0, lastSearched: search.timestamp }
  }
  acc[term].count++
  if (search.timestamp > acc[term].lastSearched) {
    acc[term].lastSearched = search.timestamp
  }
  return acc
}, {} as Record<string, { term: string; count: number; lastSearched: Timestamp }>)

const topSearchesNoResults = Object.values(groupedSearches)
  .sort((a, b) => b.count - a.count)
  .slice(0, 10)
```

**Tabla muestra**:
- Ranking
- Término de búsqueda
- Cantidad de veces buscado
- Última vez buscado

**Utilidad**: Identificar productos faltantes en el catálogo

## 🔐 Manejo de Errores

### Patrón de Error Silencioso

El tracking de analytics **nunca debe romper la UX del usuario**. Por eso se usa el patrón:

```typescript
try {
  // Tracking principal
  await trackProductView(product)

  // Tracking secundario (embudo) - silencioso si falla
  updateConversionFunnel({
    action: "view",
    productId: product.id
  }).catch(err => {
    console.warn("⚠️ Conversion funnel tracking skipped:", err.message)
  })

} catch (error) {
  console.error("❌ Error tracking:", error)
  // NO throw - continuar la ejecución
}
```

**Razones para fallo silencioso**:
1. Permisos de Firestore pueden estar restringidos en desarrollo
2. Usuario puede estar offline
3. Rate limits de Firebase
4. El tracking no debe bloquear la compra

### Firebase Security Rules

Las reglas deben permitir **escritura anónima** en colecciones de analytics:

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Analytics - Escritura anónima, lectura autenticada
    match /productAnalytics/{productId} {
      allow write: if true;  // Permitir tracking anónimo
      allow read: if request.auth != null;  // Solo admin
    }

    match /productViewEvents/{eventId} {
      allow write: if true;
      allow read: if request.auth != null;
    }

    match /searchQueries/{queryId} {
      allow write: if true;
      allow read: if request.auth != null;
    }

    match /conversionFunnels/{sessionId} {
      allow write: if true;
      allow read: if request.auth != null;
    }
  }
}
```

## 🌊 Flujos de Analytics

### Flow 1: Vista de Producto

```
Usuario abre /tienda/[slug]
         │
         ▼
┌──────────────────────────┐
│  useEffect() en página   │
│  detecta producto        │
└───────────┬──────────────┘
            │
            ▼
┌──────────────────────────────────┐
│  trackProductView(product)       │
└───────┬──────────────────────────┘
        │
        ├───────────────┬─────────────────┬──────────────────┐
        │               │                 │                  │
        ▼               ▼                 ▼                  ▼
┌──────────────┐ ┌─────────────┐ ┌────────────────┐ ┌──────────────┐
│ Firebase GA  │ │ Firestore:  │ │  Firestore:    │ │  Firestore:  │
│ view_item    │ │ productView │ │  product       │ │  conversion  │
│ event        │ │ Events      │ │  Analytics     │ │  Funnels     │
│              │ │             │ │  (increment)   │ │  (update)    │
└──────────────┘ └─────────────┘ └────────────────┘ └──────────────┘
```

### Flow 2: Agregar al Carrito

```
Usuario click "Agregar al Carrito"
         │
         ▼
┌──────────────────────────────────┐
│  handleAddToCart()               │
│  - addToCart(product, variant)   │
│  - trackProductAddToCart()       │
│  - trackAddToCart() [GA]         │
└───────────┬──────────────────────┘
            │
            ├──────────────┬────────────────┐
            │              │                │
            ▼              ▼                ▼
┌─────────────────┐ ┌──────────────┐ ┌──────────────┐
│  CartContext    │ │  Firestore:  │ │  Firestore:  │
│  state update   │ │  product     │ │  conversion  │
│                 │ │  Analytics   │ │  Funnels     │
│                 │ │  +addToCart  │ │  stage→cart  │
└─────────────────┘ └──────────────┘ └──────────────┘
```

### Flow 3: Checkout

```
Usuario click "Finalizar Compra"
         │
         ▼
┌──────────────────────────────────┐
│  handleCheckout()                │
│  - trackCheckoutStarted()        │
│  - trackBeginCheckout() [GA]     │
│  - Abrir WhatsApp                │
└───────────┬──────────────────────┘
            │
            ├──────────────┬────────────────┐
            │              │                │
            ▼              ▼                ▼
┌─────────────────┐ ┌──────────────┐ ┌──────────────┐
│  WhatsApp Web   │ │  Firestore:  │ │  Firestore:  │
│  wa.me/...      │ │  conversion  │ │  abandoned   │
│                 │ │  Funnels     │ │  Carts       │
│                 │ │  stage→      │ │  (create)    │
│                 │ │  checkout    │ │              │
└─────────────────┘ └──────────────┘ └──────────────┘
```

### Flow 4: Compra Confirmada (Admin)

```
Admin confirma orden en PublimarTools
         │
         ▼
┌──────────────────────────────────┐
│  handleConfirmOrder()            │
│  - Update order status           │
│  - For each item:                │
│    trackProductPurchase()        │
└───────────┬──────────────────────┘
            │
            ├──────────────┬────────────────┐
            │              │                │
            ▼              ▼                ▼
┌─────────────────┐ ┌──────────────┐ ┌──────────────┐
│  ecommerce      │ │  Firestore:  │ │  Firestore:  │
│  Orders         │ │  product     │ │  conversion  │
│  status→        │ │  Analytics   │ │  Funnels     │
│  confirmed      │ │  +purchased  │ │  stage→      │
│                 │ │  +revenue    │ │  purchased   │
└─────────────────┘ └──────────────┘ └──────────────┘
```

### Flow 5: Búsqueda

```
Usuario escribe en barra de búsqueda
         │
         ▼
┌──────────────────────────────────┐
│  handleSearch(term)              │
│  - searchProducts(term)          │
│  - trackSearchQuery()            │
│  - trackSearch() [GA]            │
└───────────┬──────────────────────┘
            │
            ├──────────────┬────────────────┐
            │              │                │
            ▼              ▼                ▼
┌─────────────────┐ ┌──────────────┐ ┌──────────────┐
│  Results UI     │ │  Firestore:  │ │  Firebase GA │
│  shown          │ │  search      │ │  search      │
│                 │ │  Queries     │ │  event       │
│  (n results)    │ │              │ │              │
└─────────────────┘ └──────────────┘ └──────────────┘
                           │
                           │ If resultsCount === 0
                           ▼
                    ┌────────────────┐
                    │  Aparece en    │
                    │  "Búsquedas    │
                    │   sin          │
                    │   resultados"  │
                    │  en dashboard  │
                    └────────────────┘
```

## 📈 Métricas Clave y KPIs

### Conversión General

```typescript
// Tasa de conversión global
conversionRate = (totalPurchases / totalSessions) * 100

// Tasa de abandono de carrito
cartAbandonmentRate = (cartsAbandoned / (cartsAbandoned + cartsConverted)) * 100
```

### Por Producto

```typescript
// Popularidad
popularityScore = viewsCount

// Engagement
engagementRate = (addToCartCount / viewsCount) * 100

// Conversión
productConversionRate = (purchasedCount / viewsCount) * 100

// Revenue per view
revenuePerView = totalRevenue / viewsCount
```

### Búsquedas

```typescript
// Búsquedas problemáticas
noResultsRate = (searchesWithZeroResults / totalSearches) * 100

// Top términos sin resultados
const topMissingProducts = groupBy(
  searchQueries.filter(q => q.resultsCount === 0),
  "searchTerm"
).sort((a, b) => b.count - a.count)
```

## 🎯 Casos de Uso

### 1. Identificar Productos Estrella

**Objetivo**: Encontrar productos con alta conversión para promocionar

**Query**:
```typescript
const starProducts = await getDocs(
  query(
    collection(db, "productAnalytics"),
    where("conversionRate", ">=", 0.1),  // Conversión ≥ 10%
    orderBy("conversionRate", "desc"),
    limit(5)
  )
)
```

### 2. Detectar Productos con Bajo Rendimiento

**Objetivo**: Productos con muchas vistas pero pocas ventas

**Query**:
```typescript
const underperformers = await getDocs(
  query(
    collection(db, "productAnalytics"),
    where("viewsCount", ">=", 100),      // Mínimo 100 vistas
    where("conversionRate", "<=", 0.02), // Conversión ≤ 2%
    orderBy("viewsCount", "desc")
  )
)
```

**Acción**: Revisar precio, descripción, imágenes, o considerar descontinuar

### 3. Oportunidades de Catálogo

**Objetivo**: Productos que los usuarios buscan pero no existen

**Dashboard**: Sección "Búsquedas Sin Resultados"

**Acción**: Agregar productos más buscados al catálogo

### 4. Optimización del Embudo

**Objetivo**: Identificar dónde los usuarios abandonan

**Análisis**:
```typescript
// Si viewToCartRate es bajo (<5%)
// → Problema: Producto no convence
// → Solución: Mejorar descripción, imágenes, precio

// Si cartToCheckoutRate es bajo (<30%)
// → Problema: Abandono en carrito
// → Solución: Facilitar checkout, reducir fricción

// Si checkoutToPurchaseRate es bajo (<70%)
// → Problema: Abandono en último paso
// → Solución: Simplificar WhatsApp flow, agregar opciones de pago
```

## 🔍 Debugging Analytics

### Logs en Desarrollo

Todos los eventos logean en consola:

```typescript
if (process.env.NODE_ENV === "development") {
  console.log(`📊 Analytics Event: ${eventName}`, params)
}
```

### Verificar Tracking

**En BanderasMDP** (Chrome DevTools):

1. Abrir producto → Ver console log "📊 Product view tracked"
2. Agregar al carrito → Ver "📊 Add to cart tracked"
3. Buscar → Ver "📊 Search tracked"

**En PublimarTools**:

1. Ir a `/publimar/banderas/tienda/analytics`
2. Verificar que aparezcan datos en las tablas
3. Refrescar página para ver datos actualizados

### Verificar Firestore

**Firebase Console**:

1. Ir a Firestore Database
2. Revisar colecciones:
   - `productAnalytics` → Ver viewsCount incrementándose
   - `productViewEvents` → Ver nuevos documentos
   - `conversionFunnels` → Ver nuevas sesiones
   - `searchQueries` → Ver búsquedas

## ⚡ Optimizaciones

### 1. Batching de Escrituras

Para alta carga, considerar batch writes:

```typescript
const batch = writeBatch(db)

batch.set(doc(db, "productViewEvents", eventId), viewEvent)
batch.update(doc(db, "productAnalytics", productId), updateData)
batch.update(doc(db, "conversionFunnels", sessionId), funnelData)

await batch.commit()
```

### 2. Índices Compuestos

Para queries complejas, crear índices:

```javascript
// Índice para búsquedas sin resultados ordenadas por fecha
{
  collection: "searchQueries",
  fields: [
    { field: "resultsCount", order: "ASCENDING" },
    { field: "timestamp", order: "DESCENDING" }
  ]
}

// Índice para productos populares con buena conversión
{
  collection: "productAnalytics",
  fields: [
    { field: "conversionRate", order: "DESCENDING" },
    { field: "viewsCount", order: "DESCENDING" }
  ]
}
```

### 3. Caché de Dashboard

Implementar caché para evitar queries repetidas:

```typescript
const [lastFetch, setLastFetch] = useState<number>(0)
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutos

const loadAnalytics = async (force = false) => {
  const now = Date.now()

  if (!force && now - lastFetch < CACHE_DURATION) {
    console.log("📊 Using cached analytics")
    return
  }

  // Fetch fresh data
  await fetchAnalyticsData()
  setLastFetch(now)
}
```

## 🚀 Mejoras Futuras

### 1. Agregaciones Diarias

Crear Cloud Function que corra diariamente:

```typescript
// Firebase Cloud Function
export const aggregateDailyMetrics = functions.pubsub
  .schedule("0 1 * * *") // 1 AM diaria
  .onRun(async () => {
    const yesterday = getYesterdayDateString()

    // Calcular métricas del día anterior
    const metrics = await calculateDailyMetrics(yesterday)

    // Guardar en dailyMetrics collection
    await setDoc(doc(db, "dailyMetrics", yesterday), metrics)
  })
```

### 2. Heatmaps de Clicks

Trackear clicks en elementos de producto:

```typescript
export async function trackProductClick(
  productId: string,
  element: "image" | "title" | "price" | "buy_button"
): Promise<void> {
  await addDoc(collection(db, "productClicks"), {
    productId,
    element,
    timestamp: serverTimestamp()
  })
}
```

### 3. A/B Testing

Sistema de experimentos:

```typescript
interface ABTest {
  testId: string
  variantA: string
  variantB: string
  metric: "conversionRate" | "addToCartRate"
  startDate: Timestamp
  endDate: Timestamp
}
```

### 4. Notificaciones Automáticas

Alertar cuando:
- Producto estrella se queda sin stock
- Término sin resultados supera X búsquedas
- Tasa de conversión cae por debajo de umbral

---

**Última actualización**: Enero 2026

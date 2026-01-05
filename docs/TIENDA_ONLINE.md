# 🛒 Sistema de Tienda Online - PublimarTools

Documentación completa del módulo de gestión de e-commerce para BanderasMDP.

## 📋 Índice

1. [Overview](#overview)
2. [Dashboard Principal](#dashboard-principal)
3. [Gestión de Pedidos](#gestión-de-pedidos)
4. [Gestión de Carritos Abandonados](#gestión-de-carritos-abandonados)
5. [Sistema de Recuperación por WhatsApp](#sistema-de-recuperación-por-whatsapp)
6. [Estructura de Datos](#estructura-de-datos)
7. [Estados y Lifecycle](#estados-y-lifecycle)
8. [Notificaciones](#notificaciones)

---

## Overview

El sistema de tienda online permite a los administradores de PublimarTools gestionar todos los pedidos realizados desde la tienda pública [BanderasMDP](https://banderasmdp.com).

### Características Principales

- ✅ Dashboard con KPIs en tiempo real
- ✅ Gestión completa de pedidos
- ✅ Cambio rápido de estados
- ✅ Visualización de carritos abandonados
- ✅ Recuperación automática por WhatsApp
- ✅ Sistema de notificaciones (badges)
- ✅ Exportación de datos (CSV, Excel)
- ✅ Analytics de conversión

### Rutas

```
/publimar/banderas/tienda                     → Dashboard principal
/publimar/banderas/tienda/pedidos             → Lista de todos los pedidos
/publimar/banderas/tienda/[orderId]           → Detalle de pedido
/publimar/banderas/tienda/carritos-abandonados → Carritos abandonados
/publimar/banderas/tienda/analytics           → Analytics avanzado
```

---

## Dashboard Principal

**Ruta**: `/publimar/banderas/tienda/page.tsx`

### KPIs Mostrados

#### 1. Pedidos Hoy
```typescript
{
  count: number        // Cantidad de pedidos del día
  revenue: number      // Revenue total del día
  icon: Calendar
}
```

**Cálculo**:
```typescript
const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

const todayOrdersQuery = query(
  collection(firestore, "ecommerceOrders"),
  where("createdAt", ">=", Timestamp.fromDate(startOfToday)),
  orderBy("createdAt", "desc")
)
```

#### 2. Pedidos del Mes
```typescript
{
  count: number        // Cantidad de pedidos del mes
  revenue: number      // Revenue total del mes
  icon: TrendingUp
}
```

**Cálculo**:
```typescript
const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

const monthOrdersQuery = query(
  collection(firestore, "ecommerceOrders"),
  where("createdAt", ">=", Timestamp.fromDate(startOfMonth)),
  orderBy("createdAt", "desc")
)
```

#### 3. Carritos Abandonados
```typescript
{
  count: number        // Cantidad de carritos NO convertidos
  value: number        // Valor total perdido
  icon: AlertTriangle
}
```

**Cálculo**:
```typescript
const abandonedQuery = query(
  collection(firestore, "abandonedCarts"),
  where("converted", "==", false)  // IMPORTANTE: No filtrar por abandoned
)

const value = carts.reduce((sum, cart) => sum + cart.total, 0)
```

**Nota importante**: No filtramos por `abandoned: true` porque algunos carritos con customer info nunca se marcaron como abandonados (el evento `beforeunload` no se disparó). Por eso filtramos solo por `converted: false`.

#### 4. Tasa de Conversión
```typescript
{
  rate: number         // % de carritos que compraron
  icon: ShoppingBag
}
```

**Cálculo**:
```typescript
const totalCartsCount = await getCountFromServer(
  collection(firestore, "abandonedCarts")
)

const convertedCartsCount = await getCountFromServer(
  query(
    collection(firestore, "abandonedCarts"),
    where("converted", "==", true)
  )
)

const conversionRate = (convertedCartsCount / totalCartsCount) * 100
```

### Secciones del Dashboard

#### Últimos 5 Pedidos
Muestra los pedidos más recientes con:
- Número de pedido (BND-YYYYMMDD-XXXX)
- Fecha de creación
- Cantidad de items
- Total
- Estado (con badge de color)
- Botón "Ver" para ir al detalle

#### Últimos 5 Carritos Abandonados
Muestra los carritos abandonados más recientes con:
- Fecha de abandono (o última actividad)
- Cantidad de items
- Total (en color naranja)
- Dispositivo y navegador

### Botones de Acción

```typescript
// 3 botones principales en el header

1. "Ver Todos los Pedidos" → /tienda/pedidos
   Badge: Muestra cantidad de pedidos no vistos

2. "Carritos Abandonados" → /tienda/carritos-abandonados
   Badge: Muestra cantidad de carritos no vistos

3. "Ver Analytics" → /tienda/analytics
   Sin badge
```

---

## Gestión de Pedidos

**Ruta**: `/publimar/banderas/tienda/pedidos/page.tsx`

### Funcionalidades

#### 1. Lista de Todos los Pedidos

**Query**:
```typescript
const ordersQuery = query(
  collection(firestore, "ecommerceOrders"),
  orderBy("createdAt", "desc")
)
```

**Columnas de la tabla**:
- N° Pedido (formato: BND-20260102-0001)
- Cliente (nombre, email, teléfono)
- Fecha
- Items (cantidad)
- Total (formateado como moneda)
- Status (dropdown con cambio rápido)
- Acciones (Ver, Eliminar)

#### 2. Cambio Rápido de Status

**Estados disponibles**:
```typescript
enum OrderStatus {
  PENDING = "pending",       // Pendiente (amarillo)
  CONFIRMED = "confirmed",   // Confirmado (azul)
  IN_PROGRESS = "in_progress", // En proceso (morado)
  DELIVERED = "delivered",   // Entregado (verde)
  CANCELLED = "cancelled"    // Cancelado (rojo)
}
```

**Implementación**:
```typescript
const handleStatusChange = async (order: TEcommerceOrder, newStatus: string) => {
  const updateData: any = {
    status: newStatus,
    updatedAt: Timestamp.now(),
  }

  // Agregar timestamps según el estado
  if (newStatus === "confirmed" && !order.confirmedAt) {
    updateData.confirmedAt = Timestamp.now()
  }
  if (newStatus === "in_progress" && !order.inProgressAt) {
    updateData.inProgressAt = Timestamp.now()
  }
  if (newStatus === "delivered" && !order.deliveredAt) {
    updateData.deliveredAt = Timestamp.now()
  }
  if (newStatus === "cancelled" && !order.cancelledAt) {
    updateData.cancelledAt = Timestamp.now()
  }

  await updateDoc(doc(firestore, "ecommerceOrders", order.id), updateData)
  await loadOrders() // Refrescar lista
}
```

**Componente UI**:
```tsx
<Select
  value={order.status}
  onValueChange={(value) => handleStatusChange(order, value)}
>
  <SelectTrigger className="w-[140px]">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="pending">Pendiente</SelectItem>
    <SelectItem value="confirmed">Confirmado</SelectItem>
    <SelectItem value="in_progress">En Proceso</SelectItem>
    <SelectItem value="delivered">Entregado</SelectItem>
    <SelectItem value="cancelled">Cancelado</SelectItem>
  </SelectContent>
</Select>
```

#### 3. Auto-Marcado como Visto

Cuando se carga la página de pedidos, automáticamente marca todos los pedidos no vistos:

```typescript
useEffect(() => {
  const loadOrders = async () => {
    // ... cargar pedidos ...

    // Marcar como vistos
    const unviewedOrders = ordersData.filter(order => !order.viewed)

    if (unviewedOrders.length > 0) {
      const markAsViewedPromises = unviewedOrders.map(order =>
        updateDoc(doc(firestore, "ecommerceOrders", order.id), {
          viewed: true,
          viewedAt: Timestamp.now(),
        })
      )
      await Promise.all(markAsViewedPromises)
    }
  }

  loadOrders()
}, [firestore])
```

#### 4. Detalle de Pedido

**Ruta**: `/publimar/banderas/tienda/[orderId]/page.tsx`

**Información mostrada**:

**Sección: Información del Cliente**
```typescript
- Nombre completo
- Email
- Teléfono (WhatsApp)
```

**Sección: Productos**
```typescript
// Para cada item:
- Imagen del producto
- Nombre del producto
- Variante (si existe): tamaño
- Cantidad
- Precio unitario
- Subtotal
```

**Sección: Resumen del Pedido**
```typescript
- Subtotal
- Costo de envío (si aplica)
- Descuento (si aplica)
- Total
```

**Sección: Metadata**
```typescript
- Dispositivo (mobile/desktop/tablet)
- Navegador
- User Agent
- Referrer (si existe)
- Fecha de creación
- Última actualización
```

**Sección: Timeline**
```typescript
// Muestra eventos con timestamps:
- Pedido creado (createdAt)
- Confirmado (confirmedAt)
- En proceso (inProgressAt)
- Entregado (deliveredAt)
- Cancelado (cancelledAt)
```

**Sección: Notas Internas**
```typescript
// Campo de texto para que el admin agregue notas
- Editor de texto enriquecido (opcional)
- Guardado automático
```

#### 5. Eliminar Pedido

```typescript
const handleDeleteOrder = async (order: TEcommerceOrder) => {
  const confirmed = confirm(`¿Estás seguro de eliminar este pedido?

Cliente: ${order.customer.name}
Total: $${order.total.toFixed(2)}

Esta acción no se puede deshacer.`)

  if (!confirmed) return

  try {
    await deleteDoc(doc(firestore, "ecommerceOrders", order.id))
    toast.success("Pedido eliminado correctamente")
    await loadOrders()
  } catch (error) {
    console.error("Error eliminando pedido:", error)
    toast.error("Error al eliminar el pedido")
  }
}
```

---

## Gestión de Carritos Abandonados

**Ruta**: `/publimar/banderas/tienda/carritos-abandonados/page.tsx`

### Funcionalidades

#### 1. Lista de Carritos NO Convertidos

**Query IMPORTANTE**:
```typescript
// NO filtrar por abandoned: true
// Algunos carritos con customer info nunca se marcaron como abandonados

const cartsQuery = query(
  collection(firestore, "abandonedCarts"),
  where("converted", "==", false)  // Solo esto!
)

// Ordenar en MEMORIA (evita índice compuesto)
cartsData = cartsData.sort((a, b) => {
  const timeA = a.updatedAt?.seconds || 0
  const timeB = b.updatedAt?.seconds || 0
  return timeB - timeA // desc
})
```

**Razón**: Los carritos se crean con `abandoned: false` cuando el usuario llena el formulario de customer info. Solo se marcan como `abandoned: true` cuando se dispara el evento `beforeunload`. Si el usuario cierra directamente la pestaña o navega de otra forma, el carrito queda con `abandoned: false` pero con datos del cliente.

#### 2. Columnas de la Tabla

**Fecha**
```typescript
// Usar la primera disponible:
const dateToDisplay = cart.abandonedAt || cart.lastActivityAt || cart.updatedAt

// Mostrar badge "Activo" si no está abandonado
{!cart.abandoned && (
  <div className="text-xs text-orange-600 font-medium">Activo</div>
)}
```

**Cliente**
```typescript
{cart.customer ? (
  <div className="text-sm">
    <div className="font-medium">{cart.customer.name}</div>
    <div className="text-muted-foreground">{cart.customer.email}</div>
    <div className="text-muted-foreground">{cart.customer.phone}</div>
  </div>
) : (
  <span className="text-muted-foreground text-sm">Sin datos</span>
)}
```

**Productos**
```typescript
// Lista de productos con cantidades
{cart.items.map((item, idx) => (
  <div key={idx} className="text-sm">
    {item.quantity}x {item.productName}
    {item.variant && ` (${item.variant.name})`}
  </div>
))}
```

**Total**
```typescript
<span className="font-semibold text-orange-600">
  {formatearPrecio(cart.total)}
</span>
```

**Dispositivo**
```typescript
<div className="text-xs text-muted-foreground">
  {cart.metadata.deviceType} - {cart.metadata.browser}
</div>
```

**Mensajes**
```typescript
// Contador de mensajes de recuperación enviados
<div className="text-sm">
  {cart.recoveryMessagesSent || 0} enviado(s)
</div>

{cart.lastRecoveryMessageAt && (
  <div className="text-xs text-muted-foreground">
    Último: {formatDate(timestampToDate(cart.lastRecoveryMessageAt))}
  </div>
)}
```

#### 3. Filtros

**Por Dispositivo**:
```typescript
<Select value={deviceFilter} onValueChange={setDeviceFilter}>
  <SelectItem value="all">Todos</SelectItem>
  <SelectItem value="mobile">Mobile</SelectItem>
  <SelectItem value="desktop">Desktop</SelectItem>
  <SelectItem value="tablet">Tablet</SelectItem>
</Select>
```

**Por Fecha**:
```typescript
<Select value={dateFilter} onValueChange={setDateFilter}>
  <SelectItem value="all">Todo el tiempo</SelectItem>
  <SelectItem value="today">Hoy</SelectItem>
  <SelectItem value="week">Última semana</SelectItem>
  <SelectItem value="month">Último mes</SelectItem>
</Select>
```

**Por Término de Búsqueda**:
```typescript
<Input
  placeholder="Buscar por cliente, email, teléfono..."
  value={searchTerm}
  onChange={(e) => setSearchTerm(e.target.value)}
/>

// Filtrado
const filtered = carts.filter(cart => {
  if (!searchTerm) return true

  const search = searchTerm.toLowerCase()
  const name = cart.customer?.name?.toLowerCase() || ""
  const email = cart.customer?.email?.toLowerCase() || ""
  const phone = cart.customer?.phone || ""

  return name.includes(search) ||
         email.includes(search) ||
         phone.includes(search)
})
```

#### 4. Estadísticas

```typescript
// Card 1: Total de carritos abandonados
const totalCarts = filteredCarts.length

// Card 2: Valor total perdido
const totalValue = filteredCarts.reduce((sum, cart) => sum + cart.total, 0)

// Card 3: % de carritos desde mobile
const mobileCount = filteredCarts.filter(c => c.metadata.deviceType === "mobile").length
const mobilePercent = (mobileCount / totalCarts) * 100
```

#### 5. Auto-Marcado como Visto

Similar a pedidos:

```typescript
const unviewedCarts = cartsData.filter(cart => !cart.viewed)

if (unviewedCarts.length > 0) {
  const markAsViewedPromises = unviewedCarts.map(cart =>
    updateDoc(doc(firestore, "abandonedCarts", cart.id), {
      viewed: true,
      viewedAt: Timestamp.now(),
    })
  )
  await Promise.all(markAsViewedPromises)
}
```

#### 6. Exportar a CSV

```typescript
const exportToCSV = () => {
  const headers = ["Fecha", "Cliente", "Email", "Teléfono", "Items", "Total", "Dispositivo"]

  const rows = filteredCarts.map(cart => {
    const dateToUse = cart.abandonedAt || cart.lastActivityAt || cart.updatedAt
    return [
      dateToUse ? formatDate(timestampToDate(dateToUse)) : "",
      cart.customer?.name || "",
      cart.customer?.email || "",
      cart.customer?.phone || "",
      cart.itemsCount,
      cart.total,
      cart.metadata.deviceType,
    ]
  })

  const csv = [
    headers.join(","),
    ...rows.map(row => row.join(","))
  ].join("\n")

  // Download
  const blob = new Blob([csv], { type: "text/csv" })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `carritos-abandonados-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
}
```

---

## Sistema de Recuperación por WhatsApp

### Generación de Link de Recuperación

```typescript
const generateRecoveryLink = (sessionId: string): string => {
  return `https://banderasmdp.com/tienda/recuperar-carrito/${sessionId}`
}
```

### Generación de Mensaje

```typescript
const generateRecoveryWhatsAppMessage = (
  cart: TAbandonedCart,
  recoveryLink: string
): string => {
  // Lista de items
  const itemsList = cart.items
    .map((item) => `• ${item.quantity}x ${item.productName}${item.variant ? ` (${item.variant.name})` : ""}`)
    .join("\n")

  // Saludo personalizado
  const greeting = cart.customer?.name
    ? `¡Hola ${cart.customer.name.split(" ")[0]}! 👋`
    : "¡Hola! 👋"

  const message = `${greeting}

Notamos que dejaste algunos productos en tu carrito:

${itemsList}

Total: $${cart.total.toFixed(2)}

¿Querés completar tu compra? Hacé click acá:
${recoveryLink}

¡Esperamos tu pedido! 🎌

Publimar - Banderas MDP
WhatsApp: +54 9 223 541-6600`

  return encodeURIComponent(message)
}
```

### Handler de Envío

```typescript
const handleSendRecoveryMessage = async (cart: TAbandonedCart) => {
  try {
    // 1. Generar link
    const recoveryLink = generateRecoveryLink(cart.sessionId)

    // 2. Generar mensaje
    const whatsappMessage = generateRecoveryWhatsAppMessage(cart, recoveryLink)

    // 3. Registrar envío en Firestore
    const cartRef = doc(firestore, "abandonedCarts", cart.id)
    const currentCount = cart.recoveryMessagesSent || 0

    await updateDoc(cartRef, {
      recoveryMessagesSent: currentCount + 1,
      lastRecoveryMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    // 4. Abrir WhatsApp
    const phoneNumber = cart.customer?.phone || "2235416600"
    window.open(`https://wa.me/549${phoneNumber}?text=${whatsappMessage}`, "_blank")

    toast.success("Mensaje de recuperación enviado")

    // 5. Recargar datos
    await loadCarts()
  } catch (error) {
    console.error("Error enviando mensaje de recuperación:", error)
    toast.error("Error al enviar el mensaje")
  }
}
```

### Botón de Envío

```tsx
<Button
  onClick={() => handleSendRecoveryMessage(cart)}
  variant="outline"
  size="sm"
  className="gap-2"
  disabled={!cart.customer?.phone}  // Deshabilitar si no hay teléfono
>
  <MessageCircle className="h-4 w-4" />
  Enviar WhatsApp
</Button>
```

---

## Estructura de Datos

### TEcommerceOrder

```typescript
export interface TEcommerceOrder {
  // Identificadores
  id: string
  orderNumber: string              // BND-20260102-0001

  // Cliente
  customer: {
    name?: string
    email?: string
    phone?: string
  }

  // Items del pedido
  items: EcommerceOrderItem[]
  itemsCount: number

  // Montos
  subtotal: number
  shippingCost: number
  discount: number
  total: number

  // Estado
  status: "pending" | "confirmed" | "in_progress" | "delivered" | "cancelled"

  // Timestamps de estados
  createdAt: Timestamp
  updatedAt: Timestamp
  confirmedAt?: Timestamp
  inProgressAt?: Timestamp
  deliveredAt?: Timestamp
  cancelledAt?: Timestamp

  // Metadata
  source: "web" | "manual"
  metadata: OrderMetadata
  internalNotes?: string

  // WhatsApp
  whatsappMessageSent: boolean

  // Tracking de visto
  viewed?: boolean
  viewedAt?: Timestamp
}

export interface EcommerceOrderItem {
  productId: string
  productName: string
  productSku: string
  variant?: {
    id: string
    name: string
    size?: string
  }
  quantity: number
  unitPrice: number
  subtotal: number
  imageUrl?: string
}

export interface OrderMetadata {
  deviceType: "mobile" | "desktop" | "tablet"
  browser?: string
  userAgent?: string
  referrer?: string
  sessionId: string
}
```

### TAbandonedCart

```typescript
export interface TAbandonedCart {
  // Identificadores
  id: string
  sessionId: string

  // Cliente (opcional)
  customer?: {
    name?: string
    email?: string
    phone?: string
  }

  // Items
  items: AbandonedCartItem[]
  itemsCount: number

  // Montos
  subtotal: number
  total: number

  // Estado
  abandoned: boolean      // true si se disparó beforeunload
  converted: boolean      // true si completó la compra
  convertedOrderId?: string

  // Recovery tracking
  recoveryMessagesSent?: number
  lastRecoveryMessageAt?: Timestamp

  // Metadata
  metadata: AbandonedCartMetadata

  // Timestamps
  firstAddedAt: Timestamp
  lastActivityAt: Timestamp
  abandonedAt?: Timestamp
  convertedAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp

  // Tracking de visto
  viewed?: boolean
  viewedAt?: Timestamp
}

export interface AbandonedCartItem {
  productId: string
  productName: string
  productSku: string
  variant?: {
    id: string
    name: string
    size?: string
  }
  quantity: number
  unitPrice: number
  subtotal: number
  imageUrl?: string
}

export interface AbandonedCartMetadata {
  deviceType: "mobile" | "desktop" | "tablet"
  browser?: string
  userAgent?: string
  sessionId: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  referrer?: string
  lastPage?: string
}
```

---

## Estados y Lifecycle

### Lifecycle de un Pedido

```
1. pending (Pendiente)
   └→ Cliente completa checkout en BanderasMDP
   └→ Se crea el pedido
   └→ Admin recibe notificación (badge)

2. confirmed (Confirmado)
   └→ Admin confirma el pedido
   └→ Se registra confirmedAt

3. in_progress (En Proceso)
   └→ Pedido en fabricación/preparación
   └→ Se registra inProgressAt

4. delivered (Entregado)
   └→ Cliente recibió el pedido
   └→ Se registra deliveredAt
   └→ FIN del lifecycle

O bien:

X. cancelled (Cancelado)
   └→ Pedido cancelado por admin o cliente
   └→ Se registra cancelledAt
   └→ FIN del lifecycle
```

### Lifecycle de un Carrito Abandonado

```
1. Creado (abandoned: false, converted: false)
   └→ Usuario agrega productos al carrito en BanderasMDP
   └→ Se guarda automáticamente cada 2 segundos (debounce)

2. Con Customer Info (abandoned: false, converted: false)
   └→ Usuario llena formulario de datos
   └→ Se actualiza customer info

3. Abandonado (abandoned: true, converted: false)
   └→ Usuario cierra página (beforeunload)
   └→ Se marca abandoned: true
   └→ Admin puede ver y enviar recuperación

4a. Convertido (abandoned: false, converted: true)
    └→ Usuario completa la compra
    └→ Se marca converted: true
    └→ Se guarda convertedOrderId
    └→ FIN - Éxito

4b. Expirado (abandoned: true, converted: false)
    └→ Pasa X días sin conversión
    └→ Se puede eliminar manualmente
    └→ FIN - No convertido
```

---

## Notificaciones

### Sistema de Badges

#### Badge en Sidebar

**Ubicación**: `src/components/layouts/DashboardLayout.tsx`

```typescript
// Polling cada 30 segundos
useEffect(() => {
  const loadUnviewedCount = async () => {
    // Contar pedidos no vistos
    const ordersSnap = await getDocs(collection(firestore, "ecommerceOrders"))
    const orders = ordersSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }))
    const unviewedOrders = orders.filter(order => !order.viewed).length

    // Contar carritos no vistos
    const cartsQuery = query(
      collection(firestore, "abandonedCarts"),
      where("converted", "==", false)
    )
    const cartsSnap = await getDocs(cartsQuery)
    const carts = cartsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }))
    const unviewedCarts = carts.filter(cart => !cart.viewed).length

    setUnviewedCount(unviewedOrders + unviewedCarts)
  }

  loadUnviewedCount()
  const interval = setInterval(loadUnviewedCount, 30000)
  return () => clearInterval(interval)
}, [firestore])
```

**Render**:
```tsx
{item.name === "Tienda Online" && unviewedCount > 0 && (
  <span className="ml-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
    {unviewedCount}
  </span>
)}
```

#### Badges en Botones del Dashboard

```tsx
<Button asChild variant="outline" className="relative">
  <Link href="/publimar/banderas/tienda/pedidos">
    <Package className="mr-2 h-4 w-4" />
    Ver Todos los Pedidos
    {unviewedOrdersCount > 0 && (
      <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
        {unviewedOrdersCount}
      </span>
    )}
  </Link>
</Button>
```

---

**Última actualización**: Enero 2026

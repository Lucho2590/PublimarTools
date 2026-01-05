# 🔄 Flujos de Aplicación - PublimarTools

Documentación completa de todos los flujos principales de la aplicación.

## 📋 Índice de Flujos

1. [Autenticación](#1-flujo-de-autenticación)
2. [Gestión de Clientes](#2-flujo-de-gestión-de-clientes)
3. [Gestión de Productos](#3-flujo-de-gestión-de-productos)
4. [Visualización de Pedidos E-commerce](#4-flujo-de-visualización-de-pedidos-e-commerce)
5. [Gestión de Carritos Abandonados](#5-flujo-de-gestión-de-carritos-abandonados)
6. [Sistema de Notificaciones](#6-flujo-de-notificaciones-en-tiempo-real)
7. [Analytics de Tienda](#7-flujo-de-analytics-de-tienda)
8. [Recuperación por WhatsApp](#8-flujo-de-recuperación-por-whatsapp)

---

## 1. Flujo de Autenticación

### Inicio de Sesión

```
┌─────────────┐
│   Usuario   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│  /login/page.tsx        │
│  - Formulario email/pwd │
└──────┬──────────────────┘
       │ Submit
       ▼
┌─────────────────────────┐
│  Firebase Auth          │
│  signInWithEmail...     │
└──────┬──────────────────┘
       │
       ├─── ✅ Success ────────┐
       │                       ▼
       │              ┌─────────────────┐
       │              │  AuthContext    │
       │              │  setUser(user)  │
       │              └────────┬────────┘
       │                       │
       │                       ▼
       │              ┌─────────────────┐
       │              │  Redirect to    │
       │              │  /publimar      │
       │              │  /banderas      │
       │              └─────────────────┘
       │
       └─── ❌ Error ─────────┐
                              ▼
                     ┌─────────────────┐
                     │  Toast Error    │
                     │  "Credenciales  │
                     │   incorrectas"  │
                     └─────────────────┘
```

### Protección de Rutas

```
┌──────────────────────────┐
│  DashboardLayout.tsx     │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  useAuth() hook          │
│  - user                  │
│  - loading               │
└──────┬───────────────────┘
       │
       ├─── loading = true ───→ <Loading />
       │
       ├─── user = null ──────→ redirect('/login')
       │
       └─── user exists ──────→ <Dashboard>
                                   {children}
                                </Dashboard>
```

### Cierre de Sesión

```
Usuario click "Cerrar Sesión"
       │
       ▼
┌─────────────────────────┐
│  signOut() from         │
│  AuthContext            │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  Firebase Auth          │
│  auth.signOut()         │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  Clear user state       │
│  setUser(null)          │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  Redirect to /login     │
└─────────────────────────┘
```

---

## 2. Flujo de Gestión de Clientes

### Crear Cliente

```
Usuario en /publimar/banderas/clientes
       │
       ▼
Click "Agregar Cliente"
       │
       ▼
┌─────────────────────────┐
│  ClientModal abierto    │
│  - Formulario vacío     │
└──────┬──────────────────┘
       │ Usuario completa datos
       │ (nombre, email, teléfono, etc.)
       ▼
┌─────────────────────────┐
│  Validación (Zod)       │
│  - Email válido         │
│  - Teléfono válido      │
│  - Campos requeridos    │
└──────┬──────────────────┘
       │
       ├─── ❌ Error ──────→ Mostrar errores en formulario
       │
       └─── ✅ Valid
              │
              ▼
       ┌─────────────────────────┐
       │  addDoc(firestore,      │
       │    "clients", data)     │
       └──────┬──────────────────┘
              │
              ▼
       ┌─────────────────────────┐
       │  Toast Success          │
       │  "Cliente agregado"     │
       └──────┬──────────────────┘
              │
              ▼
       ┌─────────────────────────┐
       │  Refrescar lista        │
       │  Cerrar modal           │
       └─────────────────────────┘
```

### Editar Cliente

```
Click en "Editar" (icono lápiz)
       │
       ▼
┌─────────────────────────┐
│  Cargar datos del       │
│  cliente en modal       │
└──────┬──────────────────┘
       │
       ▼
Usuario modifica datos
       │
       ▼
Click "Guardar"
       │
       ▼
┌─────────────────────────┐
│  Validación             │
└──────┬──────────────────┘
       │
       └─── ✅ Valid
              │
              ▼
       ┌─────────────────────────┐
       │  updateDoc(firestore,   │
       │    doc(clients, id),    │
       │    data)                │
       └──────┬──────────────────┘
              │
              ▼
       ┌─────────────────────────┐
       │  Toast Success          │
       │  Refrescar lista        │
       └─────────────────────────┘
```

### Eliminar Cliente

```
Click en "Eliminar" (icono trash)
       │
       ▼
┌─────────────────────────┐
│  Confirmación           │
│  "¿Estás seguro?"       │
└──────┬──────────────────┘
       │
       ├─── Cancelar ──→ No hace nada
       │
       └─── Confirmar
              │
              ▼
       ┌─────────────────────────┐
       │  deleteDoc(firestore,   │
       │    doc(clients, id))    │
       └──────┬──────────────────┘
              │
              ▼
       ┌─────────────────────────┐
       │  Toast Success          │
       │  Refrescar lista        │
       └─────────────────────────┘
```

---

## 3. Flujo de Gestión de Productos

### Crear Producto

```
/publimar/banderas/productos/nuevo
       │
       ▼
┌─────────────────────────────────┐
│  Formulario de Producto         │
│  - Información básica           │
│  - Variantes (opcional)         │
│  - Imágenes                     │
│  - Categorías                   │
└──────┬──────────────────────────┘
       │
       ▼
Usuario completa datos
       │
       ▼
┌─────────────────────────────────┐
│  Subir imágenes a               │
│  Firebase Storage               │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Obtener URLs de imágenes       │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Crear documento en             │
│  collection "products"          │
│  {                              │
│    name, price, stock,          │
│    imageUrls: [...],            │
│    variants: [...],             │
│    categories: [...]            │
│  }                              │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Redirect a lista productos     │
│  Toast: "Producto creado"       │
└─────────────────────────────────┘
```

### Agregar Variantes

```
En formulario de producto
       │
       ▼
Click "Agregar Variante"
       │
       ▼
┌─────────────────────────────────┐
│  Formulario de variante         │
│  - Tamaño/Nombre                │
│  - Precio                       │
│  - Stock                        │
│  - SKU (opcional)               │
└──────┬──────────────────────────┘
       │
       ▼
Completar datos → Click "Agregar"
       │
       ▼
┌─────────────────────────────────┐
│  Agregar variante al array      │
│  variants: [                    │
│    { id, size, price, stock }   │
│  ]                              │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Mostrar en tabla de variantes  │
│  Opciones: Editar, Eliminar     │
└─────────────────────────────────┘
```

### Editar Producto

```
Click en producto de la lista
       │
       ▼
┌─────────────────────────────────┐
│  Modal de edición               │
│  Pre-cargado con datos          │
└──────┬──────────────────────────┘
       │
       ▼
Usuario modifica
       │
       ▼
Click "Guardar"
       │
       ▼
┌─────────────────────────────────┐
│  Si cambió imágenes:            │
│  1. Subir nuevas a Storage      │
│  2. Eliminar antiguas           │
│  3. Actualizar URLs             │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  updateDoc(products, id, data)  │
└──────┬──────────────────────────┘
       │
       ▼
Toast Success + Refrescar lista
```

---

## 4. Flujo de Visualización de Pedidos E-commerce

### Dashboard de Pedidos

```
/publimar/banderas/tienda/pedidos
       │
       ▼
┌─────────────────────────────────┐
│  useEffect(() => {              │
│    loadOrders()                 │
│  }, [firestore])                │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Query Firestore:               │
│  collection("ecommerceOrders")  │
│  orderBy("createdAt", "desc")   │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Mapear a TEcommerceOrder[]     │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Marcar como vistos:            │
│  if (!order.viewed) {           │
│    updateDoc(order, {           │
│      viewed: true,              │
│      viewedAt: timestamp        │
│    })                           │
│  }                              │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Renderizar tabla con:          │
│  - N° Pedido                    │
│  - Cliente                      │
│  - Fecha                        │
│  - Total                        │
│  - Status                       │
│  - Acciones                     │
└─────────────────────────────────┘
```

### Cambio Rápido de Status

```
Usuario selecciona nuevo status en dropdown
       │
       ▼
┌─────────────────────────────────┐
│  handleStatusChange(order, new) │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Preparar updateData:           │
│  - status: newStatus            │
│  - updatedAt: now               │
│                                 │
│  Si es "confirmed":             │
│    + confirmedAt: now           │
│  Si es "delivered":             │
│    + deliveredAt: now           │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  updateDoc(orderRef, data)      │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Refrescar lista de pedidos     │
│  Toast: "Status actualizado"    │
└─────────────────────────────────┘
```

### Ver Detalle de Pedido

```
Click en "Ver" (icono ojo)
       │
       ▼
┌─────────────────────────────────┐
│  Redirect to:                   │
│  /tienda/[orderId]              │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  getDoc(ecommerceOrders, id)    │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Renderizar vista detallada:    │
│  - Info del cliente             │
│  - Lista de productos           │
│  - Metadata (device, browser)   │
│  - Timeline de cambios          │
│  - Notas internas               │
└─────────────────────────────────┘
```

### Eliminar Pedido

```
Click "Eliminar" → Confirmación
       │
       ▼
┌─────────────────────────────────┐
│  deleteDoc(ecommerceOrders, id) │
└──────┬──────────────────────────┘
       │
       ▼
Toast Success + Redirect a lista
```

---

## 5. Flujo de Gestión de Carritos Abandonados

### Cargar Carritos Abandonados

```
/publimar/banderas/tienda/carritos-abandonados
       │
       ▼
┌─────────────────────────────────┐
│  loadCarts()                    │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Query Firestore:               │
│  collection("abandonedCarts")   │
│  where("converted", "==", false)│
│  (NO filtrar por abandoned!)    │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Ordenar en memoria por         │
│  updatedAt (desc)               │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Marcar como vistos             │
│  si !cart.viewed                │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Renderizar tabla con:          │
│  - Fecha (abandonedAt ||        │
│           lastActivityAt ||     │
│           updatedAt)            │
│  - Cliente (si existe)          │
│  - Productos                    │
│  - Total                        │
│  - Badge "Activo" si no         │
│    abandonado                   │
│  - Acciones                     │
└─────────────────────────────────┘
```

### Enviar Mensaje de Recuperación por WhatsApp

```
Click "Enviar WhatsApp"
       │
       ▼
┌─────────────────────────────────┐
│  handleSendRecoveryMessage()    │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Generar recovery link:         │
│  banderasmdp.com/tienda/        │
│  recuperar-carrito/[sessionId]  │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Generar mensaje personalizado: │
│  "¡Hola [nombre]! Notamos que   │
│   dejaste productos..."         │
│   + Lista de productos          │
│   + Total                       │
│   + Link de recuperación        │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Registrar envío en Firestore:  │
│  updateDoc(cart, {              │
│    recoveryMessagesSent++,      │
│    lastRecoveryMessageAt: now   │
│  })                             │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Abrir WhatsApp Web:            │
│  wa.me/549[phone]?text=[msg]    │
└──────┬──────────────────────────┘
       │
       ▼
Toast: "Mensaje enviado" + Refrescar
```

### Eliminar Carrito Abandonado

```
Click "Eliminar" → Confirmación
       │
       ▼
deleteDoc(abandonedCarts, id)
       │
       ▼
Toast Success + Refrescar lista
```

---

## 6. Flujo de Notificaciones en Tiempo Real

### Sistema de Polling en Sidebar

```
┌─────────────────────────────────┐
│  DashboardLayout.tsx            │
│  Component Mount                │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  useEffect(() => {              │
│    loadUnviewedCount()          │
│                                 │
│    const interval = setInterval(│
│      loadUnviewedCount,         │
│      30000  // 30 segundos      │
│    )                            │
│                                 │
│    return () => clearInterval() │
│  }, [])                         │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  loadUnviewedCount()            │
│  1. Count pedidos no vistos     │
│  2. Count carritos no vistos    │
│  3. setUnviewedCount(total)     │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Si count > 0:                  │
│    Mostrar badge rojo en        │
│    "Tienda Online" del sidebar  │
│                                 │
│    <Badge>{unviewedCount}</Badge>│
└─────────────────────────────────┘
       │
       │ Usuario navega a pedidos/carritos
       ▼
┌─────────────────────────────────┐
│  Auto-marcar como vistos        │
│  → Badge desaparece             │
└─────────────────────────────────┘
```

### Badges en Dashboard

```
/publimar/banderas/tienda (Dashboard)
       │
       ▼
┌─────────────────────────────────┐
│  Calcular unviewed counts:      │
│  - unviewedOrdersCount          │
│  - unviewedCartsCount           │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Renderizar botones con badges: │
│                                 │
│  [Ver Pedidos] 🔴 3             │
│  [Carritos]    🔴 5             │
│  [Analytics]                    │
└─────────────────────────────────┘
```

---

## 7. Flujo de Analytics de Tienda

### Cargar Datos de Analytics

```
/publimar/banderas/tienda/analytics
       │
       ▼
┌─────────────────────────────────┐
│  useEffect(() => {              │
│    loadAnalyticsData()          │
│  }, [])                         │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Queries en paralelo:           │
│  1. productAnalytics            │
│  2. searchQueries               │
│  3. conversionFunnels           │
└──────┬──────────────────────────┘
       │
       ├─── Top Productos ────────┐
       │                          │
       │    ┌─────────────────────▼──────┐
       │    │  Query:                    │
       │    │  collection(productAnalytics)│
       │    │  orderBy("viewsCount", "desc")│
       │    │  limit(10)                 │
       │    └────────────────────────────┘
       │
       ├─── Búsquedas sin resultado ──┐
       │                               │
       │    ┌──────────────────────────▼──┐
       │    │  Query:                     │
       │    │  collection(searchQueries)  │
       │    │  where("resultsCount", "==", 0)│
       │    └─────────────────────────────┘
       │
       └─── Funnel de Conversión ──┐
                                    │
            ┌───────────────────────▼─────┐
            │  Query:                     │
            │  collection(conversionFunnels)│
            │  Calcular:                  │
            │  - Total sesiones           │
            │  - Agregados a carrito      │
            │  - Checkouts                │
            │  - Compras                  │
            │  - % Conversión             │
            └─────────────────────────────┘
```

### Visualización de Metrics

```
Datos cargados
       │
       ▼
┌─────────────────────────────────┐
│  Renderizar Cards con KPIs:     │
│                                 │
│  ┌────────────┬────────────┐   │
│  │ Sesiones   │ Add Cart   │   │
│  │   1,234    │    456     │   │
│  └────────────┴────────────┘   │
│                                 │
│  ┌────────────┬────────────┐   │
│  │ Checkouts  │ Compras    │   │
│  │    123     │     45     │   │
│  └────────────┴────────────┘   │
│                                 │
│  Tasa Conversión: 3.65%         │
└─────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Tabla: Top 10 Productos        │
│  - Nombre                       │
│  - Vistas                       │
│  - Add to Cart                  │
│  - Compras                      │
│  - Tasa Conversión              │
│  - Revenue                      │
└─────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Tabla: Búsquedas sin resultado │
│  - Término buscado              │
│  - Cantidad de veces            │
│  - Última búsqueda              │
└─────────────────────────────────┘
```

---

## 8. Flujo de Recuperación por WhatsApp

### Desde PublimarTools (Admin)

```
Admin en carritos abandonados
       │
       ▼
Click "Enviar WhatsApp" en carrito
       │
       ▼
┌─────────────────────────────────┐
│  generateRecoveryLink(sessionId)│
│  https://banderasmdp.com/       │
│  tienda/recuperar-carrito/      │
│  [sessionId]                    │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  generateWhatsAppMessage()      │
│  - Saludo personalizado         │
│  - Lista de productos           │
│  - Total                        │
│  - Link de recuperación         │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Actualizar en Firestore:       │
│  - recoveryMessagesSent++       │
│  - lastRecoveryMessageAt        │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  window.open(                   │
│    `wa.me/549${phone}?text=...`)│
│  )                              │
└──────┬──────────────────────────┘
       │
       ▼
Admin envía mensaje desde WhatsApp Web
```

### Desde BanderasMDP (Cliente)

```
Cliente recibe mensaje WhatsApp
       │
       ▼
Click en link de recuperación
       │
       ▼
┌─────────────────────────────────┐
│  /tienda/recuperar-carrito/     │
│  [sessionId]                    │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  useEffect(() => {              │
│    recuperarCarrito()           │
│  }, [sessionId])                │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  getDoc(abandonedCarts, id)     │
└──────┬──────────────────────────┘
       │
       ├─── No existe / convertido ──→ Error
       │
       └─── Existe
              │
              ▼
       ┌─────────────────────────────────┐
       │  Para cada item del carrito:    │
       │  1. Buscar producto en Firestore│
       │     getDoc(products, productId) │
       │  2. Reconstruir variant         │
       │  3. addToCart(product, qty, var)│
       └──────┬──────────────────────────┘
              │
              ▼
       ┌─────────────────────────────────┐
       │  Toast: "Carrito recuperado!"   │
       │  Redirect a /tienda             │
       └─────────────────────────────────┘
```

---

## 🔄 Integración con BanderasMDP

### Flujo completo desde Cliente hasta Admin

```
1. Cliente en BanderasMDP
   └→ Navega productos
   └→ Agrega al carrito
   └→ Completa formulario de datos
   └→ Cierra página
        │
        ▼
2. Sistema detecta abandono
   └→ beforeunload event
   └→ markCartAsAbandoned()
   └→ Firestore: abandonedCarts
        │
        ▼
3. Admin en PublimarTools
   └→ Ve notificación (badge)
   └→ Abre carritos abandonados
   └→ Ve carrito nuevo
   └→ Envía mensaje recuperación
        │
        ▼
4. Cliente recibe WhatsApp
   └→ Click en link
   └→ Carrito se restaura
   └→ Completa compra
        │
        ▼
5. Sistema registra conversión
   └→ createEcommerceOrder()
   └→ markCartAsConverted()
   └→ Analytics: Purchase event
        │
        ▼
6. Admin ve pedido
   └→ Procesa pedido
   └→ Cambia status
   └→ Contacta cliente
```

---

**Última actualización**: Enero 2026

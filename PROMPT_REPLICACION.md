# Prompt para Replicar PublimarTools

## 🎯 RESUMEN DE LA FUNCIÓN DE LA APP

**PublimarTools** es un sistema de gestión empresarial (ERP) diseñado específicamente para la empresa Publimar, que se especializa en la fabricación y comercialización de banderas. La aplicación gestiona todo el ciclo de vida de las operaciones comerciales:

- **Gestión de Productos**: Catálogo de banderas con variantes (tamaños, colores), categorías, control de stock, y precios
- **Gestión de Clientes**: Base de datos de clientes (individuales y empresas) con información de contacto, CUIT, direcciones
- **Presupuestos (Quotes)**: Creación y gestión de cotizaciones con estados (draft, sent, confirmed, rejected)
- **Órdenes de Trabajo**: Conversión de presupuestos a órdenes, seguimiento de estados (draft, in_process, completed, cancelled), gestión de entregas
- **Ventas**: Sistema de ventas con múltiples métodos de pago, gestión de facturación (múltiples facturas por venta), aplicación de IVA y descuentos
- **Compras**: Registro de compras a proveedores
- **Proveedores**: Gestión de proveedores
- **Módulos por Área**: Separación en tres áreas principales (Banderas, Administración, Vía Pública) con control de acceso por roles de usuario

La app permite generar reportes, exportar datos, generar PDFs, y tiene un sistema de autenticación completo con roles y permisos.

---

## 📁 ESTRUCTURA DE LA APP

La aplicación está estructurada como una aplicación **Next.js 13+ con App Router**, siguiendo la estructura de carpetas estándar:

```
publimarTools/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Layout raíz con providers
│   │   ├── page.tsx                  # Página principal (redirige)
│   │   ├── login/                    # Páginas de autenticación
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── ClientProviders.tsx       # Wrapper de providers (Firebase, Auth)
│   │   └── publimar/                 # Módulo principal
│   │       ├── layout.tsx            # Layout con DashboardLayout
│   │       ├── page.tsx              # Dashboard principal
│   │       ├── banderas/             # Módulo de Banderas
│   │       │   ├── page.tsx          # Dashboard de Banderas
│   │       │   ├── productos/        # Gestión de productos
│   │       │   ├── clientes/         # Gestión de clientes
│   │       │   ├── presupuestos/     # Gestión de presupuestos
│   │       │   ├── ordenes/          # Gestión de órdenes
│   │       │   ├── ventas/           # Gestión de ventas
│   │       │   └── compras/          # Gestión de compras
│   │       ├── administracion/       # Módulo de Administración
│   │       └── viaPublica/           # Módulo de Vía Pública
│   │       └── proveedores/          # Gestión de proveedores
│   ├── components/                   # Componentes reutilizables
│   │   ├── auth/                     # Componentes de autenticación
│   │   │   ├── AuthGuard.tsx         # Guard para proteger rutas
│   │   │   └── LoginForm.tsx         # Formulario de login
│   │   ├── layouts/                  # Layouts compartidos
│   │   │   └── DashboardLayout.tsx   # Layout principal con sidebar
│   │   └── ui/                       # Componentes UI (shadcn/ui)
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── dialog.tsx
│   │       ├── table.tsx
│   │       └── ... (más componentes)
│   ├── contexts/                     # Contextos de React
│   │   └── AuthContext.tsx           # Contexto de autenticación
│   ├── hooks/                        # Custom hooks
│   │   ├── useClients.ts             # Hook para gestión de clientes
│   │   ├── useOrders.ts              # Hook para gestión de órdenes
│   │   └── useSales.ts               # Hook para gestión de ventas
│   ├── lib/                          # Utilidades y configuraciones
│   │   ├── firebase.ts               # Configuración de Firebase
│   │   ├── collections.ts            # Nombres de colecciones de Firestore
│   │   └── utils.ts                  # Funciones utilitarias
│   └── types/                        # Definiciones de tipos TypeScript
│       ├── client.ts                 # Tipos de clientes
│       ├── product.ts                # Tipos de productos
│       ├── order.ts                  # Tipos de órdenes
│       ├── quote.ts                  # Tipos de presupuestos
│       ├── sale.ts                   # Tipos de ventas
│       ├── user.ts                   # Tipos de usuarios
│       └── ... (más tipos)
├── public/                           # Archivos estáticos
│   └── imagenes/                     # Imágenes de la app
├── functions/                        # Firebase Cloud Functions
│   ├── index.js
│   └── package.json
├── firebase.json                     # Configuración de Firebase
├── next.config.js                    # Configuración de Next.js
├── tailwind.config.ts                # Configuración de Tailwind CSS
└── package.json                      # Dependencias del proyecto

```

### Características de la Estructura:

- **Separación por módulos funcionales**: Cada área (Banderas, Admin, Vía Pública) tiene su propia carpeta con sus páginas
- **Componentes modales**: Cada módulo tiene carpetas `modalX` para modales específicos (ej: `modalVentas`, `modalProductos`)
- **Hooks personalizados**: Lógica de negocio encapsulada en hooks que interactúan con Firestore
- **Tipos centralizados**: Todas las definiciones de tipos están en `/src/types`
- **UI Components**: Sistema de componentes basado en shadcn/ui (Radix UI + Tailwind)

---

## 🛠️ TECNOLOGÍAS UTILIZADAS

### Frontend Framework & Core:
- **Next.js 13.4.19** (App Router, SSR)
- **React 18.2.0**
- **TypeScript 5.3.3**

### Estilos:
- **Tailwind CSS 3.3.6**
- **tailwindcss-animate** (animaciones)
- **PostCSS & Autoprefixer**

### UI Components & Libraries:
- **shadcn/ui** (basado en Radix UI):
  - `@radix-ui/react-dialog`
  - `@radix-ui/react-select`
  - `@radix-ui/react-tabs`
  - `@radix-ui/react-popover`
  - `@radix-ui/react-checkbox`
  - `class-variance-authority` (CVA)
  - `clsx` y `tailwind-merge` (utilidades)
- **Lucide React** (iconos)
- **Sonner** (notificaciones toast)

### Backend & Base de Datos:
- **Firebase 9.23.0**:
  - Firebase Authentication (email/password)
  - Cloud Firestore (base de datos NoSQL)
  - Firebase Analytics
  - Firebase Hosting (deployment)
- **Firebase Admin 13.5.0** (para Cloud Functions)
- **ReactFire 4.2.3** (hooks para Firebase en React)

### Formularios & Validación:
- **React Hook Form 7.57.0**
- **Zod 3.25.49** (validación de esquemas)
- **@hookform/resolvers** (integración Zod + RHF)

### Utilidades:
- **date-fns 4.1.0** (manejo de fechas)
- **react-day-picker 9.7.0** (selector de fechas)
- **js-cookie 3.0.5** (gestión de cookies)
- **html2canvas 1.4.1** (captura de pantalla para PDFs)
- **jspdf 3.0.1** (generación de PDFs)
- **xlsx 0.18.5** (exportación a Excel)

### Build & Tooling:
- **ESLint** (linting)
- **Next.js built-in bundler** (SWC minify)

---

## 🗄️ BASE DE DATOS

Se utiliza **Cloud Firestore** (Firebase) como base de datos NoSQL.

### Colecciones Principales (definidas en `/src/lib/collections.ts`):

```typescript
{
  PRODUCTS: "products",
  products: {
    VARIANTS: "variants",
    CATEGORIES: "categories",
  },
  CLIENTS: "clients",
  QUOTES: "quotes",
  quotes: {
    ITEMS: "items",
    COMMENTS: "comments",
  },
  ORDERS: "orders",
  orders: {
    ITEMS: "items",
  },
  SALES: "sales",
  sales: {
    ITEMS: "items",
  },
  USERS: "users",
  EVENTS: "events",
}
```

### Estructura de Datos:

- **Normalización parcial**: Los documentos principales (orders, sales, quotes) contienen referencias a clientes (`clientId`) y también pueden tener snapshots de datos (`clientName`, `tempClientData`) para visualización rápida
- **Subcolecciones**: Items de órdenes, ventas y presupuestos pueden estar en subcolecciones o directamente en arrays dentro del documento
- **Timestamps**: Uso de `Date` objects y `serverTimestamp()` de Firebase
- **Referencias**: Uso de `DocumentReference` de Firestore para relaciones

### Configuración Firebase:

La configuración se encuentra en `/src/lib/firebase.ts` y utiliza variables de entorno:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`

---

## 🔐 AUTENTICACIÓN

### Sistema de Autenticación:

La autenticación está implementada con **Firebase Authentication** usando el método **email/password**.

### Implementación:

1. **AuthContext** (`/src/contexts/AuthContext.tsx`):
   - Provee funciones: `signIn`, `signUp`, `logout`
   - Maneja el estado del usuario con `onAuthStateChanged`
   - Sincroniza estado con cookies (`js-cookie`) para mantener sesión
   - Establece cookie `auth: 'true'` cuando el usuario está autenticado (expira en 7 días)

2. **AuthGuard** (`/src/components/auth/AuthGuard.tsx`):
   - Componente que protege rutas
   - Redirige usuarios no autenticados a `/login`
   - Redirige usuarios autenticados desde `/login` a `/publimar`
   - Muestra loading mientras verifica autenticación

3. **LoginForm** (`/src/components/auth/LoginForm.tsx`):
   - Formulario de login con email y password
   - Toggle para mostrar/ocultar contraseña
   - Manejo de errores
   - Estado de loading durante el login

### Flujo de Autenticación:

1. Usuario accede a cualquier ruta protegida
2. `AuthGuard` verifica si hay usuario autenticado
3. Si no hay usuario → redirige a `/login`
4. Usuario ingresa credenciales en `LoginForm`
5. `AuthContext.signIn()` autentica con Firebase
6. Firebase actualiza el estado → `onAuthStateChanged` se ejecuta
7. Se establece cookie y usuario es redirigido a `/publimar`
8. `AuthGuard` permite acceso a rutas protegidas

### Roles de Usuario:

Los usuarios tienen roles definidos en la colección `users`:
- `banderas`: Acceso al módulo de Banderas
- `administracion`: Acceso al módulo de Administración
- `viaPublica`: Acceso al módulo de Vía Pública

El `DashboardLayout` consulta el rol del usuario y expande el menú correspondiente automáticamente.

---

## 🔄 PROVIDERS

### Estructura de Providers:

La aplicación utiliza una estructura anidada de providers:

```typescript
// app/layout.tsx
<ClientProviders>
  {children}
</ClientProviders>

// app/ClientProviders.tsx
<FirebaseAppProvider firebaseApp={app}>
  <AuthProvider>
    <AuthGuard>
      {children}
    </AuthGuard>
  </AuthProvider>
</FirebaseAppProvider>

// app/publimar/layout.tsx
<FirebaseAppProvider firebaseApp={app}>
  <ReactFireAuthProvider sdk={auth}>
    <FirestoreProvider sdk={firestore}>
      <DashboardLayout>
        {children}
      </DashboardLayout>
    </FirestoreProvider>
  </ReactFireAuthProvider>
</FirebaseAppProvider>
```

### Providers Utilizados:

1. **FirebaseAppProvider** (ReactFire):
   - Provee la instancia de Firebase App
   - Se usa en el layout raíz y en el layout de `/publimar`

2. **AuthProvider** (custom, `/src/contexts/AuthContext.tsx`):
   - Provee contexto de autenticación
   - Expone: `user`, `loading`, `signIn`, `signUp`, `logout`
   - Hook `useAuth()` para acceder al contexto

3. **ReactFireAuthProvider** (ReactFire):
   - Provee SDK de Firebase Auth
   - Usado en el layout de `/publimar` para que ReactFire hooks funcionen

4. **FirestoreProvider** (ReactFire):
   - Provee SDK de Firestore
   - Necesario para hooks como `useFirestore`, `useFirestoreCollectionData`

5. **AuthGuard**:
   - Técnicamente no es un provider, pero funciona como wrapper
   - Protege todas las rutas excepto `/login`

### Orden de Providers:

El orden es crítico:
1. FirebaseAppProvider (base)
2. AuthProvider (custom) / ReactFireAuthProvider
3. FirestoreProvider
4. AuthGuard (protección de rutas)
5. DashboardLayout (layout UI)
6. Children (páginas)

---

## 🔑 LOGIN

### Página de Login:

**Ruta**: `/login`

**Estructura**:
- Layout propio: `/src/app/login/layout.tsx`
- Página: `/src/app/login/page.tsx` (renderiza `LoginForm`)

### Componente LoginForm:

**Ubicación**: `/src/components/auth/LoginForm.tsx`

**Características**:
- Card centrado con diseño moderno (shadcn/ui Card)
- Logo de la empresa
- Campo de email (tipo email, requerido)
- Campo de password (tipo password, con toggle para mostrar/ocultar)
- Botón de submit con estado de loading
- Manejo de errores con mensaje visual
- Validación HTML5 (campos requeridos)
- Estilos con Tailwind CSS (gradientes, sombras, colores azules)

### Funcionalidad:

1. **Estado local**:
   - `email`: string
   - `password`: string
   - `error`: string (mensajes de error)
   - `isLoading`: boolean (durante autenticación)
   - `showPassword`: boolean (toggle para mostrar contraseña)

2. **Submit handler**:
   - Previene default del form
   - Limpia errores previos
   - Establece loading
   - Llama a `signIn(email, password)` del `AuthContext`
   - Captura errores y los muestra al usuario
   - Maneja loading state

3. **Integración con AuthContext**:
   ```typescript
   const { signIn } = useAuth();
   await signIn(email, password);
   ```

4. **Redirección**:
   - No maneja redirección directamente
   - `AuthGuard` detecta el cambio de estado de autenticación y redirige automáticamente a `/publimar`

### Estilos del Login:

- Fondo: degradado azul claro
- Card: sombra con efecto azul, borde azul claro
- Inputs: altura 11 (h-11), bordes grises con focus azul
- Botón: azul sólido con sombra, estado disabled durante loading
- Responsive: centrado, ancho fijo de 400px

---

## 📝 TIPOS (TYPES)

Los tipos están definidos en TypeScript en `/src/types/`. Aquí se explican los principales:

### 1. **Client Types** (`client.ts`):

```typescript
enum EClientType {
  INDIVIDUAL = "individual",
  COMPANY = "company",
}

enum EClientStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
}

type TClientContact = {
  name: string;
  email: string;
  phone: string;
  position?: string;
}

type TClient = {
  ref: DocumentReference;      // Referencia de Firestore
  id: string;
  name: string;
  type: EClientType;
  status: EClientStatus;
  businessName?: string;        // Razón social para empresas
  email?: string;
  phone?: string;
  address?: string;
  cuit?: string;                // CUIT/CUIL
  reference?: string;           // Referencia del cliente
  notes?: string;
  contacts?: TClientContact[];  // Múltiples contactos
  createdAt: Date;
  updatedAt: Date;
}
```

### 2. **Product Types** (`product.ts`):

```typescript
enum EProductCategory {
  NATIONAL_FLAG = "Bandera Nacional",
  CUSTOM_FLAG = "Bandera Personalizada",
  ACCESSORY = "Accesorio",
}

enum EProductStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
}

type TProductCategory = {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TProductVariant {
  id: string;
  size: string;
  price: number | string;
  stock: number | string;
  sku?: string;
}

interface TProduct {
  salesCount: number;           // Contador de ventas
  totalSales: number;           // Total vendido
  id: string;
  name: string;
  description?: string;
  variants: TProductVariant[];  // Variantes (tamaños, colores)
  categories: string[];         // Categorías a las que pertenece
  taxRate?: number;             // Tasa de IVA
  price: number | string;       // Precio base
  stock: number | string;       // Stock base
  category?: string;            // Categoría principal (legacy)
  createdAt?: Date;
  updatedAt?: Date;
  imageUrls: never[];           // Array de URLs de imágenes
  hasVariants: boolean;         // Si tiene variantes
  sku: string;                  // SKU del producto
}
```

### 3. **Order Types** (`order.ts`):

```typescript
enum EOrderStatus {
  DRAFT = "draft",
  IN_PROCESS = "in_process",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

type TOrderItem = TQuoteItem;   // Hereda de QuoteItem

type TInvoiceType = {
  type: string;
  number: string;
  date: Date;
}

type TFactura = {
  id: string;
  tipo: string;
  numero: string;
  fecha: string;
  monto?: number;
}

type TPaymentHistory = {
  amount: number;
  date?: Date;
  type: string;
  method: EPaymentMethod;
  notes?: string;
};

type TOrder = {
  bank?: string | number;
  invoiceType: string;
  id: string;
  number: string;               // Número de orden
  quoteId: string;              // Referencia al presupuesto original
  // Cliente (estructura normalizada)
  client?: TClient;             // Objeto completo (legacy)
  clientId?: string | null;     // ID del cliente (referencia)
  clientName?: string;           // Nombre para mostrar rápido
  tempClientData?: TClient;     // Datos temporales
  // Campos legacy
  contact?: any;
  cuit?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  // Estado y items
  status: EOrderStatus;
  items: TOrderItem[];
  // Financieros
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  applyIVA: boolean;
  discount?: number;
  discountAmount?: number;
  manualDiscount?: number;
  discountPercentage?: number;
  total: number;
  // Fechas
  notes?: string;
  estimatedDeliveryDate?: Date | number;
  actualDeliveryDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;             // Cuando pasa a 'in_process'
  completedAt?: Date;           // Cuando pasa a 'completed'
  deliveredAt?: Date;           // Fecha de entrega
  cancelledAt?: Date;           // Cuando pasa a 'cancelled'
  // Facturación y pagos
  paymentMethod?: EPaymentMethod;
  isInvoiced?: boolean;
  invoiceNumber?: string | [];
  invoiceDate?: Date;
  facturas?: TFactura[];        // Múltiples facturas
  downPayment?: number;         // Seña
  balance?: number;             // Saldo pendiente
  publicUrl?: string;           // URL pública del documento
  paymentHistory?: TPaymentHistory[]; // Historial de pagos
}
```

### 4. **Sale Types** (`sale.ts`):

```typescript
enum EPaymentMethod {
  CASH = "cash",
  CREDIT_CARD = "credit_card",
  DEBIT_CARD = "debit_card",
  TRANSFER = "transfer",
  MERCADOPAGO = "mercadopago",
  CHECK = "cheque",
}

type TFactura = {
  id: string;
  tipo: string;
  numero: string;
  fecha: string;
  monto?: number;
}

interface TSaleItem {
  isManual?: boolean;           // Si fue creado manualmente
  description: string;
  productName: string;
  variantName: any;
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface TSale {
  bank?: string | null;
  id?: string;
  number: string;               // Número de venta
  items: TSaleItem[];
  // Financieros
  subtotal: number;
  total: number;
  applyIVA?: boolean;
  taxRate?: number;
  taxAmount?: number;
  discountPercentage?: number;
  discountAmount?: number;
  manualDiscount?: number;
  // Pago
  paymentMethod: EPaymentMethod;
  // Facturación (legacy)
  isInvoiced: boolean;
  invoiceNumber: string | null;
  // Facturación (nuevo - múltiples facturas)
  facturas?: TFactura[];
  // Cliente (estructura normalizada)
  client?: TClient;             // Objeto completo (legacy)
  clientId?: string | null;     // ID del cliente (referencia)
  clientName?: string;          // Nombre para mostrar
  tempClientData?: TClient;     // Datos temporales
  // Campos legacy
  contact?: any;
  cuit?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  // Fechas y referencias
  createdAt: Date;
  updatedAt: Date;
  orderId?: string;             // Referencia a orden si viene de una
}
```

### 5. **Quote Types** (`quote.ts`):

```typescript
enum EQuoteStatus {
  DRAFT = "draft",
  SENT = "sent",
  CONFIRMED = "confirmed",
  REJECTED = "rejected",
}

type TQuoteItem = {
  id: string;
  // Referencias
  productId?: string;           // ID del producto (null si es manual)
  variantId?: string;           // ID de la variante
  // Datos snapshot (para mostrar rápido)
  productName: string;
  description: string;
  variantName?: string;         // ej: "Talle L", "Color Rojo"
  categories?: TProductCategory[];
  // Datos de cotización
  quantity: number;
  unitPrice: number;
  discount?: number;
  subtotal: number;
  tax: number;
  taxAmount: number;
  notes?: string;
  isManual?: boolean;           // true si es creado manualmente
};

type TQuoteComment = {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: Date;
  isInternal: boolean;          // Si es comentario interno
};

type TQuote = {
  id: string;
  number: string;               // Número de presupuesto
  client: TClient;              // Cliente (objeto completo)
  items: TQuoteItem[];
  // Financieros
  subtotal: number;
  taxRate: number;
  tax: number;
  taxAmount: number;
  total: number;
  // Estado
  status: EQuoteStatus;
  validUntil: Date;             // Fecha de validez
  // Fechas
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date;
  confirmedAt?: Date;
  rejectedAt?: Date;
  // Comentarios y notas
  comments?: TQuoteComment[];
  notes?: string;
  publicUrl?: string;           // URL pública del PDF
}
```

### 6. **User Types** (`user.ts`):

```typescript
enum EUserRole {
  ADMIN = "admin",
  STAFF = "staff",
  VIEWER = "viewer",
}

enum EUserStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
}

type TUser = {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: EUserRole;              // Rol del usuario
  status: EUserStatus;          // Estado (activo/inactivo)
  createdAt: Date;
  lastLogin?: Date;
}
```

### Características Generales de los Tipos:

1. **Enums**: Se usan para estados y opciones predefinidas (status, roles, tipos)
2. **Tipos vs Interfaces**: Mezcla según convención (Tipos para objetos simples, Interfaces para estructuras complejas)
3. **Campos Opcionales**: Muchos campos son opcionales (`?`) para flexibilidad
4. **Legacy Support**: Algunos tipos tienen campos legacy para compatibilidad con datos antiguos
5. **Normalización**: Estructura normalizada con referencias (`clientId`) y snapshots (`clientName`) para performance
6. **Fechas**: Uso de `Date` objects para fechas
7. **Referencias Firestore**: Uso de `DocumentReference` donde es necesario

---

## 🔧 ASPECTOS ADICIONALES IMPORTANTES

### 1. **Hooks Personalizados**:

La aplicación utiliza hooks personalizados para encapsular la lógica de Firestore:

- **useClients**: CRUD de clientes
- **useOrders**: CRUD de órdenes, cambios de estado, pagos
- **useSales**: CRUD de ventas

Estos hooks usan `reactfire` para datos reactivos que se actualizan automáticamente cuando cambian en Firestore.

### 2. **Generación de PDFs**:

- Usa `html2canvas` para capturar HTML como imagen
- Usa `jspdf` para generar PDFs
- Se generan PDFs para presupuestos, órdenes y ventas

### 3. **Exportación de Datos**:

- `xlsx` para exportar a Excel
- Exportación de reportes, listados, etc.

### 4. **Sistema de Navegación**:

- Sidebar colapsable en `DashboardLayout`
- Menú con sub-items que se expanden/colapsan
- Navegación basada en el rol del usuario
- Highlight de la ruta actual

### 5. **Formularios**:

- React Hook Form para manejo de formularios
- Zod para validación de esquemas
- Componentes UI de shadcn/ui para inputs, selects, etc.

### 6. **Deployment**:

- Firebase Hosting con SSR
- Cloud Functions para backend si es necesario
- Configuración en `firebase.json`

### 7. **Estilos**:

- Tailwind CSS como framework de estilos
- Sistema de diseño basado en shadcn/ui
- Paleta de colores azules predominante
- Componentes responsivos

### 8. **Manejo de Estado**:

- Context API para autenticación
- ReactFire para estado de Firestore (reactivo)
- Estado local con `useState` para UI

### 9. **Estructura de Datos en Firestore**:

- Normalización parcial: referencias + snapshots
- Subcolecciones para items cuando es necesario
- Timestamps con `serverTimestamp()` para consistencia

### 10. **Sistema de Notificaciones**:

- Usa **Sonner** para notificaciones toast
- Notificaciones de éxito, error, y advertencias
- Se importa con: `import { toast } from "sonner"`
- Ejemplos: `toast.success()`, `toast.error()`, `toast.warning()`

### 11. **Generación de Números Secuenciales**:

- **Órdenes**: Formato `O-YYYY-XXXX` donde YYYY es el año y XXXX es un número aleatorio de 4 dígitos (1000-9999)
  - Ejemplo: `O-2024-5234`
- **Presupuestos**: Formato `P-YYYY-XXXX` (mismo patrón)
  - Ejemplo: `P-2024-7890`
- **Ventas**: Similar a órdenes, formato `V-YYYY-XXXX`
- La generación se hace en el cliente usando `Math.random()` y el año actual
- No se utiliza un contador global en Firestore, sino números pseudo-aleatorios

### 12. **Rutas Dinámicas de Next.js**:

- Uso de rutas dinámicas para páginas de detalle: `[id]/page.tsx`
- Ejemplos:
  - `/publimar/banderas/ordenes/[id]/page.tsx` - Detalle de orden
  - `/publimar/banderas/clientes/[id]/page.tsx` - Detalle de cliente
  - `/publimar/banderas/clientes/[id]/editar/page.tsx` - Edición de cliente
- Se accede al ID usando `useParams()` de Next.js

### 13. **Sistema de Contadores**:

- Los productos tienen contadores de ventas:
  - `salesCount`: Número de veces que se ha vendido
  - `totalSales`: Total monetario vendido
- Estos contadores se actualizan cuando se registran ventas

### 14. **Manejo de Stock**:

- Control de stock en productos y variantes
- Validación de stock disponible antes de agregar items a ventas
- El stock se actualiza cuando se registran ventas

### 15. **Sistema de Facturación Múltiple**:

- Soporte para múltiples facturas por orden/venta
- Cada factura tiene: `id`, `tipo`, `numero`, `fecha`, `monto` (opcional)
- Array `facturas[]` en órdenes y ventas
- Campos legacy `invoiceNumber` e `isInvoiced` para compatibilidad

### 16. **Sistema de Pagos**:

- Historial de pagos (`paymentHistory[]`) en órdenes
- Cada pago tiene: `amount`, `date`, `type`, `method`, `notes`
- Soporte para señas (`downPayment`) y saldo pendiente (`balance`)
- Múltiples métodos de pago: efectivo, tarjeta, transferencia, MercadoPago, cheque

### 17. **Seguridad**:

- Reglas de Firestore deben estar configuradas en Firebase Console
- AuthGuard protege rutas en el frontend
- Validación de roles en el backend (Cloud Functions si aplica)

---

## 📋 CHECKLIST PARA REPLICAR

1. ✅ Configurar proyecto Next.js 13+ con TypeScript
2. ✅ Instalar dependencias (package.json)
3. ✅ Configurar Firebase (crear proyecto, obtener config)
4. ✅ Configurar variables de entorno (.env.local)
5. ✅ Implementar estructura de carpetas
6. ✅ Configurar Tailwind CSS y shadcn/ui
7. ✅ Crear tipos TypeScript
8. ✅ Implementar AuthContext y AuthGuard
9. ✅ Crear LoginForm y página de login
10. ✅ Implementar DashboardLayout
11. ✅ Configurar providers (FirebaseAppProvider, AuthProvider, etc.)
12. ✅ Crear hooks personalizados (useClients, useOrders, useSales)
13. ✅ Implementar colecciones de Firestore
14. ✅ Crear páginas y componentes de cada módulo
15. ✅ Implementar generación de PDFs
16. ✅ Configurar Firebase Hosting
17. ✅ Configurar reglas de seguridad de Firestore
18. ✅ Testing y ajustes

---

Este documento contiene toda la información necesaria para replicar la aplicación PublimarTools desde cero. Asegúrate de seguir el orden del checklist y adaptar los detalles según tus necesidades específicas.


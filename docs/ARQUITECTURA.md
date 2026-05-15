# 🏗️ Arquitectura del Proyecto - PublimarTools

Documentación completa de la estructura, organización y patrones arquitectónicos del proyecto.

## 📁 Estructura de Carpetas

```
publimarTools/
├── src/
│   ├── app/                    # App Router de Next.js
│   │   ├── api/               # API Routes
│   │   ├── login/             # Página de login
│   │   ├── publimar/          # Dashboard principal
│   │   │   └── banderas/      # Módulo de banderas
│   │   │       ├── tienda/    # Dashboard de e-commerce
│   │   │       ├── productos/ # Gestión de productos
│   │   │       ├── clientes/  # Gestión de clientes
│   │   │       ├── ordenes/   # Órdenes de trabajo
│   │   │       ├── ventas/    # Registro de ventas
│   │   │       ├── compras/   # Registro de compras
│   │   │       └── categorias/# Gestión de categorías
│   │   ├── layout.tsx         # Layout raíz
│   │   ├── page.tsx           # Página principal
│   │   └── ClientProviders.tsx # Providers del cliente
│   │
│   ├── components/            # Componentes reutilizables
│   │   ├── layouts/          # Layouts (DashboardLayout)
│   │   ├── ui/               # Componentes UI (shadcn)
│   │   └── [feature]/        # Componentes por feature
│   │
│   ├── contexts/             # React Contexts
│   │   └── AuthContext.tsx  # Contexto de autenticación
│   │
│   ├── hooks/                # Custom React Hooks
│   │   ├── useClients.ts
│   │   ├── useProducts.ts
│   │   └── useFirestore.ts
│   │
│   ├── lib/                  # Utilidades y helpers
│   │   ├── firebase.ts      # Configuración de Firebase
│   │   ├── utils.ts         # Utilidades generales
│   │   └── [helpers].ts     # Helpers específicos
│   │
│   └── types/                # TypeScript types
│       ├── product.ts
│       ├── client.ts
│       ├── ecommerceOrder.ts
│       ├── abandonedCart.ts
│       └── analytics.ts
│
├── public/                   # Archivos estáticos
│   ├── images/
│   └── icons/
│
├── docs/                     # Documentación
│   ├── TECNOLOGIAS.md
│   ├── ARQUITECTURA.md
│   └── ...
│
├── .env.local               # Variables de entorno (no versionado)
├── .gitignore
├── next.config.js           # Configuración de Next.js
├── tailwind.config.js       # Configuración de Tailwind
├── tsconfig.json            # Configuración de TypeScript
└── package.json             # Dependencias y scripts
```

## 🎯 Arquitectura General

### Patrón: Monolito Modular

El proyecto sigue una arquitectura de **monolito modular**, donde cada módulo de negocio está claramente separado pero comparte infraestructura común.

```
┌─────────────────────────────────────┐
│         Frontend (Next.js)          │
├─────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐        │
│  │ Clientes │  │Productos │  ...   │
│  └────┬─────┘  └────┬─────┘        │
│       │             │               │
│  ┌────┴─────────────┴─────┐        │
│  │  Shared Components      │        │
│  │  Contexts, Hooks, Utils │        │
│  └─────────┬───────────────┘        │
└────────────┼───────────────────────┘
             │
    ┌────────┴────────┐
    │    Firebase     │
    ├─────────────────┤
    │   Firestore     │ ← Database
    │   Auth          │ ← Authentication
    │   Storage       │ ← File Storage
    └─────────────────┘
```

## 📱 App Router (Next.js 13+)

### Estructura de Rutas

```
app/
├── layout.tsx                          → Layout global
├── page.tsx                            → / (redirect a login)
├── login/
│   └── page.tsx                        → /login
└── publimar/banderas/
    ├── layout.tsx                      → Layout del dashboard
    ├── page.tsx                        → /publimar/banderas (dashboard home)
    │
    ├── tienda/
    │   ├── page.tsx                    → Dashboard de tienda
    │   ├── pedidos/page.tsx            → Lista de pedidos
    │   ├── [orderId]/page.tsx          → Detalle de pedido
    │   ├── carritos-abandonados/page.tsx → Carritos abandonados
    │   └── analytics/page.tsx          → Analytics de tienda
    │
    ├── productos/
    │   ├── page.tsx                    → Lista de productos
    │   ├── nuevo/page.tsx              → Crear producto
    │   └── modalProductos/
    │       └── ProductModal.tsx        → Modal de edición
    │
    ├── clientes/
    │   ├── page.tsx                    → Lista de clientes
    │   └── modalClientes/
    │       └── ClientModal.tsx         → Modal de edición
    │
    ├── ordenes/
    │   ├── page.tsx                    → Lista de órdenes
    │   ├── nuevas/page.tsx             → Nueva orden
    │   └── [id]/page.tsx               → Detalle de orden
    │
    ├── ventas/page.tsx                 → Registro de ventas
    ├── compras/page.tsx                → Registro de compras
    └── categorias/page.tsx             → Gestión de categorías
```

### Convenciones de Naming

- **page.tsx**: Página de ruta
- **layout.tsx**: Layout compartido
- **loading.tsx**: Estado de carga
- **error.tsx**: Página de error
- **[param]**: Ruta dinámica
- **Modal[Feature].tsx**: Componente modal

## 🧩 Componentes

### Jerarquía de Componentes

```
App
└── ClientProviders          (Providers globales)
    └── DashboardLayout      (Layout del dashboard)
        ├── Sidebar          (Navegación)
        ├── Header           (Header con usuario)
        └── [PageContent]    (Contenido de la página)
            ├── Cards        (Tarjetas de métricas)
            ├── Tables       (Tablas de datos)
            └── Modals       (Modales de edición)
```

### Tipos de Componentes

#### 1. **Server Components** (por defecto)
- Renderizan en el servidor
- Mejor SEO
- Reducen bundle size del cliente
- No pueden usar hooks de React

```typescript
// src/app/publimar/banderas/page.tsx
export default async function DashboardPage() {
  // Este componente renderiza en el servidor
  return <div>Dashboard</div>
}
```

#### 2. **Client Components** ('use client')
- Renderizan en el cliente
- Pueden usar hooks
- Interactividad
- Acceso a browser APIs

```typescript
'use client'
// src/app/publimar/banderas/tienda/page.tsx
export default function TiendaDashboardPage() {
  const [data, setData] = useState([])
  // Hooks y estado del cliente
  return <div>...</div>
}
```

### Componentes Compartidos

**Ubicación**: `src/components/`

#### UI Components (`src/components/ui/`)
- Componentes de shadcn/ui
- Reutilizables en todo el proyecto
- Altamente personalizables

**Ejemplos**:
- `button.tsx` - Botón
- `card.tsx` - Tarjeta
- `table.tsx` - Tabla
- `dialog.tsx` - Modal/Dialog
- `input.tsx` - Input de formulario

#### Layout Components (`src/components/layouts/`)
- `DashboardLayout.tsx` - Layout principal del dashboard
  - Sidebar con navegación
  - Header con info de usuario
  - Notificaciones en tiempo real
  - Gestión de sesión

## 🔄 Gestión de Estado

### 1. React Context API

**AuthContext** (`src/contexts/AuthContext.tsx`)
```typescript
interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}
```

**Uso**: Autenticación global del usuario

### 2. Local State (useState)
- Estado de componente individual
- No necesita compartirse

### 3. Server State (ReactFire)
- Datos de Firebase
- Sincronización automática
- Hooks: `useFirestore()`, `useAuth()`

### 4. URL State
- Parámetros de ruta
- Query strings
- Navegación

## 🗄️ Capa de Datos

### Firebase Integration

**Configuración**: `src/lib/firebase.ts`

```typescript
// Inicialización
const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const auth = getAuth(app)
const storage = getStorage(app)

export { db, auth, storage }
```

### Custom Hooks para Datos

**Ubicación**: `src/hooks/`

#### useClients.ts
```typescript
export function useClients() {
  const [clients, setClients] = useState<TClient[]>([])
  const [loading, setLoading] = useState(true)

  // Lógica de fetch y gestión

  return { clients, loading, addClient, updateClient, deleteClient }
}
```

#### useProducts.ts
```typescript
export function useProducts() {
  // Similar a useClients
  return { products, loading, addProduct, updateProduct, deleteProduct }
}
```

### Tipos TypeScript

**Ubicación**: `src/types/`

Cada entidad de negocio tiene su propio archivo de tipos:

```typescript
// src/types/product.ts
export interface TProduct {
  id: string
  name: string
  price: number
  stock: number
  variants: TProductVariant[]
  categories: string[]
  // ...
}

export interface TProductVariant {
  id: string
  size: string
  price: number
  stock: number
  sku?: string
}
```

## 🔐 Autenticación y Autorización

### Flow de Autenticación

```
1. Usuario ingresa credenciales
   └→ /login/page.tsx

2. Firebase Auth valida
   └→ src/lib/firebase.ts

3. AuthContext actualiza estado
   └→ src/contexts/AuthContext.tsx

4. Redirect a dashboard
   └→ /publimar/banderas

5. Layout verifica sesión
   └→ DashboardLayout.tsx
```

### Protección de Rutas

```typescript
// src/components/layouts/DashboardLayout.tsx
export default function DashboardLayout({ children }) {
  const { user, loading } = useAuth()

  if (loading) return <Loading />
  if (!user) redirect('/login')

  return <Dashboard>{children}</Dashboard>
}
```

## 🎨 Styling Architecture

### Tailwind CSS + Component Variants

**Configuración**: `tailwind.config.js`

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '...',
        secondary: '...'
      }
    }
  }
}
```

### CVA (Class Variance Authority)

Definir variantes de componentes:

```typescript
const buttonVariants = cva(
  "base-classes",
  {
    variants: {
      variant: {
        default: "bg-primary",
        outline: "border-2"
      },
      size: {
        sm: "h-8",
        lg: "h-12"
      }
    }
  }
)
```

### Helper cn()

**Ubicación**: `src/lib/utils.ts`

```typescript
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Uso**: Merge inteligente de clases Tailwind

## 🔌 API Routes

**Ubicación**: `src/app/api/`

### Estructura

```
api/
├── auth/
│   └── login/
│       └── route.ts        → POST /api/auth/login
└── products/
    └── route.ts            → GET /api/products
```

### Ejemplo

```typescript
// src/app/api/products/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const products = await getProducts()
  return NextResponse.json(products)
}

export async function POST(request: Request) {
  const data = await request.json()
  const newProduct = await createProduct(data)
  return NextResponse.json(newProduct)
}
```

## 📊 Patrones de Diseño

### 1. Container/Presentational Pattern

**Container** (lógica):
```typescript
// ProductsPageContainer.tsx
export default function ProductsPage() {
  const { products, loading } = useProducts()

  if (loading) return <Loading />

  return <ProductsList products={products} />
}
```

**Presentational** (UI):
```typescript
// ProductsList.tsx
interface Props {
  products: TProduct[]
}

export function ProductsList({ products }: Props) {
  return <div>{products.map(p => <ProductCard key={p.id} {...p} />)}</div>
}
```

### 2. Compound Components

Modal con subcomponentes:

```typescript
<Dialog>
  <DialogTrigger>Open</DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    ...
  </DialogContent>
</Dialog>
```

### 3. Custom Hooks Pattern

Encapsular lógica reutilizable:

```typescript
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
```

## 🚀 Optimizaciones

### 1. Code Splitting
- Automático con Next.js App Router
- Dynamic imports para componentes pesados

### 2. Image Optimization
```typescript
import Image from 'next/image'

<Image
  src="/product.jpg"
  width={500}
  height={500}
  alt="Product"
/>
```

### 3. Font Optimization
```typescript
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })
```

### 4. Memoization
```typescript
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(data)
}, [data])
```

## 📦 Build & Deploy

### Build Process

```bash
pnpm build
```

1. TypeScript compilation
2. Tailwind CSS purge
3. Next.js optimization
4. Static generation
5. Bundle minification

### Deploy a Vercel

```bash
git push origin main
```

- Auto-deploy desde GitHub
- Preview deployments en PRs
- Environment variables en dashboard

### Deploy a Firebase

```bash
pnpm deploy
```

- Build + Firebase hosting deploy

## 🧪 Testing Strategy

### Estructura Recomendada

```
src/
├── __tests__/
│   ├── components/
│   ├── hooks/
│   └── utils/
└── [feature]/
    └── [component].test.tsx
```

### Tools Sugeridos
- Jest - Test runner
- React Testing Library - Component testing
- Cypress - E2E testing

## 📝 Convenciones de Código

### Naming Conventions

- **Componentes**: PascalCase (`ProductCard.tsx`)
- **Hooks**: camelCase con prefijo `use` (`useProducts.ts`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Types**: PascalCase con prefijo `T` (`TProduct`)
- **Interfaces**: PascalCase con prefijo `I` (opcional)

### File Organization

```typescript
// 1. Imports
import { useState } from 'react'
import { Button } from '@/components/ui/button'

// 2. Types/Interfaces
interface Props {
  // ...
}

// 3. Component
export default function Component({ }: Props) {
  // 3.1 Hooks
  const [state, setState] = useState()

  // 3.2 Handlers
  const handleClick = () => {}

  // 3.3 Render
  return <div>...</div>
}
```

## 🔄 Data Flow

```
User Interaction
    ↓
Event Handler
    ↓
State Update / API Call
    ↓
Firebase (Firestore/Auth)
    ↓
ReactFire Hook / Custom Hook
    ↓
Component Re-render
    ↓
UI Update
```

---

**Última actualización**: Enero 2026

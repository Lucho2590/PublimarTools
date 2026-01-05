# 🔥 Firebase - PublimarTools & BanderasMDP

Documentación completa de la configuración de Firebase, colecciones de Firestore, reglas de seguridad y mejores prácticas.

## 🎯 Visión General

El proyecto utiliza **un único proyecto de Firebase** compartido entre:
- **BanderasMDP**: Tienda online pública (frontend)
- **PublimarTools**: Dashboard administrativo (backend)

```
┌─────────────────────────────────────────┐
│        Firebase Project                 │
│        (publimar-tools)                 │
├─────────────────────────────────────────┤
│                                         │
│  📊 Firestore Database                  │
│  👤 Authentication                      │
│  📁 Storage                             │
│  📈 Analytics                           │
│  🌐 Hosting                             │
│                                         │
└────────┬─────────────────┬──────────────┘
         │                 │
         ▼                 ▼
  ┌─────────────┐   ┌─────────────────┐
  │ BanderasMDP │   │  PublimarTools  │
  │   (Web)     │   │     (Admin)     │
  │             │   │                 │
  │ - Lectura   │   │ - Lectura       │
  │ - Escritura │   │ - Escritura     │
  │   anónima   │   │   autenticada   │
  │   (limited) │   │   (full access) │
  └─────────────┘   └─────────────────┘
```

## 🔧 Configuración

### Inicialización de Firebase

#### PublimarTools (`src/lib/firebase.ts`)

```typescript
import { initializeApp, getApps, getApp } from "firebase/app";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Previene inicialización múltiple - Compatible con SSR
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Analytics solo en el cliente
let analytics: any = null;
if (typeof window !== "undefined") {
  import("firebase/analytics").then(({ getAnalytics }) => {
    analytics = getAnalytics(app);
  });
}

export { app, analytics };
```

#### BanderasMDP (`lib/firebase.ts`)

```typescript
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getAnalytics, Analytics } from "firebase/analytics";

const firebaseConfig = {
  // ... mismo config
};

// Singleton pattern
let app: FirebaseApp;
let db: Firestore;
let storage: FirebaseStorage;
let analytics: Analytics | null = null;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  storage = getStorage(app);

  if (typeof window !== "undefined") {
    analytics = getAnalytics(app);
  }
} else {
  app = getApps()[0];
  db = getFirestore(app);
  storage = getStorage(app);

  if (typeof window !== "undefined") {
    analytics = getAnalytics(app);
  }
}

export { app, db, storage, analytics };
```

### Variables de Entorno

#### `.env.local` (ambos proyectos)

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=publimar-tools.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=publimar-tools
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=publimar-tools.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-ABC123XYZ
```

**Importante**:
- ✅ Variables con prefijo `NEXT_PUBLIC_` son accesibles en el cliente
- ❌ NO versionar `.env.local` en Git (está en `.gitignore`)
- ✅ Crear `.env.example` con variables de ejemplo (sin valores reales)

## 📚 Colecciones de Firestore

### Constantes de Colecciones

**Ubicación**: `src/lib/collections.ts`

```typescript
const collections = {
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
  PURCHASES: "purchases",
  USERS: "users",
  EVENTS: "events",
  LOCATIONS: "locations",
  NOTES: "notes",
  DEVICES: "devices",
} as const;

export default collections;
```

### 1. `products` - Productos

**Propósito**: Catálogo de productos (banderas, productos publicitarios)

**Tipo**: `TProduct` (`src/types/product.ts`)

**Campos principales**:
```typescript
{
  id: string
  name: string
  sku: string
  description: string
  price: number
  stock: number
  variants: TProductVariant[]  // Subcollection o array
  categories: string[]
  images: string[]
  featured: boolean
  active: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**Subcollections**:
- `products/{productId}/variants` - Variantes de producto (tamaños, colores)

**Reglas de seguridad**:
```javascript
match /products/{productId} {
  // Todos pueden leer (tienda pública)
  allow read: if true;

  // Solo admin puede escribir
  allow write: if request.auth != null &&
               request.auth.token.role == 'admin';
}
```

### 2. `clients` - Clientes

**Propósito**: Base de datos de clientes del CRM

**Tipo**: `TClient` (`src/types/client.ts`)

**Campos principales**:
```typescript
{
  id: string
  name: string
  type: "individual" | "company"
  status: "active" | "inactive"
  businessName?: string
  email?: string
  phone?: string
  address?: string
  cuit?: string
  notes?: string
  contacts?: TClientContact[]
  createdAt: Date
  updatedAt: Date
}
```

**Reglas de seguridad**:
```javascript
match /clients/{clientId} {
  // Solo usuarios autenticados (admin)
  allow read, write: if request.auth != null;
}
```

### 3. `ecommerceOrders` - Pedidos de E-commerce

**Propósito**: Órdenes creadas desde BanderasMDP (tienda web)

**Tipo**: `TEcommerceOrder` (`src/types/ecommerceOrder.ts`)

**Campos principales**:
```typescript
{
  id: string
  orderNumber: string  // "ECOM-20250101-001"
  customer: {
    phone?: string
    name?: string
    email?: string
    address?: string
  }
  items: EcommerceOrderItem[]
  subtotal: number
  shippingCost: number
  discount: number
  total: number
  status: "pending" | "confirmed" | "preparing" | "shipped" | "delivered" | "cancelled"
  source: "web" | "whatsapp_direct" | "phone"
  metadata: {
    deviceType: "mobile" | "desktop" | "tablet"
    sessionId: string
    browser?: string
    utmSource?: string
  }
  whatsappMessageSent: boolean
  whatsappConversationUrl?: string
  viewed: boolean
  viewedAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
  confirmedAt?: Timestamp
}
```

**Reglas de seguridad**:
```javascript
match /ecommerceOrders/{orderId} {
  // Usuarios anónimos pueden crear (desde web)
  allow create: if true;

  // Solo admin puede leer y actualizar
  allow read, update, delete: if request.auth != null;
}
```

### 4. `abandonedCarts` - Carritos Abandonados

**Propósito**: Tracking de carritos abandonados para recuperación

**Tipo**: `TAbandonedCart` (`src/types/abandonedCart.ts`)

**Campos principales**:
```typescript
{
  id: string
  sessionId: string  // Único por sesión del navegador
  customer?: {
    name?: string
    email?: string
    phone?: string
  }
  items: AbandonedCartItem[]
  itemsCount: number
  subtotal: number
  total: number
  abandoned: boolean
  converted: boolean
  convertedOrderId?: string
  recoveryMessagesSent: number
  lastRecoveryMessageAt?: Timestamp
  metadata: {
    deviceType: string
    sessionId: string
    lastPage?: string
  }
  firstAddedAt: Timestamp
  lastActivityAt: Timestamp
  abandonedAt?: Timestamp
  viewed: boolean
  viewedAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**Reglas de seguridad**:
```javascript
match /abandonedCarts/{cartId} {
  // Escritura anónima (tracking desde web)
  allow create, update: if true;

  // Solo admin puede leer
  allow read, delete: if request.auth != null;
}
```

**IMPORTANTE - Query correcto**:
```typescript
// ❌ INCORRECTO - Filtra demasiado
query(collection(db, "abandonedCarts"), where("abandoned", "==", true))

// ✅ CORRECTO - Solo filtrar por no convertidos
query(collection(db, "abandonedCarts"), where("converted", "==", false))
```

### 5. `productAnalytics` - Analytics de Productos

**Propósito**: Métricas agregadas por producto

**Tipo**: `TProductAnalytics` (`src/types/analytics.ts`)

**Documento ID**: `{productId}` (un doc por producto)

**Campos principales**:
```typescript
{
  productId: string
  productName: string
  viewsCount: number
  uniqueViewsCount: number
  addToCartCount: number
  removeFromCartCount: number
  purchasedCount: number
  totalRevenue: number
  conversionRate: number
  cartConversionRate: number
  lastViewedAt: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**Reglas de seguridad**:
```javascript
match /productAnalytics/{productId} {
  // Escritura anónima (tracking)
  allow write: if true;

  // Solo admin puede leer
  allow read: if request.auth != null;
}
```

### 6. `productViewEvents` - Eventos de Vistas

**Propósito**: Registro individual de cada vista de producto

**Tipo**: `TProductViewEvent` (`src/types/analytics.ts`)

**Campos principales**:
```typescript
{
  productId: string
  productName: string
  sessionId: string
  timestamp: Timestamp
  source?: "tienda" | "busqueda" | "destacados" | "categorias"
  searchTerm?: string
  category?: string
  metadata?: {
    userAgent?: string
    referrer?: string
    deviceType?: string
  }
}
```

**Reglas de seguridad**:
```javascript
match /productViewEvents/{eventId} {
  allow create: if true;  // Escritura anónima
  allow read: if request.auth != null;  // Solo admin lee
}
```

### 7. `searchQueries` - Búsquedas

**Propósito**: Registro de búsquedas realizadas

**Tipo**: `TSearchQuery` (`src/types/analytics.ts`)

**Campos principales**:
```typescript
{
  searchTerm: string
  resultsCount: number
  sessionId: string
  timestamp: Timestamp
  clickedProductId?: string
  clickedPosition?: number
  source?: "tienda" | "home"
}
```

**Reglas de seguridad**:
```javascript
match /searchQueries/{queryId} {
  allow create: if true;
  allow read: if request.auth != null;
}
```

### 8. `conversionFunnels` - Embudos de Conversión

**Propósito**: Tracking del recorrido del usuario

**Tipo**: `TConversionFunnel` (`src/types/analytics.ts`)

**Documento ID**: `{sessionId}` (un doc por sesión)

**Campos principales**:
```typescript
{
  sessionId: string
  viewedProducts: string[]
  addedToCart: string[]
  purchasedProducts: string[]
  firstViewAt: Timestamp
  firstAddToCartAt?: Timestamp
  checkoutAt?: Timestamp
  purchaseAt?: Timestamp
  stage: "viewed" | "added_to_cart" | "checkout" | "purchased" | "abandoned"
  totalProductsViewed: number
  totalProductsInCart: number
  totalProductsPurchased: number
  totalRevenue: number
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**Reglas de seguridad**:
```javascript
match /conversionFunnels/{sessionId} {
  allow write: if true;  // Escritura anónima
  allow read: if request.auth != null;
}
```

### 9. `orders` - Órdenes de Trabajo (CRM)

**Propósito**: Órdenes de trabajo del CRM (DIFERENTE a ecommerceOrders)

**Usado en**: Gestión interna, producción, órdenes offline

**Subcollections**:
- `orders/{orderId}/items` - Items de la orden

**Reglas de seguridad**:
```javascript
match /orders/{orderId} {
  allow read, write: if request.auth != null;
}
```

### 10. `sales` - Ventas

**Propósito**: Registro de ventas realizadas

**Subcollections**:
- `sales/{saleId}/items` - Productos vendidos

**Reglas de seguridad**:
```javascript
match /sales/{saleId} {
  allow read, write: if request.auth != null;
}
```

### 11. `quotes` - Presupuestos

**Propósito**: Cotizaciones generadas para clientes

**Subcollections**:
- `quotes/{quoteId}/items` - Items del presupuesto
- `quotes/{quoteId}/comments` - Comentarios del presupuesto

**Reglas de seguridad**:
```javascript
match /quotes/{quoteId} {
  allow read, write: if request.auth != null;
}
```

### 12. `purchases` - Compras

**Propósito**: Registro de compras a proveedores

**Reglas de seguridad**:
```javascript
match /purchases/{purchaseId} {
  allow read, write: if request.auth != null;
}
```

### 13. `users` - Usuarios

**Propósito**: Datos adicionales de usuarios (complemento a Firebase Auth)

**Campos sugeridos**:
```typescript
{
  uid: string
  email: string
  displayName: string
  role: "admin" | "user" | "viewer"
  photoURL?: string
  createdAt: Timestamp
  lastLogin: Timestamp
}
```

**Reglas de seguridad**:
```javascript
match /users/{userId} {
  // Usuario puede leer su propio doc
  allow read: if request.auth != null && request.auth.uid == userId;

  // Solo admin puede escribir
  allow write: if request.auth != null &&
               get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```

### 14. `events` - Eventos

**Propósito**: Calendario de eventos, recordatorios

**Reglas de seguridad**:
```javascript
match /events/{eventId} {
  allow read, write: if request.auth != null;
}
```

### 15. `notes` - Notas

**Propósito**: Notas internas del equipo

**Reglas de seguridad**:
```javascript
match /notes/{noteId} {
  allow read, write: if request.auth != null;
}
```

### 16. `locations` - Ubicaciones (Vía Pública)

**Propósito**: Ubicaciones de dispositivos de vía pública

**Reglas de seguridad**:
```javascript
match /locations/{locationId} {
  allow read, write: if request.auth != null;
}
```

### 17. `devices` - Dispositivos (Vía Pública)

**Propósito**: Dispositivos de vía pública

**Reglas de seguridad**:
```javascript
match /devices/{deviceId} {
  allow read, write: if request.auth != null;
}
```

### 18. `categories` - Categorías de Productos

**Propósito**: Categorías del catálogo

**Reglas de seguridad**:
```javascript
match /categories/{categoryId} {
  allow read: if true;
  allow write: if request.auth != null;
}
```

## 🔒 Reglas de Seguridad de Firestore

### Archivo `firestore.rules`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ============================================
    // FUNCIONES HELPER
    // ============================================

    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdmin() {
      return isAuthenticated() &&
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // ============================================
    // CATÁLOGO PÚBLICO
    // ============================================

    // Productos - Lectura pública, escritura admin
    match /products/{productId} {
      allow read: if true;
      allow write: if isAuthenticated();

      // Variantes de productos
      match /variants/{variantId} {
        allow read: if true;
        allow write: if isAuthenticated();
      }
    }

    // Categorías - Lectura pública, escritura admin
    match /categories/{categoryId} {
      allow read: if true;
      allow write: if isAuthenticated();
    }

    // ============================================
    // E-COMMERCE
    // ============================================

    // Órdenes de ecommerce - Crear anónimo, gestionar admin
    match /ecommerceOrders/{orderId} {
      allow create: if true;  // Usuarios web pueden crear
      allow read, update, delete: if isAuthenticated();
    }

    // Carritos abandonados - Escritura anónima, lectura admin
    match /abandonedCarts/{cartId} {
      allow create, update: if true;  // Tracking desde web
      allow read, delete: if isAuthenticated();
    }

    // ============================================
    // ANALYTICS (Escritura anónima, lectura admin)
    // ============================================

    match /productAnalytics/{productId} {
      allow write: if true;
      allow read: if isAuthenticated();
    }

    match /productViewEvents/{eventId} {
      allow create: if true;
      allow read: if isAuthenticated();
    }

    match /searchQueries/{queryId} {
      allow create: if true;
      allow read: if isAuthenticated();
    }

    match /conversionFunnels/{sessionId} {
      allow write: if true;
      allow read: if isAuthenticated();
    }

    // ============================================
    // CRM (Solo autenticados)
    // ============================================

    match /clients/{clientId} {
      allow read, write: if isAuthenticated();
    }

    match /quotes/{quoteId} {
      allow read, write: if isAuthenticated();

      match /items/{itemId} {
        allow read, write: if isAuthenticated();
      }

      match /comments/{commentId} {
        allow read, write: if isAuthenticated();
      }
    }

    match /orders/{orderId} {
      allow read, write: if isAuthenticated();

      match /items/{itemId} {
        allow read, write: if isAuthenticated();
      }
    }

    match /sales/{saleId} {
      allow read, write: if isAuthenticated();

      match /items/{itemId} {
        allow read, write: if isAuthenticated();
      }
    }

    match /purchases/{purchaseId} {
      allow read, write: if isAuthenticated();
    }

    match /events/{eventId} {
      allow read, write: if isAuthenticated();
    }

    match /notes/{noteId} {
      allow read, write: if isAuthenticated();
    }

    match /locations/{locationId} {
      allow read, write: if isAuthenticated();
    }

    match /devices/{deviceId} {
      allow read, write: if isAuthenticated();
    }

    // ============================================
    // USUARIOS
    // ============================================

    match /users/{userId} {
      // Usuario puede leer su propio doc
      allow read: if isAuthenticated() && request.auth.uid == userId;

      // Solo admin puede escribir
      allow write: if isAdmin();
    }
  }
}
```

### Desplegar Reglas

```bash
# Instalar Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Desplegar reglas
firebase deploy --only firestore:rules

# Desplegar todo
firebase deploy
```

## 📇 Índices de Firestore

### Índices Necesarios

**Crear en Firebase Console** → Firestore → Indexes

#### 1. Búsquedas sin resultados ordenadas por fecha
```json
{
  "collectionGroup": "searchQueries",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "resultsCount", "order": "ASCENDING" },
    { "fieldPath": "timestamp", "order": "DESCENDING" }
  ]
}
```

#### 2. Productos más vistos con buena conversión
```json
{
  "collectionGroup": "productAnalytics",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "viewsCount", "order": "DESCENDING" },
    { "fieldPath": "conversionRate", "order": "DESCENDING" }
  ]
}
```

#### 3. Carritos abandonados recientes no convertidos
```json
{
  "collectionGroup": "abandonedCarts",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "converted", "order": "ASCENDING" },
    { "fieldPath": "updatedAt", "order": "DESCENDING" }
  ]
}
```

#### 4. Órdenes de ecommerce por estado y fecha
```json
{
  "collectionGroup": "ecommerceOrders",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

### Archivo `firestore.indexes.json`

```json
{
  "indexes": [
    {
      "collectionGroup": "searchQueries",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "resultsCount", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "productAnalytics",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "viewsCount", "order": "DESCENDING" },
        { "fieldPath": "conversionRate", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "abandonedCarts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "converted", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "ecommerceOrders",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

**Desplegar**:
```bash
firebase deploy --only firestore:indexes
```

## 👤 Firebase Authentication

### Métodos Habilitados

1. **Email/Password** ✅
   - Método principal para admin
   - Registro manual desde Firebase Console

2. **Google OAuth** (opcional) 🔜
   - Para facilitar acceso de usuarios

### Setup de Auth

#### 1. Habilitar en Firebase Console

```
Authentication → Sign-in method → Email/Password → Enable
```

#### 2. Crear usuarios admin

**Desde Firebase Console**:
```
Authentication → Users → Add user
Email: admin@publimar.com
Password: [secure-password]
```

#### 3. Asignar rol admin

**Firestore**:
```javascript
// Crear documento en users/{uid}
{
  uid: "abc123...",
  email: "admin@publimar.com",
  displayName: "Admin Publimar",
  role: "admin",
  createdAt: serverTimestamp(),
  lastLogin: serverTimestamp()
}
```

### Uso en Código

#### Login

```typescript
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

const auth = getAuth();

const handleLogin = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Actualizar lastLogin
    await updateDoc(doc(db, "users", user.uid), {
      lastLogin: serverTimestamp()
    });

    router.push("/publimar/banderas");
  } catch (error) {
    console.error("Error login:", error);
  }
};
```

#### Logout

```typescript
import { getAuth, signOut } from "firebase/auth";

const auth = getAuth();

const handleLogout = async () => {
  await signOut(auth);
  router.push("/login");
};
```

#### Verificar Auth en Layout

```typescript
"use client";

export default function DashboardLayout({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <Loading />;
  if (!user) redirect("/login");

  return <Dashboard>{children}</Dashboard>;
}
```

## 📁 Firebase Storage

### Estructura de Carpetas

```
storage/
├── products/
│   ├── {productId}/
│   │   ├── image-1.jpg
│   │   ├── image-2.jpg
│   │   └── ...
│   └── ...
├── clients/
│   └── {clientId}/
│       └── documents/
└── uploads/
    └── temp/
```

### Reglas de Storage

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // Productos - Lectura pública, escritura admin
    match /products/{productId}/{imageName} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Clientes - Solo admin
    match /clients/{clientId}/{allPaths=**} {
      allow read, write: if request.auth != null;
    }

    // Uploads temporales - Solo admin
    match /uploads/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Upload de Imágenes

```typescript
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const storage = getStorage();

const uploadProductImage = async (
  productId: string,
  file: File
): Promise<string> => {
  const fileName = `${Date.now()}_${file.name}`;
  const storageRef = ref(storage, `products/${productId}/${fileName}`);

  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);

  return downloadURL;
};
```

## 🚀 Deploy y CI/CD

### Deploy Manual

```bash
# Instalar dependencias
npm install

# Build del proyecto
npm run build

# Deploy a Firebase Hosting
firebase deploy --only hosting

# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy Firestore indexes
firebase deploy --only firestore:indexes

# Deploy Storage rules
firebase deploy --only storage

# Deploy todo
firebase deploy
```

### GitHub Actions (Automático)

**`.github/workflows/firebase-deploy.yml`**:

```yaml
name: Deploy to Firebase

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
          # ... otras variables

      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: publimar-tools
```

## 📊 Operaciones Comunes

### Leer Documentos

```typescript
import { doc, getDoc } from "firebase/firestore";

// Leer un documento
const productRef = doc(db, "products", productId);
const productSnap = await getDoc(productRef);

if (productSnap.exists()) {
  const product = productSnap.data() as TProduct;
}
```

### Leer Colección

```typescript
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";

// Leer colección completa
const productsRef = collection(db, "products");
const productsSnap = await getDocs(productsRef);
const products = productsSnap.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
})) as TProduct[];

// Query con filtros
const activeProductsQuery = query(
  collection(db, "products"),
  where("active", "==", true),
  orderBy("name", "asc")
);
const activeProductsSnap = await getDocs(activeProductsQuery);
```

### Crear Documento

```typescript
import { collection, addDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";

// Auto-generate ID
const newProduct = {
  name: "Bandera Argentina",
  price: 2000,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
};
const docRef = await addDoc(collection(db, "products"), newProduct);
console.log("Product ID:", docRef.id);

// Custom ID
await setDoc(doc(db, "products", "custom-id"), newProduct);
```

### Actualizar Documento

```typescript
import { doc, updateDoc, serverTimestamp, increment } from "firebase/firestore";

// Actualizar campos específicos
await updateDoc(doc(db, "products", productId), {
  price: 2500,
  updatedAt: serverTimestamp()
});

// Incrementar valor (atómico)
await updateDoc(doc(db, "productAnalytics", productId), {
  viewsCount: increment(1),
  updatedAt: serverTimestamp()
});
```

### Eliminar Documento

```typescript
import { doc, deleteDoc } from "firebase/firestore";

await deleteDoc(doc(db, "products", productId));
```

### Escuchar Cambios en Tiempo Real

```typescript
import { doc, onSnapshot } from "firebase/firestore";

const unsubscribe = onSnapshot(
  doc(db, "products", productId),
  (doc) => {
    const product = doc.data() as TProduct;
    console.log("Product updated:", product);
  },
  (error) => {
    console.error("Error listening:", error);
  }
);

// Cleanup
unsubscribe();
```

### Transacciones

```typescript
import { runTransaction, doc } from "firebase/firestore";

await runTransaction(db, async (transaction) => {
  const productRef = doc(db, "products", productId);
  const productDoc = await transaction.get(productRef);

  if (!productDoc.exists()) {
    throw "Product does not exist!";
  }

  const newStock = productDoc.data().stock - quantity;
  if (newStock < 0) {
    throw "Not enough stock!";
  }

  transaction.update(productRef, { stock: newStock });
});
```

### Batch Writes

```typescript
import { writeBatch, doc } from "firebase/firestore";

const batch = writeBatch(db);

// Actualizar múltiples documentos
batch.update(doc(db, "products", "prod1"), { active: false });
batch.update(doc(db, "products", "prod2"), { active: false });
batch.update(doc(db, "products", "prod3"), { active: false });

// Commit
await batch.commit();
```

## 🎯 Best Practices

### 1. Estructura de Datos

✅ **DO**:
- Normalizar cuando sea necesario (separar en collections)
- Usar subcollections para datos anidados extensos
- Incluir timestamps (`createdAt`, `updatedAt`)
- Usar IDs descriptivos cuando sea posible

❌ **DON'T**:
- Arrays muy grandes (>100 elementos) → Usar subcollection
- Documentos >1MB → Particionar
- Datos profundamente anidados (>100 niveles)

### 2. Queries

✅ **DO**:
- Usar índices para queries compuestas
- Limitar resultados con `limit()`
- Ordenar en el servidor con `orderBy()`
- Paginar con `startAfter()` para grandes datasets

❌ **DON'T**:
- Queries que requieren escaneo completo
- Múltiples `where()` sin índice
- Ordenar grandes resultados en el cliente

### 3. Seguridad

✅ **DO**:
- Validar datos en reglas de seguridad
- Usar funciones helper en rules
- Verificar autenticación y autorización
- Limitar tamaño de writes

❌ **DON'T**:
- Confiar solo en validación del cliente
- Permitir acceso público a datos sensibles
- Hardcodear UIDs en reglas

### 4. Performance

✅ **DO**:
- Usar `serverTimestamp()` para timestamps
- Usar `increment()` para contadores atómicos
- Caché de datos en el cliente cuando sea apropiado
- Batch writes para múltiples operaciones

❌ **DON'T**:
- Writes individuales en loops (usar batch)
- Leer documentos innecesarios
- Escuchar cambios en colecciones grandes sin filtros

### 5. Costos

✅ **DO**:
- Monitorear uso en Firebase Console
- Usar `getCountFromServer()` para contar
- Implementar pagination
- Caché de datos frecuentes

❌ **DON'T**:
- Queries sin límite
- Escuchar todos los cambios sin necesidad
- Duplicar reads innecesarios

## 🔍 Debugging

### Emuladores Locales

```bash
# Instalar emuladores
firebase init emulators

# Ejecutar emuladores
firebase emulators:start

# Usar en código
import { connectFirestoreEmulator } from "firebase/firestore";
import { connectAuthEmulator } from "firebase/auth";

if (process.env.NODE_ENV === "development") {
  connectFirestoreEmulator(db, "localhost", 8080);
  connectAuthEmulator(auth, "http://localhost:9099");
}
```

### Logs

```typescript
// Enable logging
import { setLogLevel } from "firebase/firestore";

setLogLevel("debug");
```

### Firebase Console

- **Firestore**: Ver/editar documentos manualmente
- **Authentication**: Gestionar usuarios
- **Usage**: Monitorear reads/writes/storage
- **Logs**: Ver errores y warnings

## 📚 Recursos

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Best Practices](https://firebase.google.com/docs/firestore/best-practices)
- [Firestore Pricing](https://firebase.google.com/pricing)

---

**Última actualización**: Enero 2026

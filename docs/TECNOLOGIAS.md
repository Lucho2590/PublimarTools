# 📖 Stack Tecnológico - PublimarTools

Documentación completa de todas las tecnologías, frameworks y bibliotecas utilizadas en el proyecto.

## 🏗️ Core Framework

### Next.js 13.4.19
- **Tipo**: Framework de React para producción
- **Características usadas**:
  - App Router (nuevo sistema de routing)
  - Server Components
  - Client Components
  - API Routes
  - Optimización de imágenes
  - Font optimization
- **Razón de elección**: Framework moderno con excelente rendimiento y SEO

### React 18.2.0
- **Tipo**: Biblioteca UI
- **Características usadas**:
  - Hooks (useState, useEffect, useContext, useCallback, useMemo)
  - Context API para gestión de estado
  - Concurrent features
- **Razón de elección**: Ecosistema maduro y amplio soporte

### TypeScript 5.3.3
- **Tipo**: Lenguaje de programación
- **Beneficios**:
  - Type safety
  - Mejor autocompletado IDE
  - Detección temprana de errores
  - Mejor mantenibilidad del código
- **Razón de elección**: Código más robusto y escalable

## 🎨 Styling & UI

### Tailwind CSS 3.3.6
- **Tipo**: Framework CSS utility-first
- **Plugins**:
  - `tailwindcss-animate` - Animaciones predefinidas
  - `autoprefixer` - Compatibilidad cross-browser
- **Utilidades personalizadas**: Extendidas en `tailwind.config.js`

### shadcn/ui
- **Tipo**: Colección de componentes React reutilizables
- **Componentes utilizados**:
  - Button
  - Card
  - Dialog
  - Input
  - Label
  - Select
  - Table
  - Tabs
  - Checkbox
  - Popover
  - ScrollArea
  - Collapsible
- **Razón de elección**: Componentes accesibles, personalizables y bien diseñados

### Radix UI
- **Tipo**: Biblioteca de componentes primitivos sin estilo
- **Paquetes instalados**:
  - `@radix-ui/react-checkbox` ^1.3.2
  - `@radix-ui/react-collapsible` ^1.1.12
  - `@radix-ui/react-dialog` ^1.1.15
  - `@radix-ui/react-label` ^2.1.7
  - `@radix-ui/react-popover` ^1.1.15
  - `@radix-ui/react-scroll-area` ^1.2.10
  - `@radix-ui/react-select` ^2.2.5
  - `@radix-ui/react-slot` ^1.2.4
  - `@radix-ui/react-tabs` ^1.1.13
- **Razón de elección**: Base sólida para shadcn/ui, accesible y WAI-ARIA compliant

### Lucide React 0.294.0
- **Tipo**: Biblioteca de iconos
- **Características**:
  - Iconos SVG optimizados
  - Tree-shakeable
  - Consistencia visual
- **Iconos usados**: ShoppingCart, Package, TrendingUp, Eye, Calendar, etc.

### Class Variance Authority (CVA) 0.7.1
- **Tipo**: Utility para manejar variantes de componentes
- **Uso**: Definir estilos condicionales en componentes UI
- **Ejemplo**:
```typescript
const buttonVariants = cva("base-styles", {
  variants: {
    variant: {
      default: "...",
      outline: "...",
    }
  }
})
```

### clsx 2.1.1 & tailwind-merge 2.6.0
- **clsx**: Utility para construir classNames condicionalmente
- **tailwind-merge**: Merge inteligente de clases Tailwind sin conflictos
- **Uso combinado**: Helper `cn()` en `lib/utils.ts`

## 🔥 Backend & Database

### Firebase 9.23.0
- **Tipo**: Backend as a Service (BaaS)
- **Servicios utilizados**:
  - **Firestore**: Base de datos NoSQL en tiempo real
  - **Authentication**: Gestión de usuarios
  - **Storage**: Almacenamiento de archivos (imágenes de productos)
  - **Hosting**: Deploy de la aplicación
- **Razón de elección**: Escalable, tiempo real, fácil integración

### Firebase Admin 13.6.0
- **Tipo**: SDK de Firebase para servidor
- **Uso**:
  - Operaciones privilegiadas en server-side
  - Gestión de usuarios
  - Acceso a datos sin restricciones de seguridad

### ReactFire 4.2.3
- **Tipo**: Hooks de React para Firebase
- **Hooks utilizados**:
  - `useFirestore()` - Acceso a Firestore
  - `useFirebaseApp()` - Acceso a la app de Firebase
  - `useAuth()` - Estado de autenticación
- **Beneficios**: Integración React-Firebase simplificada

## 📋 Formularios & Validación

### React Hook Form 7.57.0
- **Tipo**: Biblioteca para gestión de formularios
- **Características**:
  - Performance optimizado (menos re-renders)
  - Validación built-in
  - Fácil integración con Zod
- **Uso**: Formularios de clientes, productos, pedidos

### Zod 3.25.49
- **Tipo**: Schema validation library
- **Uso**: Validación de datos en formularios
- **Integración**: `@hookform/resolvers` para conectar con React Hook Form

### @hookform/resolvers 5.0.1
- **Tipo**: Adaptadores de validación para React Hook Form
- **Uso**: Conectar Zod con React Hook Form

## 📅 Manejo de Fechas

### date-fns 4.1.0
- **Tipo**: Biblioteca de utilidades para fechas
- **Características**:
  - Modular y tree-shakeable
  - Funciones puras
  - Soporte de i18n
- **Uso**: Formateo de fechas, cálculos de tiempo, comparaciones

### React Day Picker 9.7.0
- **Tipo**: Componente date picker para React
- **Uso**: Selección de fechas en formularios y filtros

## 🗺️ Mapas

### Leaflet 1.9.4
- **Tipo**: Biblioteca de mapas interactivos
- **Uso**: Visualización de ubicaciones de clientes

### React Leaflet 4.2.1
- **Tipo**: Wrapper de React para Leaflet
- **Componentes**: Map, TileLayer, Marker, Popup

### @types/leaflet 1.9.21
- **Tipo**: Definiciones de TypeScript para Leaflet

## 📄 Generación de Documentos

### jsPDF 3.0.1
- **Tipo**: Generador de PDFs en JavaScript
- **Uso**: Generación de cotizaciones, facturas, reportes

### jsPDF AutoTable 5.0.2
- **Tipo**: Plugin de jsPDF para tablas
- **Uso**: Tablas en PDFs de reportes

### html2canvas 1.4.1
- **Tipo**: Captura de screenshots de HTML
- **Uso**: Captura de vistas para incluir en PDFs

### XLSX 0.18.5
- **Tipo**: Biblioteca para leer/escribir archivos Excel
- **Uso**: Exportación de datos a Excel (clientes, productos, reportes)

## 🍪 Gestión de Estado & Cookies

### js-cookie 3.0.5
- **Tipo**: API simple para manejar cookies
- **Uso**: Persistencia de sesión, preferencias de usuario

### @types/js-cookie 3.0.6
- **Tipo**: Definiciones TypeScript para js-cookie

## 🎪 Carruseles & Sliders

### Embla Carousel React 8.6.0
- **Tipo**: Biblioteca de carrusel ligera
- **Características**:
  - Performance optimizado
  - Touch/swipe support
  - Personalizable
- **Uso**: Carruseles de imágenes en productos

## 🔔 Notificaciones

### Sonner 2.0.5
- **Tipo**: Biblioteca de toast notifications
- **Características**:
  - Diseño moderno
  - Personalizable
  - Stacking automático
- **Uso**: Feedback de acciones del usuario (éxito, error, info)

## 🛠️ Utilidades & Helpers

### encoding 0.1.13
- **Tipo**: Conversión de encoding de texto
- **Uso**: Manejo de diferentes encodings en datos importados

### clsx & tailwind-merge
- **Uso combinado**: Helper `cn()` para merge de clases Tailwind

## 🧪 Development Dependencies

### @types/node 24.10.1
- **Tipo**: Definiciones TypeScript para Node.js

### @types/react 18.2.0
- **Tipo**: Definiciones TypeScript para React

### @types/react-dom 18.2.0
- **Tipo**: Definiciones TypeScript para React DOM

### ts-node 10.9.2
- **Tipo**: Ejecución de TypeScript en Node.js
- **Uso**: Scripts de desarrollo

### ESLint 8.56.0 & eslint-config-next 13.4.19
- **Tipo**: Linter y configuración para Next.js
- **Uso**: Mantener código limpio y consistente

### tw-animate-css 1.3.3
- **Tipo**: Utilidades de animación para Tailwind
- **Dev only**: No usado en producción actual

## 📦 Gestor de Paquetes

### npm
- **Versión mínima requerida**: 8+
- **Scripts disponibles**:
  - `npm run dev` - Desarrollo
  - `npm run build` - Build producción
  - `npm run start` - Servidor producción
  - `npm run lint` - Linting
  - `npm run deploy` - Deploy a Firebase

## 🚀 Deploy & Hosting

### Vercel (Recomendado)
- **Características**:
  - Deploy automático desde Git
  - Preview deployments
  - Edge Network global
  - Optimizaciones automáticas

### Firebase Hosting (Alternativo)
- **Comando**: `npm run deploy`
- **Características**:
  - CDN global
  - SSL gratuito
  - Rollback de versiones

## 🔧 Configuración de Build

### PostCSS 8.4.32
- **Tipo**: Transformador de CSS
- **Plugins**: Autoprefixer

### Autoprefixer 10.4.16
- **Tipo**: Plugin de PostCSS
- **Uso**: Agregar prefijos de navegador automáticamente

## 📊 Resumen de Dependencias

**Total de dependencias de producción**: 45
**Total de dependencias de desarrollo**: 4
**Tamaño aproximado de node_modules**: ~500MB

## 🔄 Actualizaciones

Para mantener las dependencias actualizadas:

```bash
# Ver paquetes desactualizados
npm outdated

# Actualizar dependencias menores
npm update

# Actualizar a versiones mayores (con precaución)
npm install <package>@latest
```

## ⚠️ Notas Importantes

1. **Next.js 13.4.19**: Versión estable con App Router. Considerar actualizar a Next.js 14+ en el futuro.
2. **React 18**: Concurrent features habilitadas por defecto.
3. **Firebase 9**: Modular SDK, importar solo lo necesario.
4. **TypeScript strict mode**: Recomendado mantener habilitado.

---

**Última actualización**: Enero 2026

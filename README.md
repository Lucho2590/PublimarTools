# PublimarTools - Sistema de Gestión CRM

> Sistema integral de gestión para Publimar - Especialistas en banderas y productos publicitarios

## 📋 Descripción

PublimarTools es un CRM completo desarrollado en Next.js que permite gestionar clientes, productos, pedidos y análisis de la tienda online BanderasMDP. Incluye un dashboard administrativo completo con visualización de métricas, gestión de e-commerce y análisis de comportamiento del usuario.

## 🚀 Características Principales

- **Gestión de Clientes**: CRUD completo de clientes con historial de pedidos
- **Gestión de Productos**: Administración de catálogo con variantes, precios y stock
- **E-commerce Dashboard**:
  - Visualización de pedidos en tiempo real
  - Gestión de carritos abandonados
  - Sistema de recuperación por WhatsApp
  - Analytics avanzado de conversión
- **Sistema de Analytics**:
  - Embudo de conversión (View → Cart → Checkout → Purchase)
  - Top productos más vistos
  - Búsquedas sin resultados
  - Métricas de comportamiento del usuario
- **Notificaciones en tiempo real**: Badges para pedidos y carritos no vistos
- **Integración con WhatsApp**: Comunicación directa con clientes

## 🛠️ Stack Tecnológico

- **Framework**: Next.js 15.1.6 (App Router)
- **Lenguaje**: TypeScript
- **UI**: React 19.0.0
- **Styling**: Tailwind CSS
- **Base de datos**: Firebase Firestore
- **Autenticación**: Firebase Auth
- **Componentes UI**: shadcn/ui + Radix UI
- **Gestión de Estado**: React Context API
- **Deploy**: Vercel

## 📚 Documentación

La documentación completa está organizada en la carpeta `docs/`:

- [📖 Stack Tecnológico](./docs/TECNOLOGIAS.md) - Detalle de todas las tecnologías y bibliotecas
- [🏗️ Arquitectura](./docs/ARQUITECTURA.md) - Estructura del proyecto y organización de archivos
- [🔄 Flujos de Aplicación](./docs/FLUJOS.md) - Diagramas y explicación de flujos principales
- [🛒 Sistema de Tienda Online](./docs/TIENDA_ONLINE.md) - Gestión de pedidos y carritos abandonados
- [📊 Sistema de Analytics](./docs/ANALYTICS.md) - Tracking y análisis de métricas
- [🔥 Firebase](./docs/FIREBASE.md) - Configuración, colecciones y reglas de seguridad

## 🚦 Inicio Rápido

### Prerrequisitos

- Node.js 18+
- pnpm 9+
- Cuenta de Firebase

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/Lucho2590/PublimarTools.git

# Instalar dependencias
cd publimarTools
pnpm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales de Firebase

# Ejecutar en desarrollo
pnpm dev
```

El proyecto estará disponible en `http://localhost:3000`

### Variables de Entorno

Crear un archivo `.env.local` con las siguientes variables:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

## 📦 Scripts Disponibles

```bash
pnpm dev             # Desarrollo
pnpm build           # Build para producción
pnpm start           # Ejecutar build de producción
pnpm lint            # Linting con ESLint
```

## 🔐 Autenticación

El sistema utiliza Firebase Authentication con los siguientes métodos:
- Email/Password
- Google OAuth (opcional)

## 🗃️ Base de Datos

Firestore con las siguientes colecciones principales:
- `clients` - Clientes
- `products` - Productos del catálogo
- `ecommerceOrders` - Pedidos de la tienda online
- `abandonedCarts` - Carritos abandonados
- `productAnalytics` - Analytics agregados de productos
- `productViewEvents` - Eventos individuales de vistas
- `searchQueries` - Búsquedas realizadas
- `conversionFunnels` - Embudos de conversión por sesión

## 🤝 Integración con BanderasMDP

PublimarTools funciona como backend administrativo para [BanderasMDP](https://banderasmdp.com), la tienda online pública. Los datos fluyen de la siguiente manera:

```
BanderasMDP (Tienda) → Firebase → PublimarTools (Admin)
```

- Los clientes navegan y compran en BanderasMDP
- Los datos se guardan en Firebase Firestore
- Los administradores gestionan todo desde PublimarTools

## 👥 Equipo

- **Desarrollador**: Claude Code (AI Assistant)
- **Cliente**: Luciano Martín López

## 📄 Licencia

Proyecto privado - Todos los derechos reservados © 2026 Publimar

## 📞 Contacto

- **WhatsApp**: +54 9 223 541-6600
- **Email**: lopezlucianomartin@gmail.com
- **Sitio Web**: [banderasmdp.com](https://banderasmdp.com)

---

**Última actualización**: Enero 2026

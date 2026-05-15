# 📱 Plan de Implementación Responsive - Publimar Tools

## 📋 Índice

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Análisis de la Arquitectura Actual](#análisis-de-la-arquitectura-actual)
3. [Evaluación de Complejidad](#evaluación-de-complejidad)
4. [Plan de Ejecución Detallado](#plan-de-ejecución-detallado)
5. [Checklist de Testing](#checklist-de-testing)
6. [Criterios de Éxito](#criterios-de-éxito)

---

## 🎯 Resumen Ejecutivo

### Objetivo
Hacer la aplicación Publimar Tools completamente responsive con un drawer mobile que se comporte correctamente, manteniendo toda la funcionalidad existente.

### Nivel de Complejidad
**MEDIO-BAJO** 🟢

### Tiempo Estimado Total
**11-15 horas** de desarrollo + testing

### Estado Actual
- ✅ Componentes shadcn/ui ya instalados (incluido `Sheet` para drawer)
- ✅ Tailwind CSS configurado con breakpoints
- ✅ Estructura modular y limpia
- ❌ Sidebar NO responsive (se mantiene fijo en mobile)
- ❌ Algunas tablas sin scroll horizontal
- ❌ Formularios multi-columna no optimizados para mobile

---

## 🏗️ Análisis de la Arquitectura Actual

### Estructura de Carpetas Principal

```
publimarTools/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # RootLayout global
│   │   ├── page.tsx                  # Home page
│   │   ├── globals.css               # Estilos globales y Tailwind
│   │   ├── ClientProviders.tsx       # Firebase y Auth providers
│   │   ├── login/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   └── publimar/                 # Sección principal
│   │       ├── layout.tsx
│   │       ├── page.tsx              # Dashboard con selección de módulos
│   │       ├── banderas/             # Módulo de Banderas
│   │       │   ├── page.tsx          # Dashboard de Banderas
│   │       │   ├── productos/
│   │       │   ├── clientes/
│   │       │   ├── presupuestos/
│   │       │   ├── ordenes/
│   │       │   ├── ventas/
│   │       │   └── compras/
│   │       ├── viaPublica/           # Módulo Vía Pública
│   │       │   ├── ubicaciones/
│   │       │   ├── compras/
│   │       │   └── salidas/
│   │       ├── administracion/
│   │       └── proveedores/
│   │
│   ├── components/
│   │   ├── layouts/
│   │   │   └── DashboardLayout.tsx   # ⭐ ARCHIVO CRÍTICO - Layout principal
│   │   ├── ui/                       # Componentes shadcn/ui
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── sheet.tsx             # ⭐ Ya disponible para drawer
│   │   │   ├── table.tsx
│   │   │   └── [otros...]
│   │   ├── calendar/
│   │   │   └── CalendarAgenda.tsx    # Componente de agenda/calendario
│   │   └── maps/
│   │       └── MapView.tsx
│   │
│   ├── hooks/                        # ⭐ Aquí se creará useMediaQuery
│   │   ├── useProducts.ts
│   │   ├── useClients.ts
│   │   └── [otros...]
│   │
│   └── types/
│       └── [definiciones TypeScript]
```

### Stack Tecnológico

- **Framework:** Next.js 14 (App Router)
- **UI Library:** shadcn/ui (basado en Radix UI)
- **Styling:** Tailwind CSS v3.3.6
- **Icons:** lucide-react
- **Auth:** Firebase Auth
- **Database:** Firestore
- **Language:** TypeScript
- **Maps:** Leaflet

### Layout Actual (DashboardLayout.tsx)

**Ubicación:** `/src/components/layouts/DashboardLayout.tsx`

**Estructura actual:**
```
┌─────────────────────────────────────────┐
│  [Sidebar Fijo]  │  [Main Content]      │
│  (bg-blue-950)   │  [Header]            │
│                  │  ─────────────────   │
│  - Logo          │                      │
│  - Toggle        │  [Contenido]         │
│  - Nav Items     │  (max-w-7xl)         │
│    · Banderas    │                      │
│      - Productos │                      │
│      - Clientes  │                      │
│      - ...       │                      │
│    · Vía Pública │                      │
│    · Admin       │                      │
│  - Logout        │                      │
└─────────────────────────────────────────┘
```

**Características:**
- Sidebar colapsable: `w-64` (abierto) / `w-25` (cerrado)
- Navegación multinivel con items expandibles
- Estado: `isSidebarOpen` y `expandedItems`
- Colores: `bg-blue-950`, `text-white`, links activos `bg-blue-700`
- **Problema:** Sidebar ocupa espacio fijo incluso en mobile

### Componentes UI Disponibles (shadcn/ui)

| Componente | Estado | Uso en Responsive |
|------------|--------|-------------------|
| `Sheet` | ✅ Instalado | Drawer mobile (CRÍTICO) |
| `Button` | ✅ Instalado | Ya responsive |
| `Card` | ✅ Instalado | Ya responsive |
| `Table` | ✅ Instalado | Necesita scroll horizontal |
| `Form` | ✅ Instalado | Necesita ajustes de grid |
| `Dialog` | ✅ Instalado | Ya responsive |
| `Select` | ✅ Instalado | Ya responsive |
| `Calendar` | ✅ Instalado | Necesita ajustes |

### Breakpoints Tailwind Configurados

```css
sm: 640px   /* Tablets pequeños */
md: 768px   /* Tablets */
lg: 1024px  /* Desktop */
xl: 1280px  /* Desktop grande */
2xl: 1536px /* Desktop XL */
```

**Breakpoint clave para mobile/desktop:** `768px` (md)
- `< 768px` → Mobile (Sheet drawer)
- `≥ 768px` → Desktop (Sidebar fijo)

---

## 📊 Evaluación de Complejidad

### ✅ Ventajas Existentes

1. **Componente Sheet ya instalado**
   - Ubicación: `/src/components/ui/sheet.tsx`
   - Soporta sides: left, right, top, bottom
   - Animaciones incluidas
   - Responsive por defecto

2. **Tailwind CSS configurado**
   - Breakpoints listos
   - Utility classes disponibles
   - Dark mode configurado (no usado)

3. **Estructura modular**
   - Todo el layout en un archivo: `DashboardLayout.tsx`
   - Fácil de refactorizar
   - Componentes bien separados

4. **Estado ya implementado**
   - `isSidebarOpen` se puede reutilizar
   - `expandedItems` para navegación multinivel
   - `usePathname()` para rutas activas

### ⚠️ Desafíos Identificados

1. **Sidebar no responsive**
   - Ancho fijo en todas las pantallas
   - No se oculta en mobile
   - Sin hamburger button

2. **Tablas sin scroll horizontal**
   - Desbordamiento en pantallas pequeñas
   - Archivos afectados:
     - `/src/app/publimar/banderas/productos/page.tsx`
     - `/src/app/publimar/banderas/ventas/page.tsx`
     - `/src/app/publimar/banderas/ordenes/page.tsx`
     - `/src/app/publimar/banderas/clientes/page.tsx`
     - `/src/app/publimar/banderas/presupuestos/page.tsx`

3. **Formularios multi-columna**
   - Layouts de 2-3 columnas en desktop
   - Necesitan colapsar a 1 columna en mobile
   - Inputs necesitan mayor área táctil

4. **Dashboard de Banderas complejo**
   - Grid de 4 columnas para métricas
   - Calendario lateral
   - Tablas de órdenes y presupuestos
   - Archivo: `/src/app/publimar/banderas/page.tsx`

5. **CalendarAgenda component**
   - Calendario grande
   - Lista de eventos
   - Archivo: `/src/components/calendar/CalendarAgenda.tsx`

### Estimación de Tiempo por Tarea

| Fase | Tareas | Tiempo | Dificultad |
|------|--------|--------|------------|
| Infraestructura | useMediaQuery hook | 30 min | Baja |
| Layout Principal | DashboardLayout + Sidebar UX | 3-4h | Media |
| Dashboards | Banderas + Principal | 2h | Media |
| Tablas | Scroll horizontal | 1-2h | Baja |
| Formularios | Grid responsive | 1-2h | Baja |
| Componentes | Calendar + MapView | 2.5h | Media |
| Testing | QA completo | 1-2h | Baja |
| **TOTAL** | **10 tareas** | **11-15h** | **Media-Baja** |

---

## 🚀 Plan de Ejecución Detallado

### FASE 1: Infraestructura Base

#### **Tarea 1: Crear hook useMediaQuery**

**Objetivo:** Hook reutilizable para detectar breakpoints

**Ubicación:** `/src/hooks/useMediaQuery.ts`

**Implementación:**

```typescript
'use client'

import { useState, useEffect } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)

    // Set initial value
    setMatches(media.matches)

    // Create listener
    const listener = (e: MediaQueryListEvent) => {
      setMatches(e.matches)
    }

    // Add listener
    media.addEventListener('change', listener)

    // Cleanup
    return () => media.removeEventListener('change', listener)
  }, [query])

  return matches
}
```

**Uso:**
```typescript
const isMobile = useMediaQuery('(max-width: 768px)')
const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1024px)')
const isDesktop = useMediaQuery('(min-width: 1024px)')
```

**Testing:**
- Verificar que detecta cambios de viewport
- Probar en resize de ventana
- Validar SSR (debe usar 'use client')

**Tiempo:** 30 minutos
**Prioridad:** ALTA ⭐
**Archivos creados:** 1

---

### FASE 2: Layout Principal (CRÍTICO)

#### **Tarea 2: Refactorizar DashboardLayout.tsx**

**Objetivo:** Implementar drawer mobile con Sheet

**Ubicación:** `/src/components/layouts/DashboardLayout.tsx`

**Cambios necesarios:**

1. **Importar dependencias:**
```typescript
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Menu } from 'lucide-react' // Hamburger icon
```

2. **Detectar viewport:**
```typescript
const isMobile = useMediaQuery('(max-width: 768px)')
```

3. **Estructura condicional:**

```typescript
export default function DashboardLayout({ children }: Props) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const pathname = usePathname()
  const isMobile = useMediaQuery('(max-width: 768px)')

  // Función para renderizar contenido del sidebar (reutilizable)
  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-4 border-b border-blue-800">
        {/* ... */}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        {/* ... todos los nav items ... */}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-blue-800">
        {/* ... */}
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-blue-100">
      {/* MOBILE: Sheet Drawer */}
      {isMobile ? (
        <>
          {/* Hamburger Button */}
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="fixed top-4 left-4 z-50 p-2 bg-blue-950 text-white rounded-md md:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>

          {/* Drawer */}
          <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
            <SheetContent
              side="left"
              className="w-[280px] bg-blue-950 text-white border-blue-800 p-0"
            >
              <SidebarContent />
            </SheetContent>
          </Sheet>
        </>
      ) : (
        /* DESKTOP: Fixed Sidebar */
        <aside
          className={`${
            isSidebarOpen ? 'w-64' : 'w-20'
          } bg-blue-950 text-white flex flex-col transition-all duration-300`}
        >
          <SidebarContent />
        </aside>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className={`bg-white shadow-sm h-16 flex items-center justify-between px-4 ${isMobile ? 'pl-16' : ''}`}>
          {/* ... */}
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
```

**Puntos clave:**

- ✅ Extraer contenido del sidebar a componente `SidebarContent` (DRY)
- ✅ Hamburger button solo visible en mobile
- ✅ Sheet con `side="left"` y ancho `w-[280px]`
- ✅ Mantener mismo estilo: `bg-blue-950 text-white`
- ✅ Auto-cerrar drawer al navegar (agregar efecto con `pathname`)
- ✅ Header ajustado con padding-left cuando hay hamburger

**Auto-cerrar drawer al cambiar ruta:**
```typescript
useEffect(() => {
  if (isMobile) {
    setIsSidebarOpen(false)
  }
}, [pathname, isMobile])
```

**Testing:**
- [ ] Drawer abre/cierra en mobile
- [ ] Sidebar fijo funciona en desktop
- [ ] Navegación multinivel funciona en ambos
- [ ] Auto-cierre al navegar
- [ ] Transiciones suaves

**Tiempo:** 2-3 horas
**Prioridad:** CRÍTICA 🔴
**Archivos modificados:** 1

---

#### **Tarea 3: Optimizar sidebar navigation para mobile**

**Objetivo:** Mejorar UX táctil y visualización

**Ubicación:** `/src/components/layouts/DashboardLayout.tsx`

**Mejoras específicas:**

1. **Aumentar área táctil:**
```typescript
// Antes
className="flex items-center gap-3 px-3 py-2"

// Después (mobile)
className={`flex items-center gap-3 px-3 ${isMobile ? 'py-3' : 'py-2'}`}
```

2. **Iconos más grandes en mobile:**
```typescript
<Flag className={isMobile ? "h-6 w-6" : "h-5 w-5"} />
```

3. **Mejor feedback táctil:**
```typescript
className="... active:bg-blue-600 transition-colors duration-150"
```

4. **Scroll suave:**
```typescript
<nav className="flex-1 overflow-y-auto p-4 scroll-smooth">
```

5. **Espaciado generoso:**
```typescript
<div className="space-y-1"> {/* Entre items */}
  <div className="space-y-0.5"> {/* Entre subitems */}
```

**Testing:**
- [ ] Botones fáciles de presionar (44px height mínimo)
- [ ] Iconos claramente visibles
- [ ] Feedback visual inmediato al tap
- [ ] Scroll fluido en listas largas

**Tiempo:** 1 hora
**Prioridad:** ALTA ⭐
**Archivos modificados:** 1

---

### FASE 3: Dashboards

#### **Tarea 4: Dashboard de Banderas responsive**

**Objetivo:** Adaptar métricas y calendario a mobile

**Ubicación:** `/src/app/publimar/banderas/page.tsx`

**Layout actual:**
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  {/* 4 metric cards */}
</div>

<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2">
    {/* Tablas */}
  </div>
  <div>
    {/* Calendario */}
  </div>
</div>
```

**Cambios necesarios:**

1. **Métricas ya responsive:** ✅ (mantener)

2. **Layout calendario:**
```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2 space-y-6">
    {/* Tabla Órdenes */}
    <Card>
      <CardHeader>...</CardHeader>
      <CardContent>
        <div className="overflow-x-auto"> {/* Agregar wrapper */}
          <Table className="min-w-[640px]"> {/* Ancho mínimo */}
            {/* ... */}
          </Table>
        </div>
      </CardContent>
    </Card>

    {/* Tabla Presupuestos */}
    <Card>
      <CardContent>
        <div className="overflow-x-auto"> {/* Agregar wrapper */}
          <Table className="min-w-[640px]">
            {/* ... */}
          </Table>
        </div>
      </CardContent>
    </Card>
  </div>

  {/* Calendario - Abajo en mobile, lado derecho en desktop */}
  <div className="lg:col-span-1">
    <CalendarAgenda />
  </div>
</div>
```

3. **Reducir padding en cards mobile:**
```tsx
<CardContent className="p-4 md:p-6">
```

4. **Métricas clickeables más grandes:**
```tsx
<Card className="cursor-pointer hover:shadow-md active:scale-95 transition-all">
```

**Testing:**
- [ ] Métricas stack verticalmente en mobile
- [ ] Tablas scrolleables horizontalmente
- [ ] Calendario visible abajo en mobile
- [ ] Layout 3 columnas en desktop

**Tiempo:** 1.5 horas
**Prioridad:** ALTA ⭐
**Archivos modificados:** 1

---

#### **Tarea 5: Dashboard principal responsive**

**Objetivo:** Adaptar cards de módulos

**Ubicación:** `/src/app/publimar/page.tsx`

**Cambios:**

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
  {/* Cards de Banderas, Administración, Vía Pública */}
  <Card className="... hover:shadow-2xl active:scale-95 transition-all">
    {/* ... */}
  </Card>
</div>
```

**Ajustes mobile:**
- Cards full-width en mobile
- Iconos proporcionados: `h-16 w-16 md:h-20 md:w-20`
- Padding interno: `p-6 md:p-8`
- Texto más legible: `text-xl md:text-2xl`

**Testing:**
- [ ] Cards stack verticalmente en mobile
- [ ] 2 columnas en tablet
- [ ] 3 columnas en desktop
- [ ] Hover/active states funcionan

**Tiempo:** 30 minutos
**Prioridad:** MEDIA 🟡
**Archivos modificados:** 1

---

### FASE 4: Tablas

#### **Tarea 6: Ajustar tablas con scroll horizontal**

**Objetivo:** Todas las tablas navegables en mobile

**Archivos a modificar:**

1. `/src/app/publimar/banderas/productos/page.tsx`
2. `/src/app/publimar/banderas/ventas/page.tsx`
3. `/src/app/publimar/banderas/ordenes/page.tsx`
4. `/src/app/publimar/banderas/clientes/page.tsx`
5. `/src/app/publimar/banderas/presupuestos/page.tsx`

**Patrón a aplicar:**

```tsx
{/* ANTES */}
<Table>
  <TableHeader>...</TableHeader>
  <TableBody>...</TableBody>
</Table>

{/* DESPUÉS */}
<div className="overflow-x-auto -mx-4 md:mx-0"> {/* Wrapper scroll */}
  <div className="inline-block min-w-full align-middle">
    <div className="overflow-hidden">
      <Table className="min-w-[640px]"> {/* Ancho mínimo según columnas */}
        <TableHeader>...</TableHeader>
        <TableBody>...</TableBody>
      </Table>
    </div>
  </div>
</div>
```

**Mejoras adicionales:**

1. **Indicador de scroll:**
```tsx
<div className="relative">
  <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-blue-500">
    {/* Table */}
  </div>
  {/* Opcional: Sombra indicando más contenido */}
  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none md:hidden" />
</div>
```

2. **Reducir padding en celdas mobile:**
```tsx
<TableCell className="px-2 py-3 md:px-4 md:py-4">
```

3. **Sticky header (opcional):**
```tsx
<TableHeader className="sticky top-0 bg-white z-10">
```

**Anchos mínimos recomendados por tabla:**

| Tabla | min-w | Razón |
|-------|-------|-------|
| Productos | `min-w-[800px]` | 6+ columnas (Nombre, Variantes, Stock, Precio, Acciones) |
| Ventas | `min-w-[900px]` | 7+ columnas (Fecha, Cliente, Items, Total, Estado, etc.) |
| Órdenes | `min-w-[850px]` | 6+ columnas |
| Clientes | `min-w-[700px]` | 5 columnas |
| Presupuestos | `min-w-[800px]` | 6 columnas |

**Testing:**
- [ ] Scroll horizontal suave
- [ ] Todas las columnas visibles con scroll
- [ ] Header sticky funciona (si se implementa)
- [ ] No rompe layout en desktop

**Tiempo:** 1-2 horas
**Prioridad:** ALTA ⭐
**Archivos modificados:** 5

---

### FASE 5: Formularios

#### **Tarea 7: Optimizar formularios para mobile**

**Objetivo:** Layouts de 1 columna en mobile, mejor UX táctil

**Archivos a modificar:**

1. `/src/app/publimar/banderas/clientes/nuevo/page.tsx`
2. `/src/app/publimar/banderas/clientes/[id]/editar/page.tsx`
3. `/src/app/publimar/banderas/productos/nuevo/page.tsx`
4. `/src/app/publimar/banderas/presupuestos/nuevo/page.tsx`
5. `/src/app/publimar/banderas/ventas/nueva/page.tsx`

**Patrón responsive:**

```tsx
{/* ANTES */}
<div className="grid grid-cols-2 gap-4">
  <div>
    <Label>Campo 1</Label>
    <Input />
  </div>
  <div>
    <Label>Campo 2</Label>
    <Input />
  </div>
</div>

{/* DESPUÉS */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div>
    <Label className="text-sm md:text-base">Campo 1</Label>
    <Input className="h-11 md:h-10" /> {/* Mayor altura en mobile */}
  </div>
  <div>
    <Label className="text-sm md:text-base">Campo 2</Label>
    <Input className="h-11 md:h-10" />
  </div>
</div>
```

**Mejoras específicas:**

1. **Inputs más grandes (táctiles):**
```tsx
<Input className="h-11 text-base" /> {/* 44px mínimo */}
<Textarea className="min-h-[88px]" /> {/* 2x altura mínima */}
```

2. **Labels más visibles:**
```tsx
<Label className="text-sm font-medium mb-2 block">
```

3. **Spacing entre campos:**
```tsx
<div className="space-y-4 md:space-y-6">
```

4. **Botones full-width en mobile:**
```tsx
<Button className="w-full md:w-auto">
  Guardar
</Button>
```

5. **Select/Combobox más altos:**
```tsx
<Select>
  <SelectTrigger className="h-11 md:h-10">
```

**Formularios complejos (Presupuestos/Ventas):**

```tsx
{/* Sección Items/Productos */}
<div className="space-y-3">
  {items.map((item, index) => (
    <div
      key={index}
      className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end"
    >
      <div>
        <Label>Producto</Label>
        <Select>...</Select>
      </div>
      <div>
        <Label>Cantidad</Label>
        <Input type="number" className="h-11" />
      </div>
      <div>
        <Label>Precio</Label>
        <Input type="number" className="h-11" />
      </div>
      <Button
        variant="destructive"
        className="h-11 w-full md:w-auto"
      >
        <Trash2 />
      </Button>
    </div>
  ))}
</div>
```

**Testing:**
- [ ] Campos en 1 columna en mobile
- [ ] Inputs fáciles de tocar (44px+)
- [ ] Labels legibles
- [ ] Botones accesibles
- [ ] Validación funciona
- [ ] Forms complejos navegables

**Tiempo:** 1-2 horas
**Prioridad:** ALTA ⭐
**Archivos modificados:** 5+

---

### FASE 6: Componentes Especiales

#### **Tarea 8: CalendarAgenda component responsive**

**Objetivo:** Calendario navegable en mobile

**Ubicación:** `/src/components/calendar/CalendarAgenda.tsx`

**Estrategia:**

1. **Toggle vista calendario/lista en mobile:**

```tsx
'use client'

import { useState } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Calendar, List } from 'lucide-react'

export function CalendarAgenda() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [view, setView] = useState<'calendar' | 'list'>('list') // Default lista en mobile

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Agenda</CardTitle>

          {/* Toggle solo en mobile */}
          {isMobile && (
            <div className="flex gap-2">
              <Button
                variant={view === 'calendar' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('calendar')}
              >
                <Calendar className="h-4 w-4" />
              </Button>
              <Button
                variant={view === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Calendario */}
        {(view === 'calendar' || !isMobile) && (
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            className={isMobile ? 'scale-90' : ''}
          />
        )}

        {/* Lista de eventos */}
        <div className={view === 'list' || !isMobile ? 'block' : 'hidden'}>
          <div className="space-y-2 mt-4">
            {events.map(event => (
              <div
                key={event.id}
                className="p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <p className="font-medium text-sm">{event.title}</p>
                <p className="text-xs text-gray-600">{event.date}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

2. **Calendario más compacto:**
```tsx
<Calendar
  className={cn(
    "p-0",
    isMobile && "text-sm [&_td]:p-1 [&_th]:p-1"
  )}
/>
```

3. **DateRangePicker responsive:**
```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button className="w-full md:w-auto justify-start">
      {/* ... */}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0" align={isMobile ? "center" : "start"}>
    <Calendar mode="range" />
  </PopoverContent>
</Popover>
```

**Testing:**
- [ ] Toggle funciona en mobile
- [ ] Vista lista por defecto en mobile
- [ ] Calendario legible cuando se selecciona
- [ ] Eventos clickeables
- [ ] Transiciones suaves

**Tiempo:** 1.5 horas
**Prioridad:** MEDIA 🟡
**Archivos modificados:** 1

---

#### **Tarea 9: MapView (Leaflet) responsive**

**Objetivo:** Mapa touch-friendly y adaptativo

**Ubicación:** `/src/components/maps/MapView.tsx`

**Cambios:**

1. **Altura adaptativa:**
```tsx
<div
  className="h-64 md:h-96 lg:h-[500px] w-full rounded-lg overflow-hidden"
  id="map"
>
```

2. **Touch gestures:**
```tsx
// En opciones de Leaflet
const mapOptions = {
  touchZoom: true,
  scrollWheelZoom: false, // Deshabilitar en mobile por UX
  tap: true,
  tapTolerance: 15, // Área táctil generosa
  dragging: true,
}
```

3. **Controles más grandes en mobile:**
```tsx
useEffect(() => {
  const map = L.map('map', mapOptions)

  // Zoom control custom
  if (isMobile) {
    L.control.zoom({
      position: 'bottomright',
      zoomInTitle: 'Acercar',
      zoomOutTitle: 'Alejar',
    }).addTo(map)
  }
}, [isMobile])
```

4. **Popups optimizados:**
```tsx
marker.bindPopup(`
  <div class="p-2 text-sm md:text-base">
    <h3 class="font-bold">${title}</h3>
    <p class="text-xs md:text-sm">${description}</p>
  </div>
`, {
  maxWidth: isMobile ? 200 : 300,
  minWidth: isMobile ? 150 : 200,
})
```

**Testing:**
- [ ] Mapa se redimensiona correctamente
- [ ] Touch gestures funcionan
- [ ] Zoom con botones accesible
- [ ] Popups legibles
- [ ] Performance fluida

**Tiempo:** 1 hora
**Prioridad:** BAJA 🟢
**Archivos modificados:** 1

---

### FASE 7: Testing y QA

#### **Tarea 10: Testing responsive completo**

**Objetivo:** Verificar funcionamiento en todos los breakpoints

**Dispositivos/Breakpoints:**

| Dispositivo | Ancho | Breakpoint |
|-------------|-------|------------|
| iPhone SE | 320px | Mobile S |
| iPhone 12/13 | 375px | Mobile M |
| iPhone 14 Pro Max | 428px | Mobile L |
| iPad Mini | 768px | Tablet |
| iPad Pro | 1024px | Desktop |
| Desktop | 1280px+ | Desktop L |

**Checklist por Página:**

##### ✅ Login (`/login`)
- [ ] Formulario centrado en mobile
- [ ] Inputs táctiles (44px+)
- [ ] Logo visible
- [ ] Botón full-width

##### ✅ Dashboard Principal (`/publimar`)
- [ ] Cards stack verticalmente en mobile
- [ ] 2 columnas en tablet
- [ ] 3 columnas en desktop
- [ ] Iconos proporcionados
- [ ] Hover/active states

##### ✅ DashboardLayout (Todas las rutas `/publimar/*`)
- [ ] Drawer abre/cierra en mobile
- [ ] Hamburger button visible y accesible
- [ ] Sidebar fijo en desktop
- [ ] Auto-cierre al navegar (mobile)
- [ ] Navegación multinivel funciona
- [ ] Items expandibles funcionan
- [ ] Transiciones suaves
- [ ] No scroll horizontal inesperado
- [ ] Header ajustado (padding con hamburger)

##### ✅ Dashboard Banderas (`/publimar/banderas`)
- [ ] Métricas en 1 columna (mobile)
- [ ] Métricas en 2 columnas (tablet)
- [ ] Métricas en 4 columnas (desktop)
- [ ] Tablas con scroll horizontal
- [ ] Calendario debajo en mobile
- [ ] Calendario al lado en desktop
- [ ] Cards clickeables táctiles

##### ✅ Productos (`/publimar/banderas/productos`)
- [ ] Tabla scrolleable horizontalmente
- [ ] Botón "Nuevo" accesible
- [ ] Búsqueda/filtros usables
- [ ] Acciones (editar/eliminar) táctiles

##### ✅ Clientes (`/publimar/banderas/clientes`)
- [ ] Lista responsive
- [ ] Formulario nuevo cliente 1 columna (mobile)
- [ ] Formulario editar cliente responsive
- [ ] Inputs táctiles
- [ ] Botones accesibles

##### ✅ Presupuestos (`/publimar/banderas/presupuestos`)
- [ ] Tabla scrolleable
- [ ] Formulario nuevo presupuesto responsive
- [ ] Items/productos en grid adaptativo
- [ ] Total visible siempre
- [ ] PDF preview funciona

##### ✅ Órdenes (`/publimar/banderas/ordenes`)
- [ ] Tabla scrolleable
- [ ] Filtros responsive
- [ ] Detalle orden legible
- [ ] Estados visibles

##### ✅ Ventas (`/publimar/banderas/ventas`)
- [ ] Tabla scrolleable
- [ ] Formulario nueva venta responsive
- [ ] Calendario fecha adaptativo
- [ ] Selección cliente/productos táctil

##### ✅ Vía Pública
- [ ] Ubicaciones - MapView responsive
- [ ] Tabla ubicaciones scrolleable
- [ ] Formularios adaptativos

**Herramientas de Testing:**

1. **Chrome DevTools:**
```
- Abrir DevTools (F12)
- Toggle Device Toolbar (Ctrl+Shift+M)
- Probar cada breakpoint
- Usar Network Throttling para simular 3G
```

2. **Firefox Responsive Design Mode:**
```
- Ctrl+Shift+M
- Probar diferentes dispositivos
```

3. **Real Device Testing:**
```
- iPhone (iOS Safari)
- Android (Chrome)
- iPad (Safari)
```

4. **Lighthouse Audit:**
```bash
# En Chrome DevTools > Lighthouse
- Seleccionar "Mobile"
- Ejecutar audit
- Objetivo: Performance > 90, Accessibility > 95
```

**Issues Comunes a Verificar:**

- [ ] Sin scroll horizontal en body
- [ ] Imágenes no desbordadas
- [ ] Texto legible (min 16px en mobile)
- [ ] Botones presionables (min 44x44px)
- [ ] Links no muy juntos (min 8px spacing)
- [ ] Modals/Dialogs centrados
- [ ] Toasts/Notifications visibles
- [ ] Loading states claros
- [ ] Error states informativos
- [ ] Forms submitteables en mobile keyboard

**Performance Checks:**

```bash
# Lighthouse CI (opcional)
pnpm add -g @lhci/cli
lhci autorun --collect.url=http://localhost:3000/publimar
```

**Objetivos:**
- Performance: > 90
- Accessibility: > 95
- Best Practices: > 90
- SEO: > 90

**Documentar Issues:**

Crear archivo: `/RESPONSIVE_ISSUES.md`

```markdown
# Issues Encontrados en Testing Responsive

## Críticos 🔴
- [ ] Descripción del issue
  - Dispositivo/breakpoint: iPhone 12 (375px)
  - Página: /publimar/banderas/productos
  - Solución propuesta: ...

## Importantes 🟡
- [ ] ...

## Menores 🟢
- [ ] ...
```

**Tiempo:** 1-2 horas
**Prioridad:** CRÍTICA 🔴
**Archivos:** N/A (testing)

---

## ✅ Checklist de Testing Final

### Funcional
- [ ] Drawer mobile abre/cierra correctamente
- [ ] Navegación funciona en todos los niveles
- [ ] Auto-cierre drawer al navegar
- [ ] Sidebar desktop colapsa/expande
- [ ] Todas las tablas scrolleables
- [ ] Formularios submitteables
- [ ] Botones todos clickeables/táctiles
- [ ] Modals/Dialogs funcionan
- [ ] Calendarios interactivos
- [ ] Mapas touch-friendly

### Visual
- [ ] Sin scroll horizontal inesperado
- [ ] Imágenes/logos escalados correctamente
- [ ] Textos legibles (min 16px)
- [ ] Colores/contrastes apropiados
- [ ] Spacing consistente
- [ ] Alineaciones correctas
- [ ] Iconos proporcionados

### Performance
- [ ] Transiciones suaves (60fps)
- [ ] Sin lag al abrir drawer
- [ ] Tablas cargan rápido
- [ ] Imágenes optimizadas
- [ ] Lighthouse Mobile > 90

### Accesibilidad
- [ ] Botones min 44x44px
- [ ] Labels en todos los inputs
- [ ] Focus states visibles
- [ ] Navegación por teclado
- [ ] Screen reader friendly
- [ ] Contrast ratio WCAG AA

### Cross-browser
- [ ] Chrome mobile
- [ ] Safari iOS
- [ ] Firefox mobile
- [ ] Samsung Internet

---

## 🎯 Criterios de Éxito

Al completar este plan, la aplicación deberá cumplir:

### ✅ Funcionales
1. **Drawer mobile funcional**
   - Abre/cierra con animación suave
   - Auto-cierra al navegar
   - Hamburger button accesible
   - Navegación multinivel funciona

2. **Tablas navegables**
   - Scroll horizontal en todas
   - Sin romper layout
   - Indicadores de más contenido
   - Acciones accesibles

3. **Formularios usables**
   - 1 columna en mobile
   - Inputs táctiles (44px+)
   - Botones accesibles
   - Validación visible

4. **Dashboards adaptativos**
   - Métricas en columnas apropiadas
   - Gráficos/calendarios visibles
   - Cards clickeables
   - Información completa

### ✅ Técnicos
5. **Performance**
   - Lighthouse Mobile Score > 90
   - FCP < 2s
   - LCP < 2.5s
   - CLS < 0.1

6. **Accesibilidad**
   - WCAG AA compliance
   - Lighthouse Accessibility > 95
   - Navegación por teclado
   - Screen reader compatible

7. **Responsive**
   - Breakpoints: 320px, 768px, 1024px
   - Sin scroll horizontal
   - Todos los elementos visibles
   - Touch targets adecuados

### ✅ UX
8. **Mobile-first**
   - Navegación intuitiva
   - Gestos táctiles
   - Feedback visual inmediato
   - Información jerarquizada

9. **Consistencia**
   - Patrones repetibles
   - Estilos uniformes
   - Comportamiento predecible
   - Transiciones coherentes

---

## 📝 Notas de Implementación

### Antes de Empezar

1. **Crear rama feature:**
```bash
git checkout -b feature/responsive-design
git commit -am "checkpoint: antes de implementar responsive"
```

2. **Backup del código:**
```bash
# Opcional: crear tag
git tag backup-before-responsive
```

3. **Instalar dependencias (si falta algo):**
```bash
pnpm install
# Verificar que Sheet esté en components/ui/sheet.tsx
```

### Durante la Implementación

1. **Testing continuo:**
   - Después de cada fase mayor (2, 4, 5), hacer testing parcial
   - Usar Chrome DevTools Device Mode constantemente
   - Probar en dispositivo real al menos 1 vez por día

2. **Commits frecuentes:**
```bash
git add .
git commit -m "feat: implementar useMediaQuery hook"
git commit -m "feat: refactorizar DashboardLayout con drawer mobile"
git commit -m "feat: hacer responsive tablas de productos"
# etc.
```

3. **Documentar cambios:**
   - Actualizar este README con issues encontrados
   - Agregar comentarios en código complejo
   - Screenshoots de antes/después

### Rollback Plan

Si algo falla:

```bash
# Volver a commit específico
git log --oneline
git reset --hard <commit-hash>

# O descartar cambios en archivo
git checkout -- <file-path>

# O volver al backup completo
git checkout backup-before-responsive
```

### Orden Recomendado de Ejecución

```
1. useMediaQuery          ← Base (30min)
   ↓
2. DashboardLayout        ← Crítico (3h)
   ↓
3. Sidebar UX             ← Mejora (1h)
   ↓
4. Tablas                 ← Alto impacto (2h)
   ↓
5. Dashboard Banderas     ← Vista principal (1.5h)
   ↓
6. Formularios            ← Data entry (2h)
   ↓
7. Dashboard principal    ← Navegación (30min)
   ↓
8. CalendarAgenda         ← Feature (1.5h)
   ↓
9. MapView                ← Opcional (1h)
   ↓
10. Testing completo      ← QA (2h)
```

**Total estimado:** 11-15 horas

---

## 🔧 Troubleshooting

### Problemas Comunes

#### 1. Sheet no se importa correctamente
```bash
# Verificar instalación
pnpm dlx shadcn@latest add sheet

# Verificar ruta
# Debe existir: /src/components/ui/sheet.tsx
```

#### 2. useMediaQuery causa hydration mismatch
```typescript
// Solución: Usar 'use client' y estado inicial false
'use client'

const [mounted, setMounted] = useState(false)

useEffect(() => {
  setMounted(true)
}, [])

if (!mounted) return null // o return <Skeleton />
```

#### 3. Drawer no cierra al navegar
```typescript
// Agregar efecto
useEffect(() => {
  if (isMobile && isSidebarOpen) {
    setIsSidebarOpen(false)
  }
}, [pathname])
```

#### 4. Tablas rompen layout en mobile
```tsx
// Asegurar wrapper con overflow
<div className="overflow-x-auto">
  <Table className="min-w-[640px]">
```

#### 5. Formularios no se pueden scrollear en iOS
```css
/* En globals.css agregar */
body {
  -webkit-overflow-scrolling: touch;
}
```

---

## 📚 Recursos Adicionales

### Documentación
- [shadcn/ui Sheet](https://ui.shadcn.com/docs/components/sheet)
- [Tailwind Responsive Design](https://tailwindcss.com/docs/responsive-design)
- [Next.js Layouts](https://nextjs.org/docs/app/building-your-application/routing/pages-and-layouts)
- [MDN Media Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Using_media_queries)

### Testing
- [Chrome DevTools Device Mode](https://developer.chrome.com/docs/devtools/device-mode/)
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [BrowserStack](https://www.browserstack.com/) (testing en dispositivos reales)

### Performance
- [Web Vitals](https://web.dev/vitals/)
- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)

---

## 📞 Contacto y Soporte

Si encuentras problemas durante la implementación:

1. **Revisar este README** primero
2. **Verificar Troubleshooting** section
3. **Consultar documentación** oficial de shadcn/ui y Tailwind
4. **Crear issue** en `/RESPONSIVE_ISSUES.md` con detalles

---

## 📅 Tracking de Progreso

### Estado Actual

- [ ] Fase 1: Infraestructura (0/1)
  - [ ] useMediaQuery hook

- [ ] Fase 2: Layout Principal (0/2)
  - [ ] DashboardLayout refactor
  - [ ] Sidebar UX optimization

- [ ] Fase 3: Dashboards (0/2)
  - [ ] Dashboard Banderas
  - [ ] Dashboard Principal

- [ ] Fase 4: Tablas (0/1)
  - [ ] Scroll horizontal en todas las tablas

- [ ] Fase 5: Formularios (0/1)
  - [ ] Responsive forms

- [ ] Fase 6: Componentes (0/2)
  - [ ] CalendarAgenda
  - [ ] MapView

- [ ] Fase 7: Testing (0/1)
  - [ ] QA completo

### Progreso Total: 0% (0/10 tareas)

---

## 🎉 Conclusión

Este plan proporciona una ruta clara y detallada para hacer Publimar Tools completamente responsive. La implementación es **viable y de complejidad media-baja** gracias a:

- ✅ Componentes shadcn/ui ya disponibles
- ✅ Tailwind CSS configurado
- ✅ Estructura modular limpia
- ✅ Patrones claros a seguir

**Tiempo total estimado:** 11-15 horas

**Resultado esperado:** Aplicación completamente responsive, mobile-first, con excelente UX en todos los dispositivos.

---

**Última actualización:** 2025-11-28
**Versión:** 1.0
**Status:** Listo para implementación


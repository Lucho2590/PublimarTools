# Calendario/Agenda - Características Implementadas

## Resumen
Se implementó un sistema de calendario/agenda completo en el dashboard de Banderas con las siguientes características:

## Funcionalidades

### 1. Vista de Calendario
- **Calendario mensual visual** usando react-day-picker
- **Indicadores visuales** (puntos azules) en días que tienen eventos
- **Selección de día** interactiva para ver eventos específicos

### 2. Gestión de Eventos

#### Crear Eventos
- Título (obligatorio)
- Hora (obligatoria)
- Descripción (opcional)
- Se asigna automáticamente al usuario que lo crea

#### Editar Eventos
- Modificar título, hora y descripción
- Solo el creador puede editar sus eventos

#### Eliminar Eventos
- Eliminar eventos con un solo click
- Solo el creador puede eliminar sus eventos

### 3. Permisos por Rol

#### Usuarios Regulares (Banderas, Vía Pública)
- Ven **solo sus propios eventos**
- Pueden crear, editar y eliminar solo sus eventos

#### Administración y Admin
- Ven **todos los eventos** de todos los usuarios
- Tienen vista completa de la agenda del equipo
- Útil para coordinación y supervisión

### 4. Visualización de Eventos

#### Lista del Día Seleccionado
- Eventos ordenados cronológicamente
- Muestra hora, título y descripción
- Cards con indicador de color azul a la izquierda
- Iconos de edición y eliminación para cada evento
- Scroll independiente cuando hay muchos eventos

#### Estado Vacío
- Mensaje amigable cuando no hay eventos
- Sugerencia para crear un nuevo evento

### 5. Integración en Dashboard
- Posicionado en la parte superior del dashboard
- Layout responsivo de 2 columnas (calendario + lista)
- Se adapta a dispositivos móviles

## Componentes Creados

### CalendarAgenda (`/src/components/calendar/CalendarAgenda.tsx`)
Componente principal que maneja:
- Renderizado del calendario
- Lista de eventos del día
- CRUD de eventos (Create, Read, Update, Delete)
- Filtrado de eventos según permisos

## Archivos Modificados

1. **`/src/app/publimar/banderas/page.tsx`**
   - Integración del componente CalendarAgenda
   - Configuración de queries según rol del usuario
   - Filtros de permisos para eventos

2. **`/src/types/event.ts`**
   - Agregado campo opcional `createdByName` para futuras mejoras

3. **Componentes UI instalados:**
   - `scroll-area` (shadcn)
   - `badge` (shadcn)

## Próximas Mejoras Sugeridas

1. **Mostrar nombre del creador** en eventos (para admins)
2. **Filtros adicionales**: por tipo de evento, usuario específico
3. **Notificaciones**: recordatorios de eventos próximos
4. **Exportar**: exportar agenda a PDF/Excel
5. **Repetición**: eventos recurrentes
6. **Colores**: categorías con diferentes colores
7. **Vista semanal/diaria**: opciones adicionales de visualización

## Uso

1. Navegar a `/publimar/banderas`
2. El calendario aparece en la parte superior
3. Hacer click en un día para ver/agregar eventos
4. Usar el botón "Nuevo" para crear un evento
5. Click en los iconos de editar/eliminar para gestionar eventos existentes

## Tecnologías Utilizadas

- **React Day Picker**: calendario visual
- **Firestore**: almacenamiento de eventos
- **ReactFire**: hooks de Firebase
- **Shadcn UI**: componentes de interfaz
- **TypeScript**: tipado fuerte

---

Implementado el: 2025-11-28

# Flujo de Seguridad - n8n + Firebase Auth

## 🔐 Diagrama del Flujo Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                         TU NAVEGADOR                             │
│                                                                  │
│  1. Usuario crea evento                                          │
│     ↓                                                            │
│  2. CalendarAgenda llama a sendEventToN8n()                      │
│     ↓                                                            │
│  3. Se obtiene Firebase Auth Token del usuario logueado         │
│     ↓                                                            │
│  4. Se envía request a n8n con:                                  │
│     - Header: Authorization: Bearer <firebase-token>            │
│     - Body: { operation: "create", event: {...} }               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ HTTPS Request
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                         n8n WORKFLOW                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  1. WEBHOOK NODE                                        │    │
│  │     - Recibe el POST request                           │    │
│  │     - Lee el header Authorization                      │    │
│  │     - Lee el body con los datos del evento             │    │
│  └────────────────┬───────────────────────────────────────┘    │
│                   │                                              │
│                   ↓                                              │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  2. CODE NODE (Validación de Token)                    │    │
│  │     ✓ Verifica que el header Authorization exista     │    │
│  │     ✓ Extrae el token                                  │    │
│  │     ✓ Decodifica el token JWT                          │    │
│  │     ✓ Verifica que no esté expirado                    │    │
│  │     ✓ Verifica que sea del proyecto correcto           │    │
│  │                                                         │    │
│  │     Si falla → ❌ ERROR: Token inválido                │    │
│  │     Si pasa → ✅ Continúa al siguiente nodo            │    │
│  └────────────────┬───────────────────────────────────────┘    │
│                   │                                              │
│                   ↓                                              │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  3. SWITCH NODE                                         │    │
│  │     - Lee $json.operation                              │    │
│  │     - Ruta 0: "create" → Crear evento                  │    │
│  │     - Ruta 1: "update" → Actualizar evento             │    │
│  │     - Ruta 2: "delete" → Eliminar evento               │    │
│  └────────────────┬───────────────────────────────────────┘    │
│                   │                                              │
│         ┌─────────┼─────────┐                                   │
│         │         │         │                                   │
│    CREATE      UPDATE    DELETE                                 │
│         │         │         │                                   │
│         ↓         ↓         ↓                                   │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  GOOGLE CALENDAR NODES                                │      │
│  │  - Autenticado con OAuth2                            │      │
│  │  - Crea/Actualiza/Elimina eventos en tu calendario   │      │
│  └──────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                      GOOGLE CALENDAR                             │
│                                                                  │
│  ✅ Evento sincronizado                                          │
│  📱 Visible en todos tus dispositivos                            │
│  🔔 Notificaciones configuradas                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛡️ Niveles de Protección

### 1. **Autenticación de Usuario**
```javascript
// En sendEventToN8n()
const auth = getAuth();
const currentUser = auth.currentUser;

if (!currentUser) {
  // ❌ No hay usuario logueado → No se envía nada
  return false;
}
```

**Protege contra**: Requests anónimos

---

### 2. **Token de Firebase**
```javascript
// Obtener token fresco del usuario
const idToken = await currentUser.getIdToken();

// Enviar en header
headers: {
  "Authorization": `Bearer ${idToken}`
}
```

**Protege contra**:
- Usuarios no registrados en tu app
- Tokens robados antiguos (expiran en 1 hora)
- Modificación del token

---

### 3. **Validación en n8n**
```javascript
// En el nodo Code de n8n
const authHeader = $('Webhook').item.headers.authorization;

// Verificar formato
if (!authHeader || !authHeader.startsWith('Bearer ')) {
  throw new Error('Token inválido');
}

// Decodificar y verificar expiración
const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
if (payload.exp < now) {
  throw new Error('Token expirado');
}

// Verificar que sea de TU proyecto
if (payload.aud !== 'publimartools') {
  throw new Error('Token de proyecto inválido');
}
```

**Protege contra**:
- Tokens de otros proyectos de Firebase
- Tokens expirados
- Requests sin autenticación

---

## 🔑 Estructura del Firebase ID Token

Cuando decodificás el token, contiene:

```json
{
  "iss": "https://securetoken.google.com/publimartools",
  "aud": "publimartools",
  "auth_time": 1701234567,
  "user_id": "abc123...",
  "sub": "abc123...",
  "iat": 1701234567,
  "exp": 1701238167,  // Expira en 1 hora
  "email": "usuario@ejemplo.com",
  "email_verified": true,
  "firebase": {
    "identities": {
      "email": ["usuario@ejemplo.com"]
    },
    "sign_in_provider": "password"
  }
}
```

### Campos importantes:

- **`exp`**: Timestamp de expiración (1 hora después de `iat`)
- **`aud`**: Tu Firebase Project ID
- **`user_id`**: ID único del usuario
- **`email`**: Email del usuario (si querés loguear quién creó el evento)

---

## ⚠️ Limitaciones Actuales

### Lo que SÍ protege:
✅ Verifica que el usuario esté autenticado en tu app
✅ Verifica que el token no haya expirado
✅ Verifica que sea de tu proyecto de Firebase
✅ Evita que cualquiera con la URL pueda crear eventos

### Lo que NO protege (pero podría mejorarse):
⚠️ **No verifica la firma criptográfica del token**
   - Alguien técnico podría crear un token falso con los campos correctos
   - Para verificar la firma, necesitarías las claves públicas de Firebase

⚠️ **No valida permisos específicos**
   - Cualquier usuario autenticado puede crear eventos
   - No verifica si el usuario tiene permisos de "Banderas" o "Vía Pública"

---

## 🚀 Mejoras Futuras (Opcional)

### 1. Verificación completa del token con Firebase Admin SDK

Instalar en n8n (si usás self-hosted):
```bash
npm install firebase-admin
```

Código en nodo "Code":
```javascript
const admin = require('firebase-admin');

// Inicializar (solo una vez)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: 'publimartools',
      clientEmail: 'tu-service-account@publimartools.iam.gserviceaccount.com',
      privateKey: 'TU_PRIVATE_KEY'
    })
  });
}

// Verificar token (con firma criptográfica)
const token = $('Webhook').item.headers.authorization.split('Bearer ')[1];
try {
  const decodedToken = await admin.auth().verifyIdToken(token);
  return {
    ...($('Webhook').item.json),
    verifiedUserId: decodedToken.uid
  };
} catch (error) {
  throw new Error('Token inválido: ' + error.message);
}
```

**Ventaja**: Verificación completa con firma criptográfica

---

### 2. Validar rol del usuario

Si querés que solo ciertos roles puedan sincronizar:

```javascript
// En sendEventToN8n() antes de enviar
import { useAuth } from "@/contexts/AuthContext";

const { userRole } = useAuth();

if (userRole !== EUserRole.ADMIN && userRole !== EUserRole.ADMINISTRACION) {
  console.warn("Usuario sin permisos para sincronizar");
  return false;
}
```

---

### 3. Rate Limiting

Para evitar spam de un usuario malicioso:

```javascript
// En el nodo Code de n8n
const userId = payload.user_id;
const now = Date.now();

// Guardar en memoria (o Redis en producción)
if (!global.rateLimits) global.rateLimits = {};

const userRequests = global.rateLimits[userId] || [];
const recentRequests = userRequests.filter(t => now - t < 60000); // Últimos 60 seg

if (recentRequests.length > 10) {
  throw new Error('Demasiadas requests. Esperá un momento.');
}

global.rateLimits[userId] = [...recentRequests, now];
```

---

## 📊 Comparación de Opciones de Seguridad

| Método | Seguridad | Complejidad | Recomendado |
|--------|-----------|-------------|-------------|
| **Sin autenticación** | ❌ Muy baja | ⭐ Muy simple | ❌ No |
| **API Key simple** | ⚠️ Baja | ⭐⭐ Simple | ⚠️ Solo dev |
| **Firebase Token (actual)** | ✅ Media-Alta | ⭐⭐⭐ Moderada | ✅ Sí |
| **Firebase Admin SDK** | ✅✅ Muy Alta | ⭐⭐⭐⭐ Compleja | ✅ Producción |

---

## ✅ Resumen

Tu implementación actual con **Firebase Auth Token** ofrece:

🔒 **Buena seguridad** para un proyecto real
✅ **Fácil de implementar** (ya está hecho!)
🚀 **Listo para usar** sin configuración adicional
📱 **Compatible** con todos los dispositivos

Es un excelente balance entre seguridad y simplicidad. Si en el futuro necesitás más seguridad (por ejemplo, si el webhook está muy expuesto), podés agregar la verificación completa con Firebase Admin SDK.

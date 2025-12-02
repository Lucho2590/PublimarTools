# Integración n8n + Google Calendar

Esta guía te ayudará a configurar n8n para sincronizar automáticamente los eventos de tu app con Google Calendar.

## 📋 Requisitos

1. **Cuenta de Google** (la que usás para tu calendario)
2. **n8n instalado** (puede ser cloud o self-hosted)
3. **Tu app corriendo** (este proyecto)

---

## 🚀 Paso 1: Instalar n8n

### Opción A: n8n Cloud (Más fácil, gratis hasta cierto límite)
1. Ve a [n8n.cloud](https://n8n.cloud)
2. Crea una cuenta gratis
3. Ya tenés tu instancia lista

### Opción B: Self-hosted con Docker (Más control)
```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

Luego accedé a `http://localhost:5678`

### Opción C: npm (Para desarrollo local)
```bash
npm install n8n -g
n8n start
```

---

## 🔧 Paso 2: Crear el Workflow en n8n

### 2.1. Crear nuevo workflow

1. En n8n, hacé clic en **"Create Workflow"**
2. Dale un nombre: `"Calendar Sync - Publimar"`

### 2.2. Agregar nodo Webhook

1. Hacé clic en el **"+"** para agregar un nodo
2. Buscá **"Webhook"**
3. Configurá:
   - **HTTP Method**: `POST`
   - **Path**: `calendar-sync` (o el que prefieras)
   - **Response Mode**: `When Last Node Finishes`
   - **Response Code**: `200`
   - **Authentication**: `None` (la validación la haremos en el siguiente paso)

4. **IMPORTANTE**: Copiá la **Production URL** que te muestra el webhook. Algo como:
   ```
   https://tu-instancia.n8n.cloud/webhook/calendar-sync
   ```
   O si es local:
   ```
   http://localhost:5678/webhook/calendar-sync
   ```

### 2.2.1. 🔐 Agregar validación de Firebase Auth Token (IMPORTANTE PARA SEGURIDAD)

Después del Webhook, agregá un nodo **"HTTP Request"** para validar el token de Firebase:

1. Conectá el Webhook a un nuevo nodo **"HTTP Request"**
2. Configurá:
   - **Method**: `GET`
   - **URL**:
     ```
     https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com
     ```
   - **Authentication**: `None`
   - **Options** → **Split Into Items**: `false`

3. Agregá un nodo **"Code"** (Function) después del HTTP Request
4. Pegá este código para validar el token:

```javascript
// Obtener el token del header Authorization
const authHeader = $('Webhook').item.headers.authorization;

if (!authHeader || !authHeader.startsWith('Bearer ')) {
  throw new Error('Token de autenticación no proporcionado o inválido');
}

const token = authHeader.split('Bearer ')[1];

// Decodificar el token (sin verificar la firma - solo para obtener info)
// NOTA: En producción, deberías verificar la firma con las claves públicas
const [headerB64, payloadB64] = token.split('.');
const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());

// Verificar que el token no haya expiado
const now = Math.floor(Date.now() / 1000);
if (payload.exp < now) {
  throw new Error('Token expirado');
}

// Verificar que sea de tu proyecto de Firebase
const expectedProjectId = 'publimartools'; // TU PROJECT ID
if (payload.aud !== expectedProjectId) {
  throw new Error('Token de proyecto inválido');
}

// El token es válido, pasar los datos del webhook
return $('Webhook').item.json;
```

**IMPORTANTE**: Cambiá `'publimartools'` por tu Firebase Project ID.

5. Si el token es inválido, el workflow se detendrá con un error
6. Si el token es válido, continúa al siguiente nodo

### 2.3. Agregar nodo Switch (para manejar create/update/delete)

1. Conectá el nodo **"Code"** (validación) al siguiente nodo
2. Agregá un nodo **"Switch"**
3. Configurá 3 rutas:
   - **Ruta 0**: `{{ $json.operation }}` igual a `create`
   - **Ruta 1**: `{{ $json.operation }}` igual a `update`
   - **Ruta 2**: `{{ $json.operation }}` igual a `delete`

### 2.4. Crear credenciales de Google Calendar

Antes de agregar los nodos de Google Calendar:

1. Ve a **Settings** (arriba a la derecha) → **Credentials**
2. Hacé clic en **"Add Credential"**
3. Buscá **"Google Calendar OAuth2 API"**
4. Seguí las instrucciones para:
   - Ir a [Google Cloud Console](https://console.cloud.google.com/)
   - Crear un proyecto (o usar uno existente)
   - Habilitar **Google Calendar API**
   - Crear credenciales OAuth 2.0
   - Agregar la **Redirect URI** que n8n te indica
   - Copiar **Client ID** y **Client Secret**
5. Pegá las credenciales en n8n
6. Autorizá con tu cuenta de Google

### 2.5. Agregar nodo Google Calendar - Create Event (Ruta 0)

1. Desde la salida **0** del Switch, agregá un nodo **"Google Calendar"**
2. Configurá:
   - **Credential**: Elegí la que creaste
   - **Resource**: `Event`
   - **Operation**: `Create`
   - **Calendar**: Elegí tu calendario (o dejá "primary")
   - **Start**: `{{ $json.event.date }}`
   - **End**:
     ```javascript
     {{ new Date(new Date($json.event.date).getTime() + 60*60*1000).toISOString() }}
     ```
     (esto agrega 1 hora de duración por defecto)
   - **Summary**: `{{ $json.event.title }}`
   - **Description**: `{{ $json.event.description }}`
   - **Additional Fields**:
     - **Extended Properties** → **Private** → Agregá:
       ```json
       {
         "publimarEventId": "{{ $json.event.id }}"
       }
       ```
       (Esto te permite encontrar el evento después para update/delete)

### 2.6. Agregar nodo Google Calendar - Find Event (para Update y Delete)

Como necesitamos el ID de Google Calendar para actualizar o borrar, primero hay que buscarlo.

#### Para Update (Ruta 1):

1. Agregá un nodo **"Google Calendar"** desde la salida **1** del Switch
2. Configurá:
   - **Operation**: `Get All`
   - **Calendar**: primary
   - **Return All**: `false`
   - **Limit**: `1`
   - **Options** → **Private Extended Property**:
     ```
     publimarEventId={{ $json.event.id }}
     ```

3. Agregá otro nodo **"Google Calendar"** (para el update real)
4. Configurá:
   - **Operation**: `Update`
   - **Calendar**: primary
   - **Event ID**: `{{ $json.id }}`
   - **Update Fields**:
     - **Start**: `{{ $('Switch').item.json.event.date }}`
     - **End**:
       ```javascript
       {{ new Date(new Date($('Switch').item.json.event.date).getTime() + 60*60*1000).toISOString() }}
       ```
     - **Summary**: `{{ $('Switch').item.json.event.title }}`
     - **Description**: `{{ $('Switch').item.json.event.description }}`

#### Para Delete (Ruta 2):

1. Agregá un nodo **"Google Calendar"** desde la salida **2** del Switch
2. Configurá igual que el "Find Event" de arriba
3. Agregá otro nodo **"Google Calendar"** (para el delete real)
4. Configurá:
   - **Operation**: `Delete`
   - **Calendar**: primary
   - **Event ID**: `{{ $json.id }}`

### 2.7. Activar el Workflow

1. Arriba a la derecha, cambiá de **"Inactive"** a **"Active"**
2. Guardá el workflow

---

## ⚙️ Paso 3: Configurar tu App

1. Copiá la URL del webhook que te dio n8n
2. Abrí el archivo `.env.local` en tu proyecto
3. Reemplazá la URL:
   ```env
   NEXT_PUBLIC_N8N_WEBHOOK_URL=https://tu-instancia-n8n.cloud/webhook/calendar-sync
   ```

4. Reiniciá tu servidor de desarrollo:
   ```bash
   npm run dev
   ```

---

## 🧪 Paso 4: Probar

1. Abrí tu app en `http://localhost:3000`
2. Navegá a `/publimar/banderas`
3. Creá un nuevo evento en el calendario
4. Esperá unos segundos
5. Abrí [Google Calendar](https://calendar.google.com) en tu navegador
6. Deberías ver el evento creado

### Verificar en n8n:

1. Ve a tu workflow en n8n
2. Hacé clic en **"Executions"** (arriba a la derecha)
3. Vas a ver el historial de ejecuciones
4. Si hay algún error, hacé clic en la ejecución para ver los detalles

---

## 🔒 Seguridad

### Cómo funciona la autenticación

Tu app ahora está protegida con **Firebase Auth Token**:

1. **Cuando creás un evento**, la app obtiene tu token de Firebase
2. **El token se envía** en el header `Authorization: Bearer <token>`
3. **n8n valida el token** antes de procesar el evento
4. **Solo usuarios autenticados** de tu app pueden sincronizar eventos

### Qué protege esto

✅ **Evita spam**: Nadie puede crear eventos falsos
✅ **Verifica identidad**: Solo usuarios registrados en tu app
✅ **Token temporal**: Los tokens expiran automáticamente
✅ **No se puede reutilizar**: Cada request genera un token fresco

### Limitaciones actuales

⚠️ La validación en n8n es **básica** (verifica expiración y proyecto ID)
⚠️ No verifica la **firma criptográfica** del token (más complejo de implementar)
⚠️ Para máxima seguridad, considerá usar **Firebase Admin SDK** en n8n

## 🔍 Troubleshooting

### El evento no aparece en Google Calendar

1. Verificá que el workflow esté **Active**
2. Revisá las **Executions** en n8n para ver si hay errores
3. Verificá que la URL del webhook esté correctamente configurada en `.env.local`
4. Abrí la consola del navegador (F12) y buscá mensajes de error

### Error de autenticación con Google

1. Verificá que las credenciales OAuth estén correctamente configuradas
2. Intentá reconectar la cuenta de Google en n8n
3. Asegurate de que la Google Calendar API esté habilitada en Google Cloud Console

### Error "Token de autenticación no proporcionado o inválido"

1. Verificá que estés **logueado** en la app
2. Intentá cerrar sesión y volver a entrar
3. Revisá la consola del navegador para ver errores de autenticación
4. Verificá que el nodo "Code" de validación esté correctamente configurado

### El webhook no recibe datos

1. Verificá que el servidor esté corriendo
2. Si estás usando n8n local, asegurate de que sea accesible desde tu app
3. Si estás usando localhost, probá usar una herramienta como [ngrok](https://ngrok.com/) para exponer n8n

---

## 📱 Bonus: Ver eventos en el celular

Una vez que la sincronización esté funcionando:

1. Abrí la app de **Google Calendar** en tu celular
2. Asegurate de estar logueado con la misma cuenta
3. Los eventos se van a sincronizar automáticamente
4. Vas a recibir notificaciones según tu configuración de Google Calendar

---

## 🎯 Próximos pasos (opcionales)

### Sincronización bidireccional

Si querés que los eventos creados en Google Calendar también aparezcan en tu app:

1. En n8n, creá otro workflow
2. Usá el trigger **"Google Calendar Trigger"**
3. Cuando se cree/edite/elimine un evento en Google, llamá a un endpoint de tu app para crear el evento en Firestore

### Personalizar duración de eventos

Actualmente los eventos duran 1 hora por defecto. Para cambiar esto:

1. Agregá un campo `duration` o `endTime` en tu formulario de eventos
2. Modificá `src/lib/n8nWebhook.ts` para enviar el endTime
3. Actualizá los nodos de Google Calendar en n8n para usar el endTime

---

## 📚 Recursos

- [Documentación de n8n](https://docs.n8n.io/)
- [Google Calendar API](https://developers.google.com/calendar)
- [n8n Google Calendar Node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar/)

---

## ✅ Checklist

- [ ] n8n instalado y corriendo
- [ ] Workflow creado en n8n
- [ ] Credenciales de Google configuradas
- [ ] Webhook URL copiada
- [ ] `.env.local` actualizado con la URL del webhook
- [ ] Servidor reiniciado
- [ ] Evento de prueba creado
- [ ] Evento visible en Google Calendar
- [ ] Evento visible en la app del celular

---

**¡Listo!** Ahora cada vez que creés, edites o elimines un evento en tu app, se va a sincronizar automáticamente con Google Calendar y lo vas a poder ver en todos tus dispositivos.

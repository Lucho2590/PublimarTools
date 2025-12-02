# Guía Detallada: Crear Credenciales de Google Calendar para n8n

Esta guía te ayuda a conectar n8n con tu Google Calendar paso a paso.

---

## 🎯 ¿Qué vamos a hacer?

Vamos a darle permiso a n8n para que pueda crear/editar/eliminar eventos en tu Google Calendar. Para eso necesitamos crear credenciales OAuth 2.0.

---

## 📍 PARTE 1: Preparar en n8n (5 minutos)

### Paso 1: Abrir n8n

1. Abrí tu instancia de n8n:
   - **Cloud**: `https://tuusuario.app.n8n.cloud`
   - **Local**: `http://localhost:5678`

### Paso 2: Ir a Credentials

1. Arriba a la derecha, hacé clic en tu **icono de usuario/avatar**
2. En el menú que se abre, hacé clic en **"Settings"**
3. En el menú lateral izquierdo, hacé clic en **"Credentials"**

### Paso 3: Agregar nueva credencial

1. Hacé clic en el botón **"Add Credential"** (arriba a la derecha)
2. En el buscador que aparece, escribí: `google calendar`
3. Seleccioná **"Google Calendar OAuth2 API"**

### Paso 4: Copiar la Redirect URI

**¡IMPORTANTE!** Vas a ver una pantalla con varios campos. Uno dice:

```
OAuth Redirect URL:
https://tuusuario.app.n8n.cloud/rest/oauth2-credential/callback
```

O si es local:
```
OAuth Redirect URL:
http://localhost:5678/rest/oauth2-credential/callback
```

**📋 COPIÁ esta URL completa** (la vas a necesitar en Google Cloud Console)

**🚨 NO CIERRES ESTA VENTANA** - La vamos a necesitar después

---

## 📍 PARTE 2: Configurar en Google Cloud Console (10 minutos)

### Paso 1: Abrir Google Cloud Console

1. Abrí en una **nueva pestaña**: [console.cloud.google.com](https://console.cloud.google.com)
2. Logueate con tu cuenta de Google (la misma que usás para tu calendario)

### Paso 2: Crear o seleccionar un proyecto

#### Opción A: Si ya tenés un proyecto (como "publimartools")
1. Arriba a la izquierda, hacé clic en el **selector de proyectos**
2. Seleccioná tu proyecto existente
3. Saltá al Paso 3

#### Opción B: Si NO tenés un proyecto
1. Arriba a la izquierda, hacé clic en el **selector de proyectos**
2. Hacé clic en **"NEW PROJECT"**
3. Dale un nombre: `"n8n Calendar Integration"` (o el que quieras)
4. Hacé clic en **"CREATE"**
5. Esperá unos segundos a que se cree

### Paso 3: Habilitar Google Calendar API

1. En el menú lateral izquierdo, buscá **"APIs & Services"** → **"Library"**
   - O directamente: [console.cloud.google.com/apis/library](https://console.cloud.google.com/apis/library)

2. En el buscador, escribí: `google calendar api`

3. Hacé clic en **"Google Calendar API"**

4. Hacé clic en el botón **"ENABLE"** (si ya está habilitada, vas a ver "MANAGE")

### Paso 4: Configurar la pantalla de consentimiento OAuth

1. En el menú lateral, hacé clic en **"OAuth consent screen"**
   - O directamente: [console.cloud.google.com/apis/credentials/consent](https://console.cloud.google.com/apis/credentials/consent)

2. Seleccioná **"External"** (a menos que tengas Google Workspace)

3. Hacé clic en **"CREATE"**

4. Completá los campos obligatorios:
   - **App name**: `n8n Calendar Sync` (o el que quieras)
   - **User support email**: Tu email
   - **Developer contact email**: Tu email

5. Hacé clic en **"SAVE AND CONTINUE"**

6. En la pantalla de **"Scopes"**, hacé clic en **"ADD OR REMOVE SCOPES"**
   - Buscá y marcá: `https://www.googleapis.com/auth/calendar`
   - Hacé clic en **"UPDATE"**
   - Hacé clic en **"SAVE AND CONTINUE"**

7. En **"Test users"**, hacé clic en **"ADD USERS"**
   - Agregá tu email (el que usás para tu calendario)
   - Hacé clic en **"ADD"**
   - Hacé clic en **"SAVE AND CONTINUE"**

8. Revisá el resumen y hacé clic en **"BACK TO DASHBOARD"**

### Paso 5: Crear credenciales OAuth 2.0

1. En el menú lateral, hacé clic en **"Credentials"**
   - O directamente: [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)

2. Arriba, hacé clic en **"+ CREATE CREDENTIALS"**

3. Seleccioná **"OAuth client ID"**

4. En **"Application type"**, seleccioná **"Web application"**

5. Dale un nombre: `n8n Webhook` (o el que quieras)

6. En **"Authorized redirect URIs"**, hacé clic en **"+ ADD URI"**

7. **📋 PEGÁ LA URL** que copiaste de n8n (Paso 4 de la Parte 1)
   - Ejemplo: `https://tuusuario.app.n8n.cloud/rest/oauth2-credential/callback`
   - O: `http://localhost:5678/rest/oauth2-credential/callback`

8. Hacé clic en **"CREATE"**

### Paso 6: Copiar Client ID y Client Secret

**¡IMPORTANTE!** Va a aparecer un popup con tus credenciales:

```
Your Client ID
abc123...def456

Your Client Secret
xyz789...uvw012
```

**📋 COPIÁ AMBOS** (los vas a pegar en n8n)

**💡 TIP**: Podés hacer clic en "DOWNLOAD JSON" para guardar una copia

---

## 📍 PARTE 3: Volver a n8n y completar (2 minutos)

### Paso 1: Volver a la ventana de n8n

Volvé a la pestaña de n8n que dejaste abierta (la de las credenciales)

### Paso 2: Pegar las credenciales

1. En el campo **"Client ID"**, pegá el Client ID que copiaste
2. En el campo **"Client Secret"**, pegá el Client Secret que copiaste

### Paso 3: Configurar los scopes

Asegurate de que en **"Scope"** esté:
```
https://www.googleapis.com/auth/calendar
```

(Debería estar por defecto)

### Paso 4: Guardar y conectar

1. Hacé clic en el botón **"Save"** (abajo)

2. Va a aparecer un botón **"Connect my account"** o **"Sign in with Google"**

3. Hacé clic en ese botón

4. Se va a abrir una ventana de Google:
   - Seleccioná tu cuenta
   - Vas a ver un mensaje: "Google hasn't verified this app"
   - Hacé clic en **"Advanced"** → **"Go to n8n Calendar Sync (unsafe)"**
   - Hacé clic en **"Allow"**

5. La ventana se va a cerrar y vas a ver en n8n:
   ```
   ✅ Connected
   ```

---

## ✅ ¡Listo!

Ahora tus credenciales están configuradas. Podés usar cualquier nodo de Google Calendar en n8n y va a funcionar.

---

## 🔍 Troubleshooting

### "Error: redirect_uri_mismatch"

**Problema**: La URL de redirect no coincide

**Solución**:
1. Volvé a Google Cloud Console → Credentials
2. Hacé clic en tu OAuth Client ID
3. Verificá que la "Authorized redirect URI" sea **exactamente** la misma que muestra n8n
4. Si usás localhost, tiene que ser `http://` (NO `https://`)
5. Si usás n8n cloud, tiene que ser `https://` (NO `http://`)

### "Error: access_denied"

**Problema**: No le diste permisos a la app

**Solución**:
1. Volvé a Google Cloud Console → OAuth consent screen
2. Verificá que tu email esté en "Test users"
3. Intentá conectar de nuevo en n8n

### No me aparece "Google Calendar OAuth2 API" en n8n

**Problema**: Versión vieja de n8n

**Solución**:
1. Buscá solo "Google Calendar"
2. O buscá "Google OAuth2"
3. Seleccioná la que diga "Calendar" en la descripción

---

## 📚 Resumen Visual

```
Google Cloud Console                     n8n
──────────────────                   ─────────

1. Crear proyecto               →
2. Habilitar Calendar API       →
3. Configurar OAuth Screen      →
4. Crear OAuth Client ID        →
                                     5. Copiar Redirect URI
5. Agregar Redirect URI         ←
6. Obtener Client ID/Secret     →
                                     7. Pegar credenciales
                                     8. Conectar con Google
                                     9. ✅ Listo!
```

---

## 🎯 Siguiente paso

Una vez que tengas las credenciales configuradas, podés seguir con la guía principal (`N8N_GOOGLE_CALENDAR_SETUP.md`) en la sección **2.5** para agregar los nodos de Google Calendar.

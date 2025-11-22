# API REST - PublimarTools

API REST para acceder a los datos de inventario de PublimarTools desde agentes de IA externos.

## Base URL

```
https://tu-dominio.vercel.app/api
```

## Autenticación

La API utiliza Firebase Authentication con tokens JWT.

### 1. Login

Obtener un token de acceso usando email y password.

**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "email": "tu-email@ejemplo.com",
  "password": "tu-password"
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "AMf-vBy...",
  "expiresIn": "3600",
  "uid": "abc123...",
  "email": "tu-email@ejemplo.com"
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Credenciales inválidas"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Email y password son requeridos"
}
```

---

## Endpoints Protegidos

Todos los siguientes endpoints requieren el header de autorización:

```
Authorization: Bearer <token>
```

### 2. Obtener Productos

Obtiene todos los productos con sus variantes y stock.

**Endpoint:** `GET /products`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "count": 150,
  "products": [
    {
      "id": "prod123",
      "name": "Bandera Argentina",
      "description": "Bandera oficial Argentina",
      "sku": "BAN-ARG-001",
      "categories": ["cat1", "cat2"],
      "lowStock": true,
      "variants": [
        {
          "id": "var1",
          "size": "1.5m x 1m",
          "price": 5000,
          "stock": 2,
          "sku": "BAN-ARG-001-150"
        },
        {
          "id": "var2",
          "size": "2m x 1.5m",
          "price": 7500,
          "stock": 5,
          "sku": "BAN-ARG-001-200"
        }
      ],
      "imageUrls": [],
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-20T15:45:00.000Z"
    }
  ]
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "No autorizado"
}
```

---

## Ejemplo de Uso con cURL

### Login
```bash
curl -X POST https://tu-dominio.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tu-email@ejemplo.com","password":"tu-password"}'
```

### Obtener Productos
```bash
curl -X GET https://tu-dominio.vercel.app/api/products \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Ejemplo de Uso con Python

```python
import requests

# 1. Login
login_url = "https://tu-dominio.vercel.app/api/auth/login"
login_data = {
    "email": "tu-email@ejemplo.com",
    "password": "tu-password"
}

response = requests.post(login_url, json=login_data)
auth_data = response.json()
token = auth_data["token"]

# 2. Obtener productos
products_url = "https://tu-dominio.vercel.app/api/products"
headers = {
    "Authorization": f"Bearer {token}"
}

response = requests.get(products_url, headers=headers)
products_data = response.json()

print(f"Total de productos: {products_data['count']}")
for product in products_data['products']:
    print(f"\nProducto: {product['name']}")
    print(f"SKU: {product['sku']}")
    print(f"Variantes:")
    for variant in product['variants']:
        print(f"  - {variant['size']}: Stock {variant['stock']}, Precio ${variant['price']}")
```

---

## Ejemplo de Uso con JavaScript/Node.js

```javascript
const fetch = require('node-fetch');

async function getProducts() {
  // 1. Login
  const loginResponse = await fetch('https://tu-dominio.vercel.app/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'tu-email@ejemplo.com',
      password: 'tu-password',
    }),
  });

  const authData = await loginResponse.json();
  const token = authData.token;

  // 2. Obtener productos
  const productsResponse = await fetch('https://tu-dominio.vercel.app/api/products', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const productsData = await productsResponse.json();

  console.log(`Total de productos: ${productsData.count}`);
  productsData.products.forEach(product => {
    console.log(`\nProducto: ${product.name}`);
    console.log(`SKU: ${product.sku}`);
    console.log('Variantes:');
    product.variants.forEach(variant => {
      console.log(`  - ${variant.size}: Stock ${variant.stock}, Precio $${variant.price}`);
    });
  });
}

getProducts();
```

---

## Notas Importantes

1. **Token Expiration:** El token expira después de 3600 segundos (1 hora). Deberás volver a autenticarte cuando expire.

2. **Refresh Token:** Puedes usar el `refreshToken` para obtener un nuevo token sin tener que volver a ingresar credenciales.

3. **Rate Limiting:** Actualmente no hay límite de requests, pero se recomienda hacer un uso responsable de la API.

4. **Seguridad:**
   - Nunca compartas tus credenciales
   - Guarda el token de forma segura
   - No expongas el token en código público

5. **CORS:** La API está configurada para aceptar requests desde cualquier origen. Si necesitas restringir esto, contacta al administrador.

---

## Crear Usuario para la API

Para crear un usuario que pueda acceder a la API:

1. Ve a Firebase Console: https://console.firebase.google.com
2. Selecciona tu proyecto
3. Ve a "Authentication" > "Users"
4. Click en "Add User"
5. Ingresa email y password
6. El usuario ya puede usar la API con esas credenciales

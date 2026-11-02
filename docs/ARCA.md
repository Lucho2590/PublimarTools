# Facturación electrónica ARCA (Banderas)

La app emite **Factura A, Factura B, Nota de Crédito A y Nota de Crédito B** contra el web service de ARCA (WSFEv1) con un único emisor: el CUIT de Banderas. Además valida CUITs contra el **padrón de ARCA** (constancia de inscripción).

- Configuración: **Administración → Facturación ARCA** (`/publimar/administracion/arca`, solo admin).
- Emisión: botón **Facturar en ARCA** en el detalle de una orden o de una venta de Banderas.
- Código: `src/lib/arca/` (servidor en `src/lib/arca/server/`), rutas en `src/app/api/arca/`, componentes en `src/components/arca/`.

## 1. Trámite en ARCA (titular del CUIT o contador)

Hace falta clave fiscal nivel 3 del CUIT de Banderas o, si es una sociedad, de quien la representa. Banderas tiene que ser **Responsable Inscripto** (es la condición que emite A y B). Confirmá también que no esté en el régimen de "A con leyenda" o "M" (RG 1575).

**Representante y representado.** ARCA emite el certificado a nombre de **quien entra con su clave fiscal** (en una SRL, el socio gerente — p. ej. MDQ Publishot SRL la valida Hugo Froilán Giardini con su CUIT personal), no de la empresa. Por eso el CSR se genera con el *CUIT de quien entra a ARCA*, y la empresa le **delega** `wsfe` y el padrón a ese certificado. La app factura siempre con el CUIT del emisor (`Auth.Cuit` / `cuitRepresentada`), así que el CUIT del certificado y el del emisor pueden ser distintos.

### Homologación (pruebas, sin validez fiscal)
1. En la app: Administración → Facturación ARCA → cargar y **guardar** CUIT y razón social → en la tarjeta *Homologación*, cargar el **CUIT de quien entra a ARCA** y **Generar CSR** (se descarga un `.csr`). WSASS rechaza el CSR si ese CUIT no es el del usuario logueado.
2. En ARCA, adherir el servicio **WSASS – Autogestión Certificados Homologación** (Administrador de Relaciones de Clave Fiscal → Adherir servicio).
3. En WSASS: *Nuevo certificado* → pegar el CSR → copiar el certificado que devuelve.
4. En WSASS: *Crear autorización a servicio* para ese certificado con los servicios **wsfe** y **ws_sr_constancia_inscripcion**. Si el certificado es de una persona y factura una empresa, en *CUIT representada* va el CUIT de la empresa.
5. En la app: pegar el certificado en la tarjeta *Homologación* → **Guardar certificado** → **Probar**. Si WSASS no deja autorizar a la empresa como representada, tildar *Facturar las pruebas con el CUIT del certificado* (solo existe en homologación; en producción siempre factura el emisor).

### Producción
1. En la app: tarjeta *Producción* → **Generar CSR**.
2. En ARCA → **Administración de Certificados Digitales** → agregar alias → subir el CSR → descargar el `.crt`.
3. En ARCA → **Administrador de Relaciones de Clave Fiscal** → elegir **representar a la empresa** (si el certificado es de una persona) → *Nueva relación* → buscar y agregar **dos** servicios, cada uno con el certificado (computador fiscal) como representante:
   - **Facturación Electrónica** (wsfe).
   - **Consulta a Padrón Constancia de Inscripción** (ws_sr_constancia_inscripcion).
4. En ARCA → **Administración de Puntos de Venta y Domicilios** → nuevo punto de venta con sistema **"Factura Electrónica – Monotributo / Responsable Inscripto – Web Services"**. Tiene que ser distinto del que se usa en *Comprobantes en línea*.
5. En la app: pegar el `.crt` en la tarjeta *Producción*, cargar el punto de venta, elegir **Producción** como ambiente → **Guardar** → **Probar**.

El certificado vence (normalmente a los 2 años). La pantalla muestra la fecha. Para renovarlo se repite el paso de producción.

## 2. Variables de entorno

| Variable | Para qué |
|---|---|
| `ARCA_ENCRYPTION_KEY` | 32 bytes en base64 (`openssl rand -base64 32`). Cifra la clave privada del certificado y los tickets de acceso en Firestore. Si se pierde, hay que generar un CSR nuevo. |
| `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Ya existentes (firebase-admin). |

## 3. Cómo factura la app

- **A quién**: por defecto se usan los datos del documento (CUIT y dirección de la orden/venta) o la ficha del cliente. También se puede elegir una de las **otras razones sociales** del cliente o cargar **otro CUIT**. Si el CUIT no se validó en ARCA en los últimos 30 días, se consulta solo.
- **Letra**: sale de la condición frente al IVA del receptor.

  | Condición | Comprobante | CondicionIVAReceptorId | Leyenda en el PDF |
  |---|---|---|---|
  | IVA Inscripto | A | 1 | — |
  | Monotributo | A | 6 | RG 5003: "El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley Nº 27.618" |
  | IVA Exento | B | 4 | Transparencia Fiscal (RG 5614) con IVA contenido |
  | IVA No Alcanzado | B | 15 | Transparencia Fiscal |
  | Consumidor Final | B | 5 | Transparencia Fiscal |

- **Cuánto**: un **pago registrado** de la orden (queda marcado como facturado y no se puede volver a facturar ni editar), **lo pendiente**, **el total con detalle de ítems** (solo si no hay nada facturado) o un **monto libre**. Nunca más que lo pendiente: total − facturado + notas de crédito.
- Los montos se toman con **IVA incluido (21%)**; el neto y el IVA se calculan para que cierren al centavo.
- **Notas de crédito**: desde cada factura ARCA (botón ↶). Anular toda la factura libera los pagos que incluía para volver a facturarlos. También se puede acreditar un monto parcial.
- La factura emitida se agrega a la orden **y** a la venta vinculada.

## 4. Padrón: qué devuelve ARCA

`getPersona_v2` devuelve razón social (o apellido y nombre), tipo de persona, estado de la clave fiscal, domicilio fiscal, impuestos y actividades, y la categoría de monotributo si corresponde. La **condición frente al IVA no viene directa**: se deduce de los impuestos (20 monotributo, 30 IVA, 32 IVA exento). Sin IVA ni monotributo se propone Consumidor Final (persona humana) o No Alcanzado (sociedad), marcado como "a confirmar".

## 5. Detalles técnicos

- **Ticket WSAA**: dura ~12 h, uno por servicio y ambiente. ARCA rechaza pedir otro si el anterior sigue vigente, así que se guarda cifrado en `arcaConfig/ticket_<ambiente>_<servicio>`.
- **Numeración**: lock en Firestore por ambiente + punto de venta + tipo (`arcaConfig/lock_*`). Se pide el último número autorizado y se emite el siguiente.
- **Idempotencia**: cada intento lleva un `requestId` (id del doc en `arcaInvoices`). Si se reintenta con el mismo id, se devuelve el mismo comprobante. Si ARCA no responde, se consulta el número con `FECompConsultar` antes de dar el comprobante por fallido.
- **Colecciones**: `arcaConfig` (emisor, certificados, tickets, locks) y `arcaInvoices` (comprobantes con request/resultado). Solo las escribe el servidor (firebase-admin).
- **RG 5616**: desde el 01/12/2026 ARCA rechaza comprobantes sin `CondicionIVAReceptorId`. La app lo manda siempre.
- **Pendiente de confirmar con el contador**: el texto exacto de la leyenda RG 5003, el umbral de Factura B a consumidor final sin identificar (configurable en la pantalla) y el código 32 (IVA exento) del padrón, que conviene verificar con una consulta real en homologación.

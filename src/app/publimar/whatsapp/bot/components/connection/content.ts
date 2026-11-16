// Textos del asistente de conexión de WhatsApp (coexistencia). Están separados
// de la lógica para poder ajustarlos sin tocar los componentes.

export type TInfoItem = { icon: string; title: string; text: string };

/** Paso 1: cómo funciona la coexistencia. `{horas}` = pausa del agente. */
export const HOW_IT_WORKS: TInfoItem[] = [
  {
    icon: "📱",
    title: "Tu número sigue en tu celular",
    text: "Seguís usando WhatsApp Business en el celular igual que hoy. No se pierden chats, contactos ni fotos.",
  },
  {
    icon: "🔁",
    title: "Los mensajes llegan a los dos lados",
    text: "Cada mensaje de un cliente aparece en el celular y en la bandeja de la app al mismo tiempo.",
  },
  {
    icon: "🤖",
    title: "El agente contesta solo",
    text: "Responde las consultas, arma pedidos y presupuestos. Si no sabe algo, le pasa la charla al equipo.",
  },
  {
    icon: "🙋",
    title: "Si contestás vos, el agente se calla",
    text: "Cuando alguien responde desde el celular, el agente deja de contestarle a ese cliente por {horas} horas. Así nunca se pisan.",
  },
  {
    icon: "🗂️",
    title: "Todo queda en la bandeja",
    text: "Lo que mandás desde el celular también aparece en la app, así el equipo ve la charla completa.",
  },
  {
    icon: "🕘",
    title: "Se traen los chats viejos",
    text: "Si aceptás compartir el historial, se importan las charlas de los últimos 6 meses para tener contexto. El agente no les contesta.",
  },
];

/** Lo que cambia al activar la coexistencia (lo pide Meta). */
export const WHAT_CHANGES: string[] = [
  "Los grupos siguen solo en el celular: no pasan a la app.",
  "Se apagan los mensajes temporales y los de \"ver una vez\". La ubicación en tiempo real tampoco funciona.",
  "Las listas de difusión quedan solo para leer.",
  "Se desvinculan los dispositivos conectados (WhatsApp Web, la compu): después los volvés a vincular. WhatsApp para Windows deja de funcionar con ese número.",
];

export const FOURTEEN_DAY_RULE =
  "Abrí WhatsApp Business en el celular al menos una vez cada 14 días. Si no, Meta corta la conexión y el agente deja de recibir mensajes (la app te avisa).";

export const HOW_TO_DISCONNECT =
  "Si algún día lo querés sacar, tocás \"Desvincular número\" en esta pantalla y lo desconectás desde el celular. Tu WhatsApp queda como estaba.";

/** Paso 2: lo que hace falta antes de empezar. */
export type TRequirement = { id: string; title: string; help: string[] };

export const REQUIREMENTS: TRequirement[] = [
  {
    id: "business-app",
    title: "El número está en WhatsApp Business (no en WhatsApp común) y la app está actualizada",
    help: [
      "El ícono de WhatsApp Business tiene una \"B\" adentro del globito.",
      "Actualizala desde Play Store o App Store (Meta pide la versión 2.24.17 o más nueva). La ves en Ajustes → Ayuda → Info. de la app.",
      "Si el número está en WhatsApp común: instalá WhatsApp Business, registrá el mismo número y aceptá pasar los chats. No se pierde nada.",
    ],
  },
  {
    id: "facebook-admin",
    title: "Tenés una cuenta de Facebook que administra el portfolio comercial del negocio",
    help: [
      "Entrá a business.facebook.com con tu Facebook. Si ves el portfolio del negocio y en Configuración → Personas figurás con \"Control total\", estás listo.",
      "Si no tenés portfolio, Meta te deja crear uno durante el proceso.",
    ],
  },
  {
    id: "computer",
    title: "Estás en una computadora y tenés el celular al lado",
    help: [
      "En un paso hay que escanear con el celular un código QR que aparece en la pantalla de la compu.",
    ],
  },
  {
    id: "popups",
    title: "Tenés 10 minutos y el navegador deja abrir ventanas emergentes",
    help: [
      "Meta abre una ventana aparte. Si el navegador la bloquea, aparece un aviso en la barra de direcciones: tocá \"Permitir siempre\".",
    ],
  },
];

/** Paso 3: adelanto de lo que se ve en la ventana de Meta. */
export type TMetaStep = { title: string; text: string; warning?: string };

export const META_STEPS: TMetaStep[] = [
  { title: "Iniciá sesión con Facebook", text: "Usá la cuenta que administra el negocio." },
  {
    title: "Elegí el portfolio comercial",
    text: "Elegí el del negocio, o creá uno nuevo si Meta te lo pide.",
  },
  {
    title: "Elegí \"Conectar tu app de WhatsApp Business existente\"",
    text: "Esta es la opción de coexistencia: el número sigue en el celular.",
    warning:
      "NO elijas \"Agregar un número nuevo\" ni \"Crear una cuenta nueva\": eso pasa el número solo a la API y borra WhatsApp del celular.",
  },
  { title: "Escribí el número", text: "El mismo que tenés en WhatsApp Business, con código de área." },
  {
    title: "Escaneá el QR con el celular",
    text: "En el celular, WhatsApp Business te muestra un aviso para conectar con la plataforma de Meta. Aceptalo y escaneá el código QR que aparece en la compu.",
  },
  {
    title: "Compartí el historial",
    text: "El celular pregunta si querés compartir el historial de chats. Recomendado: Sí, así el equipo y el agente tienen contexto.",
  },
  { title: "Confirmá y volvé a esta pantalla", text: "Cuando Meta diga que terminó, la ventana se cierra sola y acá ves el resultado." },
];

/** Paso de desvinculación en el celular (la baja real del lado de Meta). */
export const PHONE_DISCONNECT_STEPS: string[] = [
  "Abrí WhatsApp Business en el celular.",
  "Tocá los tres puntitos (Android) o Configuración (iPhone) → Ajustes.",
  "Entrá a Cuenta → Plataforma empresarial.",
  "Tocá \"Desconectar\" y confirmá.",
];

/** Motivos de desconexión que manda Meta (`disconnection_info.reason`). */
export const DISCONNECT_REASONS: Record<string, string> = {
  PRIMARY_INACTIVITY:
    "Meta lo desconectó porque no se abrió WhatsApp Business en el celular por 14 días.",
  COMPANION_INACTIVITY: "Meta lo desconectó por inactividad de un dispositivo vinculado.",
  ACCOUNT_DISCONNECTED: "Se desconectó desde el celular (o Meta bloqueó la cuenta).",
  BUSINESS_DOWNGRADE: "El número se pasó a WhatsApp común.",
  CHANGE_NUMBER: "Se cambió el número en WhatsApp Business.",
  USER_RE_REGISTERED: "El número se volvió a registrar en otro celular.",
  PARTNER_REMOVED: "Se desconectó desde el celular.",
  ACCOUNT_OFFBOARDED: "Se desconectó desde el celular.",
};

/** Configuración técnica de Meta (una sola vez, la hace quien administra la app de Meta). */
export type TTechStep = { id: string; title: string; steps: string[] };

export const TECH_STEPS: Record<string, TTechStep> = {
  "env:META_APP_ID": {
    id: "env:META_APP_ID",
    title: "ID de la app de Meta (META_APP_ID)",
    steps: [
      "Entrá a developers.facebook.com → Mis apps → tu app.",
      "Configuración de la app → Básica → copiá el \"Identificador de la app\".",
      "En Vercel → el proyecto → Settings → Environment Variables, creá META_APP_ID con ese valor (Production y Preview).",
    ],
  },
  "env:META_APP_SECRET": {
    id: "env:META_APP_SECRET",
    title: "Clave secreta de la app (META_APP_SECRET)",
    steps: [
      "En la misma pantalla (Configuración de la app → Básica), \"Clave secreta de la app\" → Mostrar.",
      "Cargala en Vercel como META_APP_SECRET.",
    ],
  },
  "env:META_ES_CONFIG_ID": {
    id: "env:META_ES_CONFIG_ID",
    title: "Configuración del registro insertado (META_ES_CONFIG_ID)",
    steps: [
      "En tu app → Agregar producto → \"Inicio de sesión con Facebook para empresas\" (Facebook Login for Business) → Configurar.",
      "Entrá a Configuraciones → Crear configuración. Nombre: \"WhatsApp coexistencia\".",
      "Variante de inicio de sesión: \"WhatsApp Embedded Signup\" (registro insertado). Elegí la versión más nueva.",
      "Permisos: whatsapp_business_management y whatsapp_business_messaging. Creá la configuración.",
      "Copiá el \"ID de configuración\" y cargalo en Vercel como META_ES_CONFIG_ID.",
      "En Facebook Login for Business → Configuración: activá \"Inicio de sesión con el SDK de JavaScript\" y agregá el dominio de la app (https://…) en \"Dominios permitidos para el SDK de JavaScript\" y en \"URI de redireccionamiento de OAuth válidos\".",
    ],
  },
  "env:META_WEBHOOK_VERIFY_TOKEN": {
    id: "env:META_WEBHOOK_VERIFY_TOKEN",
    title: "Token de verificación del webhook (META_WEBHOOK_VERIFY_TOKEN)",
    steps: [
      "Inventá un texto largo y difícil (por ejemplo 32 letras y números).",
      "Cargalo en Vercel como META_WEBHOOK_VERIFY_TOKEN. Es el mismo que vas a pegar en Meta al configurar el webhook.",
    ],
  },
  "env:WHATSAPP_ENCRYPTION_KEY": {
    id: "env:WHATSAPP_ENCRYPTION_KEY",
    title: "Clave para cifrar el token (WHATSAPP_ENCRYPTION_KEY)",
    steps: [
      "Generala en una terminal con: openssl rand -base64 32",
      "Cargala en Vercel como WHATSAPP_ENCRYPTION_KEY.",
      "Si ya estaba cargada, NO la cambies: los tokens guardados dejarían de servir.",
    ],
  },
  "webhook:url": {
    id: "webhook:url",
    title: "Webhook de WhatsApp apuntando a la app",
    steps: [
      "En tu app → Casos de uso → WhatsApp → Personalizar → \"Configuración de producción\" → Configurar webhooks (en apps viejas: WhatsApp → Configuración → Webhook).",
      "URL de devolución de llamada: {webhookUrl}",
      "Token de verificación: el mismo de META_WEBHOOK_VERIFY_TOKEN. Tocá \"Verificar y guardar\".",
    ],
  },
  "webhook:fields": {
    id: "webhook:fields",
    title: "Campos del webhook suscriptos",
    steps: [
      "En la misma pantalla, bajá hasta \"Campos del webhook\" y activá \"Suscribirse\" en cada uno.",
      "Suscribí: messages, smb_message_echoes, history, smb_app_state_sync y account_update.",
    ],
  },
};

TECH_STEPS["app:publish"] = {
  id: "app:publish",
  title: "Datos obligatorios para publicar la app",
  steps: [
    "En developers.facebook.com → tu app → Configuración de la app → Básica.",
    "Cargá la \"URL de la política de privacidad\" (una página pública, sin login, que explique qué datos se usan) y elegí una \"Categoría\" (por ejemplo: Empresas y páginas).",
    "Guardá los cambios.",
  ],
};

TECH_STEPS["app:live"] = {
  id: "app:live",
  title: "Publicar la app (modo Live)",
  steps: [
    "Sin publicar, Meta NO entrega los mensajes de números reales: solo los de prueba del panel. El agente no recibiría nada.",
    "En tu app → Publicar (o el interruptor \"Modo de la app\": Desarrollo → Activo). Meta te dice si falta algún dato.",
    "Meta no informa este punto por API: revisalo en el panel. Cuando diga \"Publicada\" o \"Activo\", listo.",
  ],
};

export const TECH_NOTES: string[] = [
  "Después de cargar o cambiar variables en Vercel hay que hacer Redeploy para que tomen efecto.",
  "Si en la ventana de Meta no aparece la opción \"Conectar tu app de WhatsApp Business existente\", Meta puede estar pidiendo la verificación del negocio (business.facebook.com → Centro de seguridad).",
];

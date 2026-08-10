const collections = {
  PRODUCTS: "products",
  products: {
    VARIANTS: "variants",
    CATEGORIES: "categories",
    GROUPS: "productGroups",
  },
  CLIENTS: "clients",
  QUOTES: "quotes",
  quotes: {
    ITEMS: "items",
    COMMENTS: "comments",
  },
  ORDERS: "orders",
  orders: {
    ITEMS: "items",
  },
  SALES: "sales",
  sales: {
    ITEMS: "items",
  },
  PURCHASES: "purchases",
  USERS: "users",
  EVENTS: "events",
  LOCATIONS: "locations",
  NOTES: "notes",
  DEVICES: "devices",
  BILLINGS: "billings",
  PROVIDER_ACCOUNTS: "providerAccounts",
  providerAccounts: {
    PAYMENTS: "payments",
  },
  AUDIT_LOG: "auditLog",
  ACCOUNTS: "accounts",
  ACCOUNT_MOVEMENTS: "accountMovements",
  OPERATIONAL_EXPENSES: "operationalExpenses",
  CREDIT_NOTES: "creditNotes",
  PAYMENT_ACCOUNT_DEFAULTS: "paymentAccountDefaults",
  WHATSAPP_CONVERSATIONS: "whatsappConversations",
  WHATSAPP_ORDERS: "whatsappOrders",
  // Cloud API (bandeja humana con coexistencia). Ver src/lib/whatsapp/*.
  WHATSAPP_INTEGRATION: "whatsappIntegration",
  WHATSAPP_CHANNELS: "whatsappChannels",
  WHATSAPP_CONTACTS: "whatsappContacts",
  WHATSAPP_MESSAGES: "whatsappMessages",
  WHATSAPP_TEMPLATES: "whatsappTemplates",
  WHATSAPP_TEMPLATE_SENDS: "whatsappTemplateSends",
  WHATSAPP_WEBHOOK_EVENTS: "whatsappWebhookEvents",
} as const;

export default collections;

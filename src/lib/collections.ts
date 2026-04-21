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
} as const;

export default collections;

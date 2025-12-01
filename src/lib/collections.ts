const collections = {
  PRODUCTS: "products",
  products: {
    VARIANTS: "variants",
    CATEGORIES: "categories",
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
} as const;

export default collections;

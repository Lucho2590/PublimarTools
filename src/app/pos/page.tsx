"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection } from "firebase/firestore";
import { toast } from "sonner";
import {
  Loader2,
  Trash2,
  Minus,
  Plus,
  ShoppingCart,
  ArrowLeft,
  ArrowRight,
  Check,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DiscountInput } from "@/components/admin/DiscountInput";
import collections from "@/lib/collections";
import { TProduct, TProductCategory, TProductVariant } from "@/types/product";
import {
  EPaymentMethod,
  ESaleDepartment,
  TSaleFormaPago,
} from "@/types/sale";
import { useProducts } from "@/hooks/useProducts";
import { useClients } from "@/hooks/useClients";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useAuth } from "@/contexts/AuthContext";
import { EClientSection } from "@/types/client";
import {
  usePaymentAccountDefaults,
  getDefaultAccountId,
} from "@/hooks/usePaymentAccountDefaults";
import { createSale } from "@/lib/sales";
import { variantDiscountsStock } from "@/lib/stock";
import { formatearPrecio, redondearTotal } from "@/lib/utils";
import {
  calcDocumentTotals,
  calcItemGross,
  calcItemNet,
  formatItemDiscount,
  TDiscountType,
} from "@/lib/totals";
import { ProductCatalog } from "./ProductCatalog";
import { ClientStep } from "./ClientStep";
import { PaymentStep } from "./PaymentStep";
import { CartItem, PosClient, cartKey } from "./types";

const STEPS = [
  { n: 1 as const, label: "Productos" },
  { n: 2 as const, label: "Cliente" },
  { n: 3 as const, label: "Pago" },
];

const newFormaPago = (): TSaleFormaPago => ({
  id: `fp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  method: EPaymentMethod.CASH,
  amount: 0,
  accountId: "",
  bank: "",
});

export default function PuntoDeVentaPage() {
  const firestore = useFirestore();
  const { logEvent } = useAuditLog();
  const { userRole } = useAuth();

  const { products, loading: productsLoading } = useProducts();
  const { clients, loading: clientsLoading, createClient } = useClients({
    section: EClientSection.BANDERAS,
  });
  const { accounts: allAccounts } = useAccounts({ includeArchived: true });
  const { defaults: paymentDefaults } = usePaymentAccountDefaults();

  const categoriesCollection = collection(
    firestore,
    collections.products.CATEGORIES,
  );
  const { data: categoriesData } = useFirestoreCollectionData(
    categoriesCollection,
    { idField: "id" },
  );
  const categories = (categoriesData as unknown as TProductCategory[]) || [];

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedClient, setSelectedClient] = useState<PosClient | null>(null);
  const [formasPago, setFormasPago] = useState<TSaleFormaPago[]>([
    newFormaPago(),
  ]);
  const [discountMode, setDiscountMode] = useState<"percent" | "amount">(
    "percent",
  );
  const [discountValue, setDiscountValue] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const defaultsAppliedRef = useRef(false);

  // Cascada: primero el descuento de cada ítem (queda dentro de `subtotal`),
  // después el general sobre ese subtotal ya descontado. El POS no desglosa IVA.
  const totals = useMemo(
    () =>
      calcDocumentTotals({
        items: cart,
        applyIVA: false,
        discountPercentage: discountMode === "percent" ? discountValue : 0,
        manualDiscount: discountMode === "amount" ? discountValue : 0,
      }),
    [cart, discountMode, discountValue],
  );
  const grossSubtotal = totals.grossSubtotal;
  const itemsDiscountAmount = totals.itemsDiscountAmount;
  const subtotal = totals.subtotal;
  const discountAmount = redondearTotal(
    totals.generalDiscountAmount + totals.manualDiscount,
  );
  const discountedTotal = totals.total;
  const cartCount = useMemo(
    () => cart.reduce((s, it) => s + it.quantity, 0),
    [cart],
  );

  // Suma de las formas de pago que NO son la primera.
  const othersSum = formasPago
    .slice(1)
    .reduce((s, fp) => s + (fp.amount || 0), 0);

  // La primera forma de pago se autocompleta con el resto (total − las demás).
  // Editable: si el usuario la pisa a mano, su valor persiste hasta que cambie
  // otra forma o el descuento (ahí se recalcula). No genera loop porque sólo
  // escribe prev[0].amount, que no afecta othersSum (slice(1)) ni length.
  useEffect(() => {
    setFormasPago((prev) => {
      if (!prev.length) return prev;
      const remaining = Math.max(0, redondearTotal(discountedTotal - othersSum));
      if (Math.abs((prev[0].amount || 0) - remaining) < 0.001) return prev;
      return [{ ...prev[0], amount: remaining }, ...prev.slice(1)];
    });
  }, [discountedTotal, othersSum, formasPago.length]);

  // Precargar cuenta por defecto en la forma de pago inicial (una vez).
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!paymentDefaults?.sales) return;
    setFormasPago((prev) => {
      if (prev.length !== 1 || prev[0].accountId) return prev;
      const def = getDefaultAccountId(paymentDefaults, "sales", prev[0].method);
      if (!def) return prev;
      defaultsAppliedRef.current = true;
      return [{ ...prev[0], accountId: def }];
    });
  }, [paymentDefaults]);

  // --- Carrito ---
  const cartQty = (productId: string, variantId: string) =>
    cart.find((it) => cartKey(it.product.id, it.variant.id) === cartKey(productId, variantId))
      ?.quantity ?? 0;

  const addToCart = (product: TProduct, variant: TProductVariant) => {
    const key = cartKey(product.id, variant.id);
    // Variantes sin descuento de stock se venden sin tope de cantidad.
    const stock = variantDiscountsStock(variant)
      ? Number(variant.stock ?? 0)
      : Infinity;
    const price = Number(variant.price);
    setCart((prev) => {
      const existing = prev.find(
        (it) => cartKey(it.product.id, it.variant.id) === key,
      );
      if (existing) {
        if (existing.quantity >= stock) {
          toast.error("No hay más stock disponible");
          return prev;
        }
        return prev.map((it) => {
          if (cartKey(it.product.id, it.variant.id) !== key) return it;
          const next = { ...it, quantity: it.quantity + 1 };
          return { ...next, total: calcItemNet(next) };
        });
      }
      return [
        ...prev,
        {
          product,
          variant,
          quantity: 1,
          unitPrice: price,
          discount: 0,
          discountType: "percent" as TDiscountType,
          total: redondearTotal(price),
        },
      ];
    });
  };

  const addManualToCart = (m: {
    name: string;
    variantName: string;
    description: string;
    quantity: number;
    unitPrice: number;
  }) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const price = Number(m.unitPrice);
    const qty = Math.max(1, Number(m.quantity) || 1);
    const item: CartItem = {
      product: {
        id: `manual-${stamp}`,
        name: m.name,
        description: m.description,
        sku: "",
        categories: [],
        variants: [],
        salesCount: 0,
        totalSales: 0,
        price,
        stock: Infinity,
        imageUrls: [],
        hasVariants: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as TProduct,
      variant: {
        id: `manual-variant-${stamp}`,
        size: m.variantName || "N/A",
        sku: "",
        price,
        stock: Infinity,
      } as unknown as TProductVariant,
      quantity: qty,
      unitPrice: price,
      discount: 0,
      discountType: "percent",
      total: redondearTotal(price * qty),
    };
    setCart((prev) => [...prev, item]);
  };

  const updateQty = (key: string, qty: number) => {
    setCart((prev) =>
      prev
        .map((it) => {
          if (cartKey(it.product.id, it.variant.id) !== key) return it;
          const stock = variantDiscountsStock(it.variant)
            ? Number(it.variant.stock ?? 0)
            : Infinity;
          const clamped = Math.max(0, Math.min(qty, stock));
          const next = { ...it, quantity: clamped };
          return { ...next, total: calcItemNet(next) };
        })
        .filter((it) => it.quantity > 0),
    );
  };

  /** Descuento de una línea del carrito (% o $ sobre el total de la línea). */
  const updateItemDiscount = (
    key: string,
    patch: { discount?: number; discountType?: TDiscountType },
  ) => {
    setCart((prev) =>
      prev.map((it) => {
        if (cartKey(it.product.id, it.variant.id) !== key) return it;
        const next = { ...it, ...patch };
        return { ...next, total: calcItemNet(next) };
      }),
    );
  };

  const removeItem = (key: string) =>
    setCart((prev) =>
      prev.filter((it) => cartKey(it.product.id, it.variant.id) !== key),
    );

  // --- Formas de pago ---
  const addFormaPago = () => setFormasPago((prev) => [...prev, newFormaPago()]);
  const removeFormaPago = (id: string) =>
    setFormasPago((prev) =>
      prev.length > 1 ? prev.filter((fp) => fp.id !== id) : prev,
    );
  const updateFormaPago = (id: string, patch: Partial<TSaleFormaPago>) =>
    setFormasPago((prev) =>
      prev.map((fp) => {
        if (fp.id !== id) return fp;
        const next = { ...fp, ...patch };
        if (patch.method !== undefined && patch.accountId === undefined) {
          next.accountId = getDefaultAccountId(
            paymentDefaults,
            "sales",
            patch.method,
          );
        }
        return next;
      }),
    );

  const resetAll = () => {
    setCart([]);
    setSelectedClient(null);
    setFormasPago([newFormaPago()]);
    setDiscountMode("percent");
    setDiscountValue(0);
    defaultsAppliedRef.current = false;
    setStep(1);
  };

  // El monto de la primera forma lo autocompleta el efecto (resto = total).
  const goToPayment = () => setStep(3);

  const handleConfirm = async () => {
    if (cart.length === 0) {
      toast.error("El carrito está vacío");
      setStep(1);
      return;
    }
    if (discountedTotal <= 0) {
      toast.error("El total es $0, no se puede registrar la venta");
      return;
    }
    setSubmitting(true);
    try {
      const total = discountedTotal;

      const formasPagoValidas: TSaleFormaPago[] = formasPago
        .filter((fp) => fp.amount > 0)
        .map((fp) => ({
          id: fp.id,
          method: fp.method,
          amount: redondearTotal(fp.amount),
          accountId: fp.accountId || null,
          bank: fp.method === EPaymentMethod.TRANSFER ? fp.bank || null : null,
        }));

      const derivedPaymentMethod =
        formasPagoValidas.length === 0
          ? formasPago[0]?.method || EPaymentMethod.CASH
          : formasPagoValidas.length === 1
            ? formasPagoValidas[0].method
            : formasPagoValidas.reduce((a, b) => (a.amount > b.amount ? a : b))
                .method;

      const derivedBank =
        derivedPaymentMethod === EPaymentMethod.TRANSFER
          ? formasPagoValidas.find((fp) => fp.method === EPaymentMethod.TRANSFER)
              ?.bank || null
          : null;

      const primaryAccountId =
        formasPagoValidas.find((fp) => !!fp.accountId)?.accountId || null;

      const clientData: Record<string, any> = {};
      if (selectedClient?.id) clientData.clientId = selectedClient.id;
      if (selectedClient?.name) clientData.clientName = selectedClient.name;
      if (selectedClient?.contactName)
        clientData.contact = { name: selectedClient.contactName };
      if (selectedClient?.address) clientData.direccion = selectedClient.address;
      if (selectedClient?.email) clientData.email = selectedClient.email;
      if (selectedClient?.phone) clientData.telefono = selectedClient.phone;
      if (selectedClient?.cuit) clientData.cuit = selectedClient.cuit;

      const saleData = {
        number: new Date().getTime().toString(),
        items: cart.map((item) => ({
          description: item.product.description ?? "",
          productId: item.product.id,
          variantId: item.variant.id,
          productName: item.product.name,
          variantName: item.variant.size,
          quantity: item.quantity,
          unitPrice: redondearTotal(item.unitPrice),
          discount: Number(item.discount || 0),
          discountType: item.discountType || "percent",
          total: redondearTotal(item.total),
        })),
        subtotal: redondearTotal(subtotal),
        department: ESaleDepartment.BANDERAS,
        total: redondearTotal(total),
        applyIVA: false,
        taxRate: 21,
        taxAmount: 0,
        discountPercentage: discountMode === "percent" ? discountValue : 0,
        discountAmount:
          discountMode === "percent" ? totals.generalDiscountAmount : 0,
        manualDiscount: discountMode === "amount" ? discountValue : 0,
        paymentMethod: derivedPaymentMethod,
        bank: derivedBank,
        accountId: primaryAccountId,
        formasPago: formasPagoValidas,
        isInvoiced: false,
        invoiceNumber: null,
        facturas: [],
        ...clientData,
      };

      const { stockWarning } = await createSale(firestore, logEvent, userRole || "", {
        saleData,
        items: cart,
        formasPagoValidas,
        allAccounts,
        clienteInput: selectedClient?.name,
        total,
      });

      if (stockWarning) toast.warning(stockWarning);
      else toast.success("Venta registrada con éxito");
      resetAll();
    } catch (error) {
      console.error("Error al registrar la venta:", error);
      toast.error("Error al registrar la venta");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-white px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-gray-900">Punto de Venta</span>
        </div>
        <nav className="flex items-center gap-1 sm:gap-3">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center gap-1 sm:gap-3">
              <div
                className={`flex items-center gap-1.5 text-sm ${
                  step === s.n
                    ? "text-blue-600 font-medium"
                    : step > s.n
                      ? "text-green-600"
                      : "text-gray-400"
                }`}
              >
                <span
                  className={`flex items-center justify-center w-5 h-5 rounded-full text-xs ${
                    step === s.n
                      ? "bg-blue-600 text-white"
                      : step > s.n
                        ? "bg-green-600 text-white"
                        : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {step > s.n ? <Check className="w-3 h-3" /> : s.n}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <span className="text-gray-300">/</span>
              )}
            </div>
          ))}
        </nav>
      </header>

      {/* Main */}
      <div className="flex-1 flex min-h-0">
        {/* Contenido del paso */}
        <main className="flex-1 min-w-0 p-4 overflow-hidden flex flex-col">
          {step === 1 &&
            (productsLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <ProductCatalog
                products={products}
                categories={categories}
                onAdd={addToCart}
                onAddManual={addManualToCart}
                cartQty={cartQty}
              />
            ))}
          {step === 2 && (
            <ClientStep
              clients={clients}
              loading={clientsLoading}
              createClient={createClient}
              selected={selectedClient}
              onChange={setSelectedClient}
            />
          )}
          {step === 3 && (
            <PaymentStep
              subtotal={subtotal}
              total={discountedTotal}
              discountMode={discountMode}
              discountValue={discountValue}
              onDiscountModeChange={setDiscountMode}
              onDiscountValueChange={setDiscountValue}
              formasPago={formasPago}
              onAdd={addFormaPago}
              onRemove={removeFormaPago}
              onUpdate={updateFormaPago}
            />
          )}
        </main>

        {/* Panel del carrito */}
        <aside className="w-80 lg:w-96 shrink-0 border-l bg-white flex flex-col">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="font-medium text-gray-900">Venta actual</span>
            <span className="text-sm text-gray-500">{cartCount} ítem(s)</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="text-center text-gray-400 py-12 px-4 text-sm">
                Agregá productos para empezar
              </div>
            ) : (
              <ul className="divide-y">
                {cart.map((item) => {
                  const key = cartKey(item.product.id, item.variant.id);
                  const hasDiscount = Number(item.discount || 0) > 0;
                  const gross = calcItemGross(item);
                  return (
                    <li key={key} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {item.product.name}
                          </div>
                          <div className="text-xs text-gray-400">
                            {item.variant.size} ·{" "}
                            {formatearPrecio(item.unitPrice)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(key)}
                          className="text-gray-400 hover:text-red-600 shrink-0"
                          aria-label="Quitar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateQty(key, item.quantity - 1)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="w-6 text-center text-sm">
                            {item.quantity}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            disabled={
                              variantDiscountsStock(item.variant) &&
                              item.quantity >= Number(item.variant.stock ?? 0)
                            }
                            onClick={() => updateQty(key, item.quantity + 1)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant={hasDiscount ? "default" : "outline"}
                                size="icon"
                                className="h-7 w-7"
                                aria-label="Descuento del ítem"
                              >
                                <Tag className="w-3 h-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="w-64 space-y-2"
                            >
                              <div className="text-xs font-medium text-gray-700">
                                Descuento de {item.product.name}
                              </div>
                              <DiscountInput
                                size="sm"
                                value={item.discount || 0}
                                type={item.discountType || "percent"}
                                onValueChange={(discount) =>
                                  updateItemDiscount(key, { discount })
                                }
                                onTypeChange={(discountType) =>
                                  updateItemDiscount(key, { discountType })
                                }
                                inputClassName="flex-1"
                              />
                              <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>Queda en</span>
                                <span className="font-semibold text-gray-900">
                                  {formatearPrecio(item.total)}
                                </span>
                              </div>
                              {hasDiscount && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="w-full h-7 text-xs text-red-600 hover:text-red-700"
                                  onClick={() =>
                                    updateItemDiscount(key, { discount: 0 })
                                  }
                                >
                                  Quitar descuento
                                </Button>
                              )}
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="text-right">
                          {hasDiscount && (
                            <div className="text-xs text-gray-400 line-through">
                              {formatearPrecio(gross)}
                            </div>
                          )}
                          <span className="text-sm font-semibold text-gray-900">
                            {formatearPrecio(item.total)}
                          </span>
                        </div>
                      </div>
                      {hasDiscount && (
                        <div className="mt-1 text-xs text-green-600">
                          Descuento {formatItemDiscount(item)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Total + acciones */}
          <div className="border-t p-4 space-y-3">
            {selectedClient && (
              <div className="text-xs text-gray-500">
                Cliente:{" "}
                <span className="text-gray-700 font-medium">
                  {selectedClient.id === null
                    ? "Sin cliente"
                    : selectedClient.name}
                </span>
              </div>
            )}
            {(itemsDiscountAmount > 0 || discountAmount > 0) && (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Subtotal</span>
                <span>{formatearPrecio(grossSubtotal)}</span>
              </div>
            )}
            {itemsDiscountAmount > 0 && (
              <div className="flex items-center justify-between text-xs text-green-600">
                <span>Descuento en ítems</span>
                <span>−{formatearPrecio(itemsDiscountAmount)}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex items-center justify-between text-xs text-green-600">
                <span>Descuento general</span>
                <span>−{formatearPrecio(discountAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Total</span>
              <span className="text-xl font-bold text-gray-900">
                {formatearPrecio(discountedTotal)}
              </span>
            </div>

            {step === 1 && (
              <Button
                type="button"
                className="w-full"
                disabled={cart.length === 0}
                onClick={() => setStep(2)}
              >
                Finalizar venta
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {step === 2 && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Atrás
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={goToPayment}
                >
                  Ir al pago
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
            {step === 3 && (
              <>
                {discountedTotal <= 0 && (
                  <p className="text-xs text-red-600">
                    El total es $0 — revisá los productos o el descuento.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep(2)}
                    disabled={submitting}
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Atrás
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={handleConfirm}
                    disabled={
                      submitting || cart.length === 0 || discountedTotal <= 0
                    }
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 mr-1" />
                    )}
                    Confirmar venta
                  </Button>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

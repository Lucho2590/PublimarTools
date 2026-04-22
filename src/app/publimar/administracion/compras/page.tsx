'use client';

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useFirestore } from "reactfire";
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, orderBy, where, getDocs, increment } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useFirestoreCollectionData } from "reactfire";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { TPurchase, EPurchaseDepartment, EPurchasePaymentMethod } from "@/types/purchase";
import { EUserRole } from "@/types/user";
import { isAdminOrAbove } from "@/lib/permissions";
import { formatearPrecio } from "@/lib/utils";
import { EProviderAccountStatus } from "@/types/providerAccount";
import { Edit, DollarSign, Paperclip, Upload, X, AlertCircle, Plus, CheckCircle, Camera } from "lucide-react";
import { AccountSelect } from "@/components/admin/AccountSelect";
import { registerAccountMovement } from "@/lib/accountMovements";
import { EMovementType } from "@/types/accountMovement";

const paymentMethodLabels: Record<string, string> = {
  [EPurchasePaymentMethod.EFECTIVO]: "Efectivo",
  [EPurchasePaymentMethod.TARJETA]: "Tarjeta",
  [EPurchasePaymentMethod.TRANSFERENCIA]: "Transferencia",
  [EPurchasePaymentMethod.CUENTA_CORRIENTE]: "Cuenta Corriente",
  [EPurchasePaymentMethod.CHEQUE]: "Cheque",
  [EPurchasePaymentMethod.ECHEQ]: "E-Cheq",
};
import PurchaseEditModal from "./modalCompras/purchaseEditModal";
import { toast } from "sonner";
import { useAuditLog } from "@/hooks/useAuditLog";
import { buildChanges } from "@/lib/auditLog";
import { EAuditAction, EAuditEntityType, EAuditSection } from "@/types/auditLog";

// Formatear fecha
const formatDate = (timestamp: any) => {
  if (!timestamp) return "-";
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toLocaleDateString("es-AR");
  }
  if (timestamp instanceof Date) {
    return timestamp.toLocaleDateString("es-AR");
  }
  // Si es string (YYYY-MM-DD)
  if (typeof timestamp === 'string') {
    const [year, month, day] = timestamp.split('-');
    return `${day}/${month}/${year}`;
  }
  return new Date(timestamp).toLocaleDateString("es-AR");
};

export default function ComprasAdminPage() {
  const firestore = useFirestore();
  const { userRole } = useAuth();
  const { logEvent } = useAuditLog();
  const [form, setForm] = useState<Partial<TPurchase>>({
    date: new Date().toISOString().split("T")[0]
  });
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [facturaFile, setFacturaFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Estados para CC (Cuenta Corriente)
  const [ccAccount, setCcAccount] = useState<any | null>(null);
  const [ccLoading, setCcLoading] = useState(false);
  const [ccChecked, setCcChecked] = useState(false);

  // Asignar automáticamente el departamento según el rol del usuario
  useEffect(() => {
    if (userRole) {
      if (userRole === EUserRole.BANDERAS) {
        setForm(prev => ({ ...prev, department: EPurchaseDepartment.BANDERAS }));
      } else if (userRole === EUserRole.VIA_PUBLICA) {
        setForm(prev => ({ ...prev, department: EPurchaseDepartment.VIA_PUBLICA }));
      } else if (isAdminOrAbove(userRole)) {
        setForm(prev => ({ ...prev, department: EPurchaseDepartment.ADMINISTRACION }));
      }
    }
  }, [userRole]);

  // Estados para el modal de edición
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);

  // Estados para filtros
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");

  // Estados para autocomplete de proveedor (nueva compra)
  const [providerInput, setProviderInput] = useState("");
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [highlightedProviderIndex, setHighlightedProviderIndex] = useState(-1);
  const providerInputRef = useRef<HTMLInputElement>(null);
  const dropdownProviderRef = useRef<HTMLUListElement>(null);

  // Estados para autocomplete de proveedor (filtro)
  const [filterProviderInput, setFilterProviderInput] = useState("");
  const [showFilterProviderDropdown, setShowFilterProviderDropdown] = useState(false);
  const [highlightedFilterProviderIndex, setHighlightedFilterProviderIndex] = useState(-1);
  const filterProviderInputRef = useRef<HTMLInputElement>(null);
  const dropdownFilterProviderRef = useRef<HTMLUListElement>(null);

  // Obtener proveedores para el select
  const providersCollection = collection(firestore, "providers");
  const providersQuery = query(providersCollection, orderBy("name"));
  const { status: provStatus, data: providers } = useFirestoreCollectionData(providersQuery, { idField: "id" });

  // Obtener compras ordenadas por fecha descendente
  const purchasesCollection = collection(firestore, "purchases");
  const purchasesQuery = query(purchasesCollection, orderBy("date", "desc"));
  const { status: purStatus, data: purchases } = useFirestoreCollectionData(purchasesQuery, { idField: "id" });

  // Función para normalizar texto (quitar acentos y convertir a minúsculas)
  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remover acentos
  };

  // Filtrar compras según búsqueda, fechas, proveedor y departamento
  const filteredPurchases = useMemo(() => {
    return purchases?.filter((purchase: any) => {
      const searchNormalized = normalizeText(searchTerm);
      const matchesSearch =
        normalizeText(purchase.providerName || '').includes(searchNormalized) ||
        normalizeText(purchase.description || '').includes(searchNormalized) ||
        purchase.amount?.toString().includes(searchTerm);

      // Filtro por rango de fechas
      let matchesDateRange = true;
      if (dateRange?.from && dateRange?.to) {
        let purchaseDate: Date | null = null;

        if (typeof purchase.date === 'string') {
          const [year, month, day] = purchase.date.split('-').map(Number);
          purchaseDate = new Date(year, month - 1, day);
        } else if (purchase.date instanceof Date) {
          purchaseDate = purchase.date;
        } else if (purchase.date && typeof purchase.date === 'object' && 'seconds' in purchase.date) {
          purchaseDate = new Date((purchase.date as { seconds: number }).seconds * 1000);
        }

        if (purchaseDate) {
          const startOfDay = new Date(dateRange.from);
          startOfDay.setHours(0, 0, 0, 0);

          const endOfDay = new Date(dateRange.to);
          endOfDay.setHours(23, 59, 59, 999);

          const purchaseDateNormalized = new Date(purchaseDate);
          purchaseDateNormalized.setHours(0, 0, 0, 0);

          matchesDateRange = purchaseDateNormalized >= startOfDay && purchaseDateNormalized <= endOfDay;
        } else {
          matchesDateRange = false;
        }
      }

      // Filtro por proveedor
      const matchesProvider = selectedProvider === "all" || purchase.providerId === selectedProvider;

      // Filtro por departamento
      const matchesDepartment = selectedDepartment === "all" || purchase.department === selectedDepartment;

      return matchesSearch && matchesDateRange && matchesProvider && matchesDepartment;
    });
  }, [purchases, searchTerm, dateRange, selectedProvider, selectedDepartment]);

  // Calcular total de compras filtradas
  const totalFiltered = useMemo(() => {
    return filteredPurchases?.reduce((sum, purchase: any) => sum + (Number(purchase.amount) || 0), 0) || 0;
  }, [filteredPurchases]);

  // Calcular índices para la paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredPurchases?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((filteredPurchases?.length || 0) / itemsPerPage);

  // Generar números de página para mostrar
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5;

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pageNumbers.push(i);
        }
        pageNumbers.push(-1);
        pageNumbers.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pageNumbers.push(1);
        pageNumbers.push(-1);
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pageNumbers.push(i);
        }
      } else {
        pageNumbers.push(1);
        pageNumbers.push(-1);
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pageNumbers.push(i);
        }
        pageNumbers.push(-1);
        pageNumbers.push(totalPages);
      }
    }

    return pageNumbers;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleDepartmentChange = (value: string) => {
    setForm({ ...form, department: value as EPurchaseDepartment });
  };

  // Funciones para autocomplete de proveedor (nueva compra)
  const handleProviderInputChange = (value: string) => {
    setProviderInput(value);
    setShowProviderDropdown(true);
    setHighlightedProviderIndex(-1);
  };

  const handleSelectProvider = (providerId: string, providerName: string) => {
    setForm({ ...form, providerId });
    setProviderInput(providerName);
    setShowProviderDropdown(false);
    setHighlightedProviderIndex(-1);
  };

  const handleProviderKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const filteredProviders = providers?.filter((p: any) =>
      p.name.toLowerCase().includes(providerInput.toLowerCase())
    ) || [];

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedProviderIndex((prev) =>
        prev < filteredProviders.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedProviderIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && highlightedProviderIndex >= 0) {
      e.preventDefault();
      const selectedProvider = filteredProviders[highlightedProviderIndex];
      handleSelectProvider(selectedProvider.id, selectedProvider.name);
      if (providerInputRef.current) providerInputRef.current.blur();
    }
  };

  // Funciones para autocomplete de proveedor (filtro)
  const handleFilterProviderInputChange = (value: string) => {
    setFilterProviderInput(value);
    setShowFilterProviderDropdown(true);
    setHighlightedFilterProviderIndex(-1);
    if (!value.trim()) {
      setSelectedProvider("all");
    }
  };

  const handleSelectFilterProvider = (providerId: string, providerName: string) => {
    setSelectedProvider(providerId);
    setFilterProviderInput(providerName);
    setShowFilterProviderDropdown(false);
    setHighlightedFilterProviderIndex(-1);
    setCurrentPage(1);
  };

  const handleFilterProviderKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const filteredProviders = providers?.filter((p: any) =>
      p.name.toLowerCase().includes(filterProviderInput.toLowerCase())
    ) || [];

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedFilterProviderIndex((prev) =>
        prev < filteredProviders.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedFilterProviderIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && highlightedFilterProviderIndex >= 0) {
      e.preventDefault();
      const selectedProvider = filteredProviders[highlightedFilterProviderIndex];
      handleSelectFilterProvider(selectedProvider.id, selectedProvider.name);
      if (filterProviderInputRef.current) filterProviderInputRef.current.blur();
    }
  };

  // Verificar si el proveedor tiene CC activa
  const checkProviderCC = async (providerId: string) => {
    if (!providerId) {
      setCcAccount(null);
      setCcChecked(false);
      return;
    }
    setCcLoading(true);
    try {
      const ccQuery = query(
        collection(firestore, "providerAccounts"),
        where("providerId", "==", providerId),
        where("status", "==", EProviderAccountStatus.ACTIVE)
      );
      const snapshot = await getDocs(ccQuery);
      if (!snapshot.empty) {
        setCcAccount({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      } else {
        setCcAccount(null);
      }
      setCcChecked(true);
    } catch (error) {
      console.error("Error checking CC:", error);
      setCcAccount(null);
      setCcChecked(true);
    } finally {
      setCcLoading(false);
    }
  };

  // Crear CC para el proveedor seleccionado
  const handleCreateCC = async () => {
    if (!form.providerId) {
      toast.error("Seleccione un proveedor primero");
      return;
    }
    try {
      const provider = providers?.find((p: any) => p.id === form.providerId);
      const docRef = await addDoc(collection(firestore, "providerAccounts"), {
        providerId: form.providerId,
        providerName: provider?.name || "",
        balance: 0,
        totalPurchases: 0,
        totalPayments: 0,
        status: EProviderAccountStatus.ACTIVE,
        createdBy: userRole || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCcAccount({ id: docRef.id, providerId: form.providerId, providerName: provider?.name || "", balance: 0, totalPurchases: 0, totalPayments: 0, status: EProviderAccountStatus.ACTIVE });
      toast.success("Cuenta Corriente creada correctamente");
    } catch (error) {
      console.error("Error creating CC:", error);
      toast.error("Error al crear la Cuenta Corriente");
    }
  };

  // Efecto para verificar CC cuando cambia forma de pago o proveedor
  useEffect(() => {
    if (form.paymentMethod === EPurchasePaymentMethod.CUENTA_CORRIENTE && form.providerId) {
      checkProviderCC(form.providerId);
    } else {
      setCcAccount(null);
      setCcChecked(false);
    }
  }, [form.paymentMethod, form.providerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.date || !form.providerId || !form.description || !form.amount || !form.department) {
      toast.error("Todos los campos son requeridos");
      return;
    }

    // Si es CC, verificar que existe la CC
    if (form.paymentMethod === EPurchasePaymentMethod.CUENTA_CORRIENTE && !ccAccount) {
      toast.error("El proveedor no tiene una Cuenta Corriente activa. Cree una primero.");
      return;
    }

    setLoading(true);
    try {
      const provider = providers?.find((p: any) => p.id === form.providerId);
      const createPayload = {
        ...form,
        providerName: provider?.name || "",
        date: form.date,
        amount: Number(form.amount),
        accountId: form.accountId || null,
      };
      const docRef = await addDoc(purchasesCollection, {
        ...createPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await logEvent({
        section: EAuditSection.ADMINISTRACION,
        entityType: EAuditEntityType.PURCHASE,
        entityId: docRef.id,
        entityLabel: (createPayload.description ?? '').slice(0, 40) || null,
        action: EAuditAction.CREATE,
        description: `Creó una compra a ${createPayload.providerName ?? ''} por $${createPayload.amount}`.trim(),
        changes: buildChanges(null, createPayload as any, [
          'date', 'providerId', 'providerName', 'description',
          'amount', 'department', 'paymentMethod',
        ]),
        metadata: {
          providerId: createPayload.providerId,
          providerName: createPayload.providerName,
          amount: createPayload.amount,
        },
      });

      // Subir factura si existe
      if (facturaFile) {
        const storageRef = ref(storage, `purchases/${docRef.id}/factura_${Date.now()}_${facturaFile.name}`);
        await uploadBytes(storageRef, facturaFile);
        const facturaUrl = await getDownloadURL(storageRef);
        await updateDoc(docRef, { facturaUrl, facturaName: facturaFile.name });
      }

      // Si es CC, actualizar el saldo de la CC
      if (form.paymentMethod === EPurchasePaymentMethod.CUENTA_CORRIENTE && ccAccount) {
        const ccRef = doc(firestore, "providerAccounts", ccAccount.id);
        await updateDoc(ccRef, {
          balance: increment(Number(form.amount)),
          totalPurchases: increment(Number(form.amount)),
          updatedAt: serverTimestamp(),
        });
      }

      // Si NO es CC y tiene accountId, registrar movimiento de egreso en la cuenta
      if (
        form.paymentMethod !== EPurchasePaymentMethod.CUENTA_CORRIENTE &&
        form.accountId
      ) {
        try {
          await registerAccountMovement(firestore, {
            accountId: form.accountId,
            type: EMovementType.EXPENSE,
            amount: Number(form.amount),
            description: `Compra: ${provider?.name || ""} - ${form.description}`,
            date: new Date(`${form.date}T12:00:00`),
            sourceType: "purchase",
            sourceId: docRef.id,
            createdBy: userRole || "",
          });
        } catch (err) {
          console.error("Error al registrar movimiento de cuenta:", err);
        }
      }

      // Resetear form pero mantener el departamento según el rol
      const resetForm: Partial<TPurchase> = { date: new Date().toISOString().split("T")[0] };
      if (userRole === EUserRole.BANDERAS) {
        resetForm.department = EPurchaseDepartment.BANDERAS;
      } else if (userRole === EUserRole.VIA_PUBLICA) {
        resetForm.department = EPurchaseDepartment.VIA_PUBLICA;
      } else if (isAdminOrAbove(userRole)) {
        resetForm.department = EPurchaseDepartment.ADMINISTRACION;
      }
      setForm(resetForm);
      setProviderInput("");
      setFacturaFile(null);
      setCcAccount(null);
      setCcChecked(false);
      setShowForm(false);
      toast.success("Compra registrada correctamente");
    } catch (error) {
      console.error("Error al guardar compra:", error);
      toast.error("Error al guardar compra");
    } finally {
      setLoading(false);
    }
  };

  const handleEditPurchase = (purchaseId: string) => {
    setSelectedPurchaseId(purchaseId);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedPurchaseId(null);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setDateRange(undefined);
    setSelectedProvider("all");
    setFilterProviderInput("");
    setSelectedDepartment("all");
    setCurrentPage(1);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Compras</h1>
        <div className="flex gap-2">
          <Button
            asChild
            variant="outline"
            className="bg-slate-600 hover:bg-slate-700 text-white"
          >
            <Link href="/publimar/proveedores">Gestionar Proveedores</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Link href="/publimar/administracion/cuentasCorrientes">Cuentas Corrientes</Link>
          </Button>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-900 hover:bg-blue-900 hover:text-white"
          >
            {showForm ? "Cancelar" : "Nueva Compra"}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Registrar Compra</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Fecha *</Label>
                  <Input
                    id="date"
                    name="date"
                    type="date"
                    value={form.date || ""}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="providerId">Proveedor *</Label>
                  <div style={{ position: "relative" }}>
                    <Input
                      ref={providerInputRef}
                      placeholder="Buscar o seleccionar proveedor..."
                      value={providerInput}
                      onChange={(e) => handleProviderInputChange(e.target.value)}
                      onKeyDown={handleProviderKeyDown}
                      onFocus={() => {
                        setShowProviderDropdown(true);
                        setHighlightedProviderIndex(-1);
                      }}
                      onBlur={() =>
                        setTimeout(() => {
                          setShowProviderDropdown(false);
                          setHighlightedProviderIndex(-1);
                        }, 150)
                      }
                      required
                    />
                    {showProviderDropdown &&
                      providers &&
                      providers.length > 0 &&
                      (providerInput || true) && (
                        <ul
                          ref={dropdownProviderRef}
                          style={{
                            position: "absolute",
                            zIndex: 10,
                            background: "white",
                            border: "1px solid #e5e7eb",
                            padding: 6,
                            borderRadius: 6,
                            width: "100%",
                            maxHeight: 180,
                            overflowY: "auto",
                            marginTop: 2,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                          }}
                        >
                          {providers
                            .filter((p: any) =>
                              p.name.toLowerCase().includes(providerInput.toLowerCase())
                            )
                            .map((p: any, index: number) => (
                              <li
                                key={p.id}
                                style={{
                                  padding: 8,
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  backgroundColor:
                                    index === highlightedProviderIndex
                                      ? "#f1f5f9"
                                      : "transparent",
                                  transition: "background-color 0.15s ease",
                                }}
                                onMouseEnter={() => setHighlightedProviderIndex(index)}
                                onMouseDown={() => {
                                  handleSelectProvider(p.id, p.name);
                                  if (providerInputRef.current)
                                    providerInputRef.current.blur();
                                }}
                              >
                                {p.name}
                              </li>
                            ))}
                        </ul>
                      )}
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description">Descripcion / Nota *</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={form.description || ""}
                    onChange={handleChange}
                    rows={3}
                    required
                    placeholder="Descripcion de la compra..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Monto *</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount || ""}
                    onChange={handleChange}
                    required
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Departamento *</Label>
                  <Select
                    value={form.department || ""}
                    onValueChange={handleDepartmentChange}
                    required
                    disabled={!isAdminOrAbove(userRole)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {isAdminOrAbove(userRole) ? (
                        <>
                          <SelectItem value={EPurchaseDepartment.BANDERAS}>Banderas</SelectItem>
                          <SelectItem value={EPurchaseDepartment.VIA_PUBLICA}>Via Publica</SelectItem>
                          <SelectItem value={EPurchaseDepartment.ADMINISTRACION}>Administracion</SelectItem>
                        </>
                      ) : userRole === EUserRole.BANDERAS ? (
                        <SelectItem value={EPurchaseDepartment.BANDERAS}>Banderas</SelectItem>
                      ) : userRole === EUserRole.VIA_PUBLICA ? (
                        <SelectItem value={EPurchaseDepartment.VIA_PUBLICA}>Via Publica</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Forma de Pago</Label>
                  <Select
                    value={form.paymentMethod || ""}
                    onValueChange={(value) => setForm({ ...form, paymentMethod: value as EPurchasePaymentMethod })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar forma de pago" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EPurchasePaymentMethod.EFECTIVO}>Efectivo</SelectItem>
                      <SelectItem value={EPurchasePaymentMethod.TARJETA}>Tarjeta</SelectItem>
                      <SelectItem value={EPurchasePaymentMethod.TRANSFERENCIA}>Transferencia</SelectItem>
                      <SelectItem value={EPurchasePaymentMethod.CUENTA_CORRIENTE}>Cuenta Corriente</SelectItem>
                      <SelectItem value={EPurchasePaymentMethod.CHEQUE}>Cheque</SelectItem>
                      <SelectItem value={EPurchasePaymentMethod.ECHEQ}>E-Cheq</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.paymentMethod &&
                  form.paymentMethod !== EPurchasePaymentMethod.CUENTA_CORRIENTE && (
                    <div className="space-y-2 md:col-span-2">
                      <Label>Cuenta de origen (opcional)</Label>
                      <AccountSelect
                        value={form.accountId ?? ""}
                        onChange={(v) => setForm({ ...form, accountId: v || null })}
                        placeholder="Seleccionar cuenta"
                      />
                      <p className="text-xs text-slate-500">
                        Si se elige una cuenta, se registra el egreso y se actualiza el saldo.
                      </p>
                    </div>
                  )}
                {/* CC Status */}
                {form.paymentMethod === EPurchasePaymentMethod.CUENTA_CORRIENTE && (
                  <div className="md:col-span-2">
                    {!form.providerId ? (
                      <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                        <span className="text-sm text-yellow-700">Seleccione un proveedor primero para verificar su Cuenta Corriente.</span>
                      </div>
                    ) : ccLoading ? (
                      <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-md">
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-slate-600"></div>
                        <span className="text-sm text-slate-600">Verificando Cuenta Corriente...</span>
                      </div>
                    ) : ccChecked && ccAccount ? (
                      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-700">CC activa — Saldo pendiente: <strong>{formatearPrecio(ccAccount.balance || 0)}</strong></span>
                      </div>
                    ) : ccChecked && !ccAccount ? (
                      <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-md">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-orange-600" />
                          <span className="text-sm text-orange-700">Este proveedor no tiene una Cuenta Corriente activa.</span>
                        </div>
                        <Button type="button" size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-100" onClick={handleCreateCC}>
                          <Plus className="h-3 w-3 mr-1" /> Crear CC
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
                <div className="space-y-2 md:col-span-2">
                  <Label>Factura (PDF o imagen)</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      id="factura"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setFacturaFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <input
                      id="facturaCamera"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setFacturaFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="md:hidden flex-1"
                      onClick={() => document.getElementById('facturaCamera')?.click()}
                    >
                      <Camera className="h-4 w-4 mr-2" /> Tomar foto
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => document.getElementById('factura')?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" /> Cargar archivo
                    </Button>
                    {facturaFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setFacturaFile(null);
                          const input = document.getElementById('factura') as HTMLInputElement;
                          if (input) input.value = '';
                          const cam = document.getElementById('facturaCamera') as HTMLInputElement;
                          if (cam) cam.value = '';
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {facturaFile && (
                    <p className="text-sm text-slate-500 flex items-center gap-1">
                      <Paperclip className="h-3 w-3" /> {facturaFile.name}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    const resetForm: Partial<TPurchase> = { date: new Date().toISOString().split("T")[0] };
                    if (userRole === EUserRole.BANDERAS) {
                      resetForm.department = EPurchaseDepartment.BANDERAS;
                    } else if (userRole === EUserRole.VIA_PUBLICA) {
                      resetForm.department = EPurchaseDepartment.VIA_PUBLICA;
                    } else if (isAdminOrAbove(userRole)) {
                      resetForm.department = EPurchaseDepartment.ADMINISTRACION;
                    }
                    setForm(resetForm);
                    setProviderInput("");
                    setFacturaFile(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {loading ? "Guardando..." : "Registrar Compra"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Card con total de compras filtradas */}
      <Card className="mb-6 bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-900 p-3 rounded-full">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-600 font-medium">Total de Compras Filtradas</p>
                <p className="text-3xl font-bold text-blue-900">{formatearPrecio(totalFiltered)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600">Cantidad de compras</p>
              <p className="text-2xl font-semibold text-slate-900">{filteredPurchases?.length || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <Label className="mb-2 block">Buscar</Label>
              <Input
                placeholder="Buscar por proveedor, descripcion o monto..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex-1">
              <Label className="mb-2 block">Proveedor</Label>
              <div style={{ position: "relative" }}>
                <Input
                  ref={filterProviderInputRef}
                  placeholder="Todos los proveedores"
                  value={filterProviderInput}
                  onChange={(e) => handleFilterProviderInputChange(e.target.value)}
                  onKeyDown={handleFilterProviderKeyDown}
                  onFocus={() => {
                    setShowFilterProviderDropdown(true);
                    setHighlightedFilterProviderIndex(-1);
                  }}
                  onBlur={() =>
                    setTimeout(() => {
                      setShowFilterProviderDropdown(false);
                      setHighlightedFilterProviderIndex(-1);
                    }, 150)
                  }
                />
                {showFilterProviderDropdown &&
                  providers &&
                  providers.length > 0 && (
                    <ul
                      ref={dropdownFilterProviderRef}
                      style={{
                        position: "absolute",
                        zIndex: 10,
                        background: "white",
                        border: "1px solid #e5e7eb",
                        padding: 6,
                        borderRadius: 6,
                        width: "100%",
                        maxHeight: 180,
                        overflowY: "auto",
                        marginTop: 2,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      }}
                    >
                      <li
                        style={{
                          padding: 8,
                          borderRadius: 6,
                          cursor: "pointer",
                          backgroundColor:
                            highlightedFilterProviderIndex === -1 && !filterProviderInput
                              ? "#f1f5f9"
                              : "transparent",
                          transition: "background-color 0.15s ease",
                          fontWeight: selectedProvider === "all" ? "600" : "normal",
                        }}
                        onMouseEnter={() => setHighlightedFilterProviderIndex(-1)}
                        onMouseDown={() => {
                          handleSelectFilterProvider("all", "");
                          if (filterProviderInputRef.current)
                            filterProviderInputRef.current.blur();
                        }}
                      >
                        Todos los proveedores
                      </li>
                      {providers
                        .filter((p: any) =>
                          p.name.toLowerCase().includes(filterProviderInput.toLowerCase())
                        )
                        .map((p: any, index: number) => (
                          <li
                            key={p.id}
                            style={{
                              padding: 8,
                              borderRadius: 6,
                              cursor: "pointer",
                              backgroundColor:
                                index === highlightedFilterProviderIndex
                                  ? "#f1f5f9"
                                  : "transparent",
                              transition: "background-color 0.15s ease",
                              fontWeight: selectedProvider === p.id ? "600" : "normal",
                            }}
                            onMouseEnter={() => setHighlightedFilterProviderIndex(index)}
                            onMouseDown={() => {
                              handleSelectFilterProvider(p.id, p.name);
                              if (filterProviderInputRef.current)
                                filterProviderInputRef.current.blur();
                            }}
                          >
                            {p.name}
                          </li>
                        ))}
                    </ul>
                  )}
              </div>
            </div>
            <div className="flex-1">
              <Label className="mb-2 block">Rango de Fechas</Label>
              <DateRangePicker
                value={dateRange}
                onChange={(newDateRange: DateRange | undefined) => {
                  setDateRange(newDateRange);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex-1">
              <Label className="mb-2 block">Departamento</Label>
              <Select
                value={selectedDepartment}
                onValueChange={(value) => {
                  setSelectedDepartment(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos los departamentos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los departamentos</SelectItem>
                  <SelectItem value={EPurchaseDepartment.BANDERAS}>Banderas</SelectItem>
                  <SelectItem value={EPurchaseDepartment.VIA_PUBLICA}>Via Publica</SelectItem>
                  <SelectItem value={EPurchaseDepartment.ADMINISTRACION}>Administracion</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex md:justify-end">
              <Button
                variant="outline"
                onClick={clearFilters}
                size="sm"
              >
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {purStatus === "loading" ? (
        <div className="flex justify-center my-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 overflow-x-auto">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Mostrar</span>
                  <Select
                    value={itemsPerPage.toString()}
                    onValueChange={(value) => {
                      setItemsPerPage(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="10" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="15">15</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-gray-500">por pagina</span>
                </div>
                <div className="text-sm text-gray-500">
                  Mostrando {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, filteredPurchases?.length || 0)} de {filteredPurchases?.length || 0} compras
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Fecha</TableHead>
                    <TableHead className="text-left">Proveedor</TableHead>
                    <TableHead className="text-left">Descripcion</TableHead>
                    <TableHead className="text-left">Departamento</TableHead>
                    <TableHead className="text-left">Forma de Pago</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-center">Factura</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentItems && currentItems.length > 0 ? (
                    currentItems.map((compra: any) => (
                      <TableRow key={compra.id}>
                        <TableCell className="font-medium">{formatDate(compra.date)}</TableCell>
                        <TableCell>{compra.providerName || "-"}</TableCell>
                        <TableCell>{compra.description}</TableCell>
                        <TableCell>
                          {compra.department === EPurchaseDepartment.BANDERAS && "Banderas"}
                          {compra.department === EPurchaseDepartment.VIA_PUBLICA && "Via Publica"}
                          {compra.department === EPurchaseDepartment.ADMINISTRACION && "Administracion"}
                          {!compra.department && "-"}
                        </TableCell>
                        <TableCell>
                          {compra.paymentMethod ? paymentMethodLabels[compra.paymentMethod] || compra.paymentMethod : "-"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatearPrecio(Number(compra.amount))}
                        </TableCell>
                        <TableCell className="text-center">
                          {compra.facturaUrl ? (
                            <a href={compra.facturaUrl} target="_blank" rel="noopener noreferrer" title={compra.facturaName || "Ver factura"}>
                              <Paperclip className="h-4 w-4 text-blue-600 inline" />
                            </a>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar"
                              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                              onClick={() => handleEditPurchase(compra.id)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-6 text-slate-500"
                      >
                        {searchTerm || dateRange || selectedProvider !== "all" || selectedDepartment !== "all"
                          ? "No se encontraron compras con los filtros aplicados."
                          : "No hay compras registradas. ¡Registra tu primera compra!"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>

                      {getPageNumbers().map((pageNumber, index) => (
                        <PaginationItem key={index}>
                          {pageNumber === -1 ? (
                            <PaginationEllipsis />
                          ) : (
                            <PaginationLink
                              onClick={() => setCurrentPage(pageNumber)}
                              isActive={currentPage === pageNumber}
                              className={currentPage === pageNumber ? "bg-blue-900 text-white cursor-pointer" : "cursor-pointer"}
                            >
                              {pageNumber}
                            </PaginationLink>
                          )}
                        </PaginationItem>
                      ))}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <PurchaseEditModal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        purchaseId={selectedPurchaseId}
        onPurchaseUpdated={() => {
          // Los datos se actualizan automaticamente con reactfire
        }}
      />
    </div>
  );
}

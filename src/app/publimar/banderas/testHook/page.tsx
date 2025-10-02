"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Edit, Trash2, RefreshCw, Eye } from "lucide-react";

// Hook personalizado
import { useOrders, useOrderById } from "@/hooks/useOrders";

// Types
import { TOrder, EOrderStatus } from "@/types/order";

export default function TestHookPage() {
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [testOrderData, setTestOrderData] = useState({
    number: "",
    status: EOrderStatus.IN_PROCESS,
    notes: "",
    subtotal: 0,
    taxRate: 0.21,
    taxAmount: 0,
    total: 0,
    applyIVA: true,
    items: [],
  });

  // Hooks
  const { 
    ordenes: orders, 
    loading: ordersLoading, 
    error: ordersError, 
    createOrder, 
    updateOrder, 
    deleteOrder,
    generateOrderNumber,
    createOrderWithDefaults,
    changeOrderStatus,
    getOrderById
  } = useOrders();

  // Hook para orden individual (solo si hay ID seleccionado)
  const { 
    orden: selectedOrder, 
    loading: orderLoading 
  } = useOrderById(selectedOrderId || "dummy-id");

  // Handlers
  const handleCreateOrder = async () => {
    try {
      // Usar la función helper para crear orden con valores por defecto correctos
      const orderDefaults = createOrderWithDefaults({
        ...testOrderData,
        notes: testOrderData.notes || `Orden de prueba creada el ${new Date().toLocaleString()}`,
      });

      const id = await createOrder(orderDefaults as any);
      toast.success(`Orden creada con ID: ${id} - Número: ${orderDefaults.number}`);
      
      // Reset form
      setTestOrderData({
        number: "",
        status: EOrderStatus.IN_PROCESS,
        notes: "",
        subtotal: 0,
        taxRate: 0.21,
        taxAmount: 0,
        total: 0,
        applyIVA: true,
        items: [],
      });
    } catch (error) {
      toast.error("Error al crear orden");
      console.error(error);
    }
  };

  const handleUpdateOrder = async () => {
    if (!selectedOrderId) {
      toast.error("Selecciona una orden para actualizar");
      return;
    }

    try {
      await updateOrder(selectedOrderId, {
        notes: testOrderData.notes,
        status: testOrderData.status,
      });
      toast.success("Orden actualizada correctamente");
    } catch (error) {
      toast.error("Error al actualizar orden");
      console.error(error);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar esta orden?")) {
      return;
    }

    try {
      await deleteOrder(orderId);
      toast.success("Orden eliminada correctamente");
      
      if (selectedOrderId === orderId) {
        setSelectedOrderId("");
      }
    } catch (error) {
      toast.error("Error al eliminar orden");
      console.error(error);
    }
  };

  const handleChangeStatus = async (orderId: string, newStatus: EOrderStatus) => {
    try {
      await changeOrderStatus(orderId, newStatus);
      toast.success(`Estado cambiado a ${newStatus}`);
    } catch (error) {
      toast.error("Error al cambiar estado");
      console.error(error);
    }
  };

  const handleGetOrderById = async () => {
    if (!selectedOrderId) {
      toast.error("Selecciona una orden");
      return;
    }

    try {
      const order = await getOrderById(selectedOrderId);
      if (order) {
        toast.success(`Orden encontrada: ${order.number}`);
        console.log("Orden obtenida:", order);
      } else {
        toast.error("Orden no encontrada");
      }
    } catch (error) {
      toast.error("Error al obtener orden");
      console.error(error);
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Test Hook useOrder
        </h1>
        <p className="text-gray-600">
          Página para probar todas las funcionalidades del hook useOrder
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel de creación */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Crear Nueva Orden
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="status">Estado</Label>
              <Select
                value={testOrderData.status}
                onValueChange={(value) => 
                  setTestOrderData(prev => ({ ...prev, status: value as EOrderStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EOrderStatus.IN_PROCESS}>En Proceso</SelectItem>
                  <SelectItem value={EOrderStatus.COMPLETED}>Completada</SelectItem>
                  <SelectItem value={EOrderStatus.CANCELLED}>Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                value={testOrderData.notes}
                onChange={(e) => 
                  setTestOrderData(prev => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Notas de la orden..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="subtotal">Subtotal</Label>
                <Input
                  id="subtotal"
                  type="number"
                  value={testOrderData.subtotal}
                  onChange={(e) => 
                    setTestOrderData(prev => ({ ...prev, subtotal: Number(e.target.value) }))
                  }
                  step="0.01"
                />
              </div>
              <div>
                <Label htmlFor="total">Total</Label>
                <Input
                  id="total"
                  type="number"
                  value={testOrderData.total}
                  onChange={(e) => 
                    setTestOrderData(prev => ({ ...prev, total: Number(e.target.value) }))
                  }
                  step="0.01"
                />
              </div>
            </div>

            <Button onClick={handleCreateOrder} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Crear Orden de Prueba
            </Button>
          </CardContent>
        </Card>

        {/* Panel de detalles de orden seleccionada */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5" />
              Detalles de Orden Seleccionada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="selectedOrder">Seleccionar Orden</Label>
              <Select
                value={selectedOrderId}
                onValueChange={setSelectedOrderId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar orden" />
                </SelectTrigger>
                <SelectContent>
                  {orders.map((order: TOrder) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.number} - {order.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {orderLoading && selectedOrderId && selectedOrderId !== "dummy-id" && (
              <div className="flex items-center justify-center py-4">
                <RefreshCw className="w-6 h-6 animate-spin" />
                <span className="ml-2">Cargando orden...</span>
              </div>
            )}

            {selectedOrder && selectedOrderId && selectedOrderId !== "dummy-id" && (
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium text-gray-500">
                    ID
                  </Label>
                  <p className="text-sm">{selectedOrder.id}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">
                    Nombre del Cliente
                  </Label>
                  <p className="text-sm">{selectedOrder.clientName}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">
                    Referencia
                  </Label>
                  <p className="text-sm">{selectedOrder.reference}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">
                    Número
                  </Label>
                  <p className="text-sm">{selectedOrder.number}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">
                    Estado
                  </Label>
                  <p className="text-sm capitalize">{selectedOrder.status}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">
                    Notas
                  </Label>
                  <p className="text-sm">{selectedOrder.notes || "Sin notas"}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">
                    Total
                  </Label>
                  <p className="text-sm font-bold text-green-600">
                    ${selectedOrder.total?.toFixed(2) || "0.00"}
                  </p>
                </div>
                
                <div className="flex flex-col gap-2 pt-4">
                  <div className="flex gap-2">
                    <Button onClick={handleUpdateOrder} size="sm">
                      <Edit className="w-4 h-4 mr-2" />
                      Actualizar
                    </Button>
                    <Button 
                      onClick={() => handleDeleteOrder(selectedOrder.id)} 
                      variant="destructive"
                      size="sm"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar
                    </Button>
                  </div>
                  
                  <Button onClick={handleGetOrderById} size="sm" variant="outline">
                    <Eye className="w-4 h-4 mr-2" />
                    Obtener por ID (async)
                  </Button>
                  
                  <div className="flex gap-1">
                    <Button 
                      onClick={() => handleChangeStatus(selectedOrder.id, EOrderStatus.IN_PROCESS)} 
                      size="sm" 
                      variant="outline"
                    >
                      En Proceso
                    </Button>
                    <Button 
                      onClick={() => handleChangeStatus(selectedOrder.id, EOrderStatus.COMPLETED)} 
                      size="sm" 
                      variant="outline"
                    >
                      Completar
                    </Button>
                    <Button 
                      onClick={() => handleChangeStatus(selectedOrder.id, EOrderStatus.CANCELLED)} 
                      size="sm" 
                      variant="outline"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lista de todas las órdenes */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Todas las Órdenes ({orders.length})</span>
            {ordersLoading && <RefreshCw className="w-5 h-5 animate-spin" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ordersError && (
            <div className="text-red-600 mb-4">
              Error al cargar órdenes
            </div>
          )}
          
          {ordersLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-8 h-8 animate-spin" />
              <span className="ml-2">Cargando órdenes...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedOrderId === order.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <div className="font-medium">{order.number}</div>
                  <div className="text-sm text-gray-600 capitalize">
                    {order.status}
                  </div>
                  <div className="text-sm font-medium text-green-600 mt-2">
                    ${order.total?.toFixed(2) || "0.00"}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    ID: {order.id}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {!ordersLoading && orders.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No hay órdenes disponibles. ¡Crea una para empezar!
            </div>
          )}
        </CardContent>
      </Card>

      {/* Debug info */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Debug Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm font-mono">
            <div>Orders Loading: {ordersLoading.toString()}</div>
            <div>Orders Error: {ordersError.toString()}</div>
            <div>Orders Count: {orders.length}</div>
            <div>Selected Order ID: {selectedOrderId || "none"}</div>
            <div>Order Loading: {orderLoading.toString()}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

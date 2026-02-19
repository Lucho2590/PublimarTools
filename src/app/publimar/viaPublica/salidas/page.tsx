'use client';

import { useState, useMemo } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin, Printer } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, isWithinInterval, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import collections from "@/lib/collections";
import { EQuoteStatus } from "@/types/quote";
import { EClientSection } from "@/types/client";

// Colores para los presupuestos (se asignan cíclicamente)
const COLORS = [
  { bg: "bg-blue-500", text: "text-white", hover: "hover:bg-blue-600" },
  { bg: "bg-green-500", text: "text-white", hover: "hover:bg-green-600" },
  { bg: "bg-orange-500", text: "text-white", hover: "hover:bg-orange-600" },
  { bg: "bg-purple-500", text: "text-white", hover: "hover:bg-purple-600" },
  { bg: "bg-pink-500", text: "text-white", hover: "hover:bg-pink-600" },
  { bg: "bg-teal-500", text: "text-white", hover: "hover:bg-teal-600" },
  { bg: "bg-indigo-500", text: "text-white", hover: "hover:bg-indigo-600" },
  { bg: "bg-red-500", text: "text-white", hover: "hover:bg-red-600" },
  { bg: "bg-amber-500", text: "text-white", hover: "hover:bg-amber-600" },
  { bg: "bg-cyan-500", text: "text-white", hover: "hover:bg-cyan-600" },
];

// Tipo para período con datos del presupuesto
interface PeriodoConPresupuesto {
  id: string;
  presupuestoId: string;
  presupuestoNumber: string;
  clientName: string;
  fechaInicio: Date;
  fechaFin: Date;
  dias: number;
  notas?: string;
  dispositivos: Array<{
    productName: string;
    quantity: number;
  }>;
  colorIndex: number;
}

export default function SalidasPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedPeriodo, setSelectedPeriodo] = useState<PeriodoConPresupuesto | null>(null);
  const firestore = useFirestore();

  // Cargar presupuestos aceptados de vía pública
  const quotesCollection = collection(firestore, collections.QUOTES);
  const quotesQuery = query(
    quotesCollection,
    where("client.section", "==", EClientSection.VIA_PUBLICA),
    where("status", "==", EQuoteStatus.CONFIRMED)
  );

  const { data: quotes, status } = useFirestoreCollectionData(quotesQuery, {
    idField: "id",
  }) as { data: any[]; status: string };

  // Helper para convertir fecha de Firestore
  const getDate = (dateField: any): Date | null => {
    if (!dateField) return null;
    if (dateField.toDate && typeof dateField.toDate === 'function') {
      return dateField.toDate();
    }
    if (dateField instanceof Date) return dateField;
    if (typeof dateField === 'object' && dateField.seconds !== undefined) {
      return new Date(dateField.seconds * 1000);
    }
    if (typeof dateField === 'string' || typeof dateField === 'number') {
      const date = new Date(dateField);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  };

  // Procesar períodos de todos los presupuestos
  const periodos: PeriodoConPresupuesto[] = useMemo(() => {
    if (!quotes) return [];

    const allPeriodos: PeriodoConPresupuesto[] = [];

    quotes.forEach((quote, quoteIndex) => {
      if (!quote.periodos || !Array.isArray(quote.periodos)) return;

      quote.periodos.forEach((periodo: any, periodoIndex: number) => {
        const fechaInicio = getDate(periodo.fechaInicio);
        const fechaFin = getDate(periodo.fechaFin);

        if (!fechaInicio || !fechaFin) return;

        allPeriodos.push({
          id: `${quote.id}-${periodoIndex}`,
          presupuestoId: quote.id,
          presupuestoNumber: quote.number || 'S/N',
          clientName: quote.client?.name || 'Sin cliente',
          fechaInicio,
          fechaFin,
          dias: periodo.dias || 0,
          notas: periodo.notas,
          dispositivos: quote.items?.map((item: any) => ({
            productName: item.productName || 'Dispositivo',
            quantity: item.quantity || 1,
          })) || [],
          colorIndex: quoteIndex % COLORS.length,
        });
      });
    });

    return allPeriodos;
  }, [quotes]);

  // Obtener días del mes actual (incluyendo días de semanas adyacentes)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Lunes
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  // Obtener períodos que están activos en un día específico
  const getPeriodosForDay = (day: Date): PeriodoConPresupuesto[] => {
    return periodos.filter(periodo =>
      isWithinInterval(day, { start: periodo.fechaInicio, end: periodo.fechaFin })
    );
  };

  // Verificar si un período empieza en un día específico
  const periodoStartsOnDay = (periodo: PeriodoConPresupuesto, day: Date): boolean => {
    return format(periodo.fechaInicio, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
  };

  // Calcular cuántos días quedan del período en la semana actual
  const getDaysRemainingInWeek = (periodo: PeriodoConPresupuesto, day: Date): number => {
    const weekEnd = endOfWeek(day, { weekStartsOn: 1 });
    const endDate = periodo.fechaFin < weekEnd ? periodo.fechaFin : weekEnd;
    const daysRemaining = Math.ceil((endDate.getTime() - day.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return Math.min(daysRemaining, 7);
  };

  // Navegación de meses
  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToToday = () => setCurrentMonth(new Date());

  // Formatear moneda
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  // Placeholder para asignar ubicaciones
  const handleAsignarUbicaciones = (periodo: PeriodoConPresupuesto) => {
    toast.info("Función de asignar ubicaciones pendiente de implementar");
    // TODO: Implementar asignación de ubicaciones
  };

  // Placeholder para imprimir orden de fijación
  const handleImprimirOrden = (periodo: PeriodoConPresupuesto) => {
    toast.info("Función de imprimir orden pendiente de implementar");
    // TODO: Implementar impresión de orden de fijación
  };

  // Ordenar períodos por fecha de inicio
  const periodosSorted = useMemo(() => {
    return [...periodos].sort((a, b) => a.fechaInicio.getTime() - b.fechaInicio.getTime());
  }, [periodos]);

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarIcon className="h-6 w-6" />
            Salidas - Calendario de Ocupación
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Dispositivos ocupados según períodos de presupuestos aceptados
          </p>
        </div>
      </div>

      {/* Controles de navegación */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>
                Hoy
              </Button>
            </div>
            <h2 className="text-xl font-semibold capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: es })}
            </h2>
            <div className="text-sm text-slate-500">
              {periodos.length} período{periodos.length !== 1 ? 's' : ''} activo{periodos.length !== 1 ? 's' : ''}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendario */}
      {status === "loading" ? (
        <div className="flex justify-center my-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-4">
            {/* Días de la semana */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => (
                <div key={day} className="text-center text-sm font-medium text-slate-500 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Días del calendario */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, dayIndex) => {
                const periodosDelDia = getPeriodosForDay(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isCurrentDay = isToday(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[100px] border rounded-lg p-1 ${
                      isCurrentMonth ? 'bg-white' : 'bg-slate-50'
                    } ${isCurrentDay ? 'ring-2 ring-blue-500' : ''}`}
                  >
                    {/* Número del día */}
                    <div className={`text-sm font-medium mb-1 ${
                      isCurrentMonth ? 'text-slate-900' : 'text-slate-400'
                    } ${isCurrentDay ? 'text-blue-600' : ''}`}>
                      {format(day, 'd')}
                    </div>

                    {/* Períodos del día */}
                    <div className="space-y-1">
                      {periodosDelDia.map((periodo) => {
                        const startsToday = periodoStartsOnDay(periodo, day);
                        const color = COLORS[periodo.colorIndex];

                        // Solo mostrar la barra si el período empieza hoy o es lunes
                        const isMonday = day.getDay() === 1;
                        const shouldShowBar = startsToday || (isMonday && isWithinInterval(day, { start: periodo.fechaInicio, end: periodo.fechaFin }));

                        if (!shouldShowBar) return null;

                        // Calcular ancho de la barra
                        const daysInWeek = getDaysRemainingInWeek(periodo, day);
                        const widthPercent = (daysInWeek / 7) * 100;

                        return (
                          <div
                            key={periodo.id}
                            className={`${color.bg} ${color.text} ${color.hover} text-xs px-1 py-0.5 rounded cursor-pointer truncate transition-colors`}
                            style={{
                              width: `calc(${widthPercent * 7}% + ${(daysInWeek - 1) * 4}px)`,
                              position: 'relative',
                              zIndex: 10,
                            }}
                            onClick={() => setSelectedPeriodo(periodo)}
                            title={`${periodo.presupuestoNumber} - ${periodo.clientName}`}
                          >
                            {periodo.presupuestoNumber}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabla de Salidas */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Listado de Salidas</CardTitle>
        </CardHeader>
        <CardContent>
          {periodosSorted.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No hay salidas programadas
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Presupuesto</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="hidden md:table-cell">Fecha Inicio</TableHead>
                    <TableHead className="hidden md:table-cell">Fecha Fin</TableHead>
                    <TableHead className="hidden sm:table-cell">Días</TableHead>
                    <TableHead className="hidden lg:table-cell">Dispositivos</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periodosSorted.map((periodo) => {
                    const color = COLORS[periodo.colorIndex];
                    const totalDispositivos = periodo.dispositivos.reduce((sum, d) => sum + d.quantity, 0);

                    return (
                      <TableRow key={periodo.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded ${color.bg}`}></div>
                            <span className="font-medium">{periodo.presupuestoNumber}</span>
                          </div>
                        </TableCell>
                        <TableCell>{periodo.clientName}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          {format(periodo.fechaInicio, "dd/MM/yyyy", { locale: es })}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {format(periodo.fechaFin, "dd/MM/yyyy", { locale: es })}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {periodo.dias}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-sm text-slate-600">
                            {totalDispositivos} dispositivo{totalDispositivos !== 1 ? 's' : ''}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Asignar ubicaciones"
                              onClick={() => handleAsignarUbicaciones(periodo)}
                              className="bg-purple-600 hover:bg-purple-700 hover:text-white text-white h-8 w-8"
                            >
                              <MapPin className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Imprimir orden de fijación"
                              onClick={() => handleImprimirOrden(periodo)}
                              className="bg-amber-600 hover:bg-amber-700 hover:text-white text-white h-8 w-8"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de detalle del período */}
      <Dialog open={!!selectedPeriodo} onOpenChange={(open) => !open && setSelectedPeriodo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalle del Período</DialogTitle>
          </DialogHeader>
          {selectedPeriodo && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Presupuesto</p>
                  <p className="font-medium">{selectedPeriodo.presupuestoNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Cliente</p>
                  <p className="font-medium">{selectedPeriodo.clientName}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Fecha Inicio</p>
                  <p className="font-medium">{format(selectedPeriodo.fechaInicio, "dd/MM/yyyy", { locale: es })}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Fecha Fin</p>
                  <p className="font-medium">{format(selectedPeriodo.fechaFin, "dd/MM/yyyy", { locale: es })}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Duración</p>
                  <p className="font-medium">{selectedPeriodo.dias} días</p>
                </div>
              </div>

              {selectedPeriodo.notas && (
                <div>
                  <p className="text-sm text-slate-500">Notas</p>
                  <p className="text-sm">{selectedPeriodo.notas}</p>
                </div>
              )}

              <div>
                <p className="text-sm text-slate-500 mb-2">Dispositivos</p>
                <div className="space-y-1">
                  {selectedPeriodo.dispositivos.map((disp, idx) => (
                    <div key={idx} className="flex justify-between text-sm bg-slate-50 p-2 rounded">
                      <span>{disp.productName}</span>
                      <span className="font-medium">x{disp.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(`/publimar/viaPublica/presupuestos/${selectedPeriodo.presupuestoId}`, '_blank')}
                >
                  Ver Presupuesto Completo
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

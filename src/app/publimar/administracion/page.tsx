"use client";

import Link from "next/link";
import { useFirestore, useFirestoreCollectionData, useAuth as useFirebaseAuth } from "reactfire";
import { collection, query } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Wallet,
  Truck,
  Receipt,
  Users,
  CreditCard,
  BarChart3,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRoute } from "@/lib/permissions";
import collections from "@/lib/collections";
import CalendarAgenda from "@/components/calendar/CalendarAgenda";
import UserNotes from "@/components/notes/UserNotes";
import { ENoteSection } from "@/types/note";
import { EEventSection } from "@/types/event";

interface AdminSection {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const SECTIONS: AdminSection[] = [
  {
    title: "Finanzas",
    description:
      "Ingresos, gastos y movimientos de cuentas en un solo lugar. Filtros por departamento, método y cuenta.",
    href: "/publimar/administracion/finanzas",
    icon: TrendingUp,
  },
  {
    title: "Analíticas",
    description:
      "Ritmo de ventas, márgenes por departamento, gastos, liquidez y proyección a futuro.",
    href: "/publimar/administracion/analiticas",
    icon: BarChart3,
  },
  {
    title: "Cuentas",
    description:
      "Gestioná bancos, billeteras digitales y cajas de efectivo. Saldos en tiempo real.",
    href: "/publimar/administracion/cuentas",
    icon: Wallet,
  },
  {
    title: "Compras",
    description: "Compras a proveedores con filtros por departamento y forma de pago.",
    href: "/publimar/administracion/compras",
    icon: Truck,
  },
  {
    title: "Cuentas Corrientes",
    description: "Saldos pendientes con proveedores e historial de pagos.",
    href: "/publimar/administracion/cuentasCorrientes",
    icon: CreditCard,
  },
  {
    title: "Notas de Crédito",
    description:
      "Saldos a favor de clientes por devoluciones o acuerdos. Se aplican al crear órdenes de trabajo o facturaciones.",
    href: "/publimar/administracion/notas-credito",
    icon: Receipt,
  },
  {
    title: "Gastos Operativos",
    description:
      "Sueldos, alquiler, servicios e impuestos no asociados a una compra de proveedor.",
    href: "/publimar/administracion/gastos-operativos",
    icon: Receipt,
  },
  {
    title: "RRHH",
    description: "Empleados y liquidación de sueldos. Próximamente.",
    href: "/publimar/administracion/rrhh",
    icon: Users,
  },
];

export default function AdministracionPage() {
  const firestore = useFirestore();
  const firebaseUser = useFirebaseAuth();
  const { userData, userRole } = useAuth();

  const userName =
    userData?.displayName || firebaseUser.currentUser?.email || "Usuario";

  // Mostrar solo las secciones a las que el usuario tiene acceso (por rol o
  // por permisos puntuales habilitados desde Sudo).
  const visibleSections = SECTIONS.filter((s) =>
    canAccessRoute(userRole, s.href, userData?.permissions)
  );

  // Eventos del calendario de la sección Administración
  const eventsCollection = collection(firestore, collections.EVENTS);
  const { data: allEvents } = useFirestoreCollectionData(
    query(eventsCollection),
    { idField: "id" }
  );
  const events = allEvents?.filter(
    (event: any) =>
      !event.deleted && event.section === EEventSection.ADMINISTRACION
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Administración</h1>
          <p className="text-slate-600 text-sm mt-1">
            Centro de control financiero y administrativo de Publimar.
          </p>
        </div>
        {firebaseUser.currentUser?.uid && userData && (
          <UserNotes
            userId={firebaseUser.currentUser.uid}
            userName={userName}
            section={ENoteSection.ADMINISTRACION}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleSections.map((s) => (
              <Card key={s.href} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <s.icon className="h-5 w-5 text-blue-900" />
                    {s.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm text-slate-600">{s.description}</p>
                  <Button asChild variant="outline" className="self-start">
                    <Link href={s.href}>
                      Ir a {s.title} <ArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Columna derecha: Calendario/Agenda */}
        <div className="lg:col-span-1">
          <CalendarAgenda
            events={events || []}
            currentUserId={firebaseUser.currentUser?.uid || ""}
            currentUserName={userName}
            section={EEventSection.ADMINISTRACION}
          />
        </div>
      </div>
    </div>
  );
}

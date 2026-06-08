'use client';

import { useSigninCheck } from "reactfire";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Flag, Settings, Building2, ArrowRight, LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRoute } from "@/lib/permissions";

type ModuleCard = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  accent: string;
  buttonClass: string;
};

const ALL_MODULES: ModuleCard[] = [
  {
    href: "/publimar/banderas",
    title: "Banderas",
    description: "Productos, ventas, presupuestos y tienda online.",
    icon: Flag,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    accent: "from-blue-500 to-blue-600",
    buttonClass: "bg-blue-600 hover:bg-blue-700",
  },
  {
    href: "/publimar/administracion",
    title: "Administración",
    description: "Finanzas, cuentas, gastos operativos y RRHH.",
    icon: Settings,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    accent: "from-emerald-500 to-emerald-600",
    buttonClass: "bg-emerald-600 hover:bg-emerald-700",
  },
  {
    href: "/publimar/viaPublica",
    title: "Vía Pública",
    description: "Ubicaciones, exhibiciones, salidas y facturación.",
    icon: Building2,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    accent: "from-purple-500 to-purple-600",
    buttonClass: "bg-purple-600 hover:bg-purple-700",
  },
];

export default function DashboardPage() {
  const { status, data: signInCheckResult } = useSigninCheck();
  const { userRole, userData } = useAuth();

  if (status === "loading") {
    return <div>Cargando...</div>;
  }

  if (!signInCheckResult.signedIn) {
    return null; // El DashboardLayout se encargará de manejar esto
  }

  const visibleModules = ALL_MODULES.filter((m) =>
    canAccessRoute(userRole, m.href, userData?.permissions)
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-800">
            Publimar - Panel de Control
          </h1>
          <p className="text-gray-500 mt-2">Elegí un módulo para comenzar</p>
        </div>

        <div className="flex flex-wrap justify-center gap-6">
          {visibleModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Card
                key={mod.href}
                className="group relative w-full sm:w-72 overflow-hidden border border-gray-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
              >
                <div className={`h-1 w-full bg-gradient-to-r ${mod.accent}`} />
                <CardContent className="p-7 text-center">
                  <div
                    className={`w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center ${mod.iconBg} group-hover:scale-105 transition-transform duration-200`}
                  >
                    <Icon className={`w-8 h-8 ${mod.iconColor}`} />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-800">
                    {mod.title}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1 mb-6 min-h-[2.5rem]">
                    {mod.description}
                  </p>
                  <Button
                    asChild
                    size="lg"
                    className={`w-full font-medium ${mod.buttonClass}`}
                  >
                    <Link href={mod.href} className="flex items-center justify-center gap-2">
                      Acceder
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>

    // CÓDIGO COMENTADO PARA FUTURO USO:
    // <div>
    //   <h1 className="text-2xl font-bold mb-6">Publimar</h1>

    //   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
    //     <Card>
    //       <CardHeader className="pb-2">
    //         <CardTitle className="text-sm font-medium text-slate-500">
    //           Productos
    //         </CardTitle>
    //       </CardHeader>
    //       <CardContent>
    //         <div className="text-2xl font-bold">42</div>
    //         <p className="text-xs text-slate-500 mt-1">12 con bajo stock</p>
    //       </CardContent>
    //     </Card>
    //     <Card>
    //       <CardHeader className="pb-2">
    //         <CardTitle className="text-sm font-medium text-slate-500">
    //           Clientes
    //         </CardTitle>
    //       </CardHeader>
    //       <CardContent>
    //         <div className="text-2xl font-bold">18</div>
    //         <p className="text-xs text-slate-500 mt-1">2 nuevos este mes</p>
    //       </CardContent>
    //     </Card>
    //     <Card>
    //       <CardHeader className="pb-2">
    //         <CardTitle className="text-sm font-medium text-slate-500">
    //           Presupuestos
    //         </CardTitle>
    //       </CardHeader>
    //       <CardContent>
    //         <div className="text-2xl font-bold">7</div>
    //         <p className="text-xs text-slate-500 mt-1">3 pendientes de envío</p>
    //       </CardContent>
    //     </Card>
    //     <Card>
    //       <CardHeader className="pb-2">
    //         <CardTitle className="text-sm font-medium text-slate-500">
    //           Pedidos
    //         </CardTitle>
    //       </CardHeader>
    //       <CardContent>
    //         <div className="text-2xl font-bold">4</div>
    //         <p className="text-xs text-slate-500 mt-1">2 en proceso</p>
    //       </CardContent>
    //     </Card>
    //   </div>

    //   <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    //     <Card>
    //       <CardHeader>
    //         <CardTitle>Pedidos recientes</CardTitle>
    //       </CardHeader>
    //       <CardContent>
    //         <div className="space-y-4">
    //           <div className="flex justify-between items-center">
    //             <div>
    //               <p className="font-medium">Ayuntamiento de Mar del Plata</p>
    //               <p className="text-sm text-slate-500">
    //                 Banderas ceremoniales
    //               </p>
    //             </div>
    //             <div className="flex items-center">
    //               <span className="inline-block w-2 h-2 bg-amber-500 rounded-full mr-2"></span>
    //               <span className="text-sm">En proceso</span>
    //             </div>
    //           </div>
    //           <div className="flex justify-between items-center">
    //             <div>
    //               <p className="font-medium">Hotel Costa Galana</p>
    //               <p className="text-sm text-slate-500">
    //                 Banderas internacionales
    //               </p>
    //             </div>
    //             <div className="flex items-center">
    //               <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
    //               <span className="text-sm">Completado</span>
    //             </div>
    //           </div>
    //           <div className="flex justify-between items-center">
    //             <div>
    //               <p className="font-medium">Club Náutico</p>
    //               <p className="text-sm text-slate-500">Banderas náuticas</p>
    //             </div>
    //             <div className="flex items-center">
    //               <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
    //               <span className="text-sm">Pendiente</span>
    //             </div>
    //           </div>
    //         </div>
    //       </CardContent>
    //     </Card>

    //     <Card>
    //       <CardHeader>
    //         <CardTitle>Productos con bajo stock</CardTitle>
    //       </CardHeader>
    //       <CardContent>
    //         <div className="space-y-4">
    //           <div className="flex justify-between items-center">
    //             <div>
    //               <p className="font-medium">Bandera Argentina</p>
    //               <p className="text-sm text-slate-500">200x120cm</p>
    //             </div>
    //             <span className="text-red-500 font-medium">2 unidades</span>
    //           </div>
    //           <div className="flex justify-between items-center">
    //             <div>
    //               <p className="font-medium">Bandera Brasil</p>
    //               <p className="text-sm text-slate-500">150x90cm</p>
    //             </div>
    //             <span className="text-red-500 font-medium">3 unidades</span>
    //           </div>
    //           <div className="flex justify-between items-center">
    //             <div>
    //               <p className="font-medium">Mástil de aluminio</p>
    //               <p className="text-sm text-slate-500">2.5m</p>
    //             </div>
    //             <span className="text-amber-500 font-medium">5 unidades</span>
    //           </div>
    //           <div className="flex justify-between items-center">
    //             <div>
    //               <p className="font-medium">Soporte para pared</p>
    //               <p className="text-sm text-slate-500">Estándar</p>
    //             </div>
    //             <span className="text-amber-500 font-medium">4 unidades</span>
    //           </div>
    //         </div>
    //       </CardContent>
    //     </Card>
    //   </div>
    // </div>
  );
} 
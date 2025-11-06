'use client';

import { useSigninCheck } from "reactfire";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Flag, Settings, Building2 } from "lucide-react";

export default function DashboardPage() {
  const { status, data: signInCheckResult } = useSigninCheck();

  if (status === "loading") {
    return <div>Cargando...</div>;
  }

  if (!signInCheckResult.signedIn) {
    return null; // El DashboardLayout se encargará de manejar esto
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-800 mb-8 text-center">
          Publimar - Panel de Control
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Botón Banderas */}
          <Card className="hover:shadow-lg transition-shadow duration-200 border-2 hover:border-blue-300">
            <CardContent className="p-8 text-center">
              <div className="mb-6">
                <Flag className="w-16 h-16 mx-auto text-blue-600" />
              </div>
              <h2 className="text-2xl font-semibold mb-6 text-gray-800">
                Banderas
              </h2>
              <Button 
                asChild
                size="lg" 
                className="w-full py-3 text-lg font-semibold bg-blue-600 hover:bg-blue-700"
              >
                <Link href="/publimar/banderas">Acceder a Banderas</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Botón Administración */}
          <Card className="hover:shadow-lg transition-shadow duration-200 border-2 hover:border-green-300">
            <CardContent className="p-8 text-center">
              <div className="mb-6">
                <Settings className="w-16 h-16 mx-auto text-green-600" />
              </div>
              <h2 className="text-2xl font-semibold mb-6 text-gray-800">
                Administración
              </h2>
              <Button 
                asChild
                size="lg" 
                className="w-full py-3 text-lg font-semibold bg-green-600 hover:bg-green-700"
              >
                <Link href="/publimar/administracion">Acceder a Admin</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Botón Vía Pública */}
          <Card className="hover:shadow-lg transition-shadow duration-200 border-2 hover:border-purple-300">
            <CardContent className="p-8 text-center">
              <div className="mb-6">
                <Building2 className="w-16 h-16 mx-auto text-purple-600" />
              </div>
              <h2 className="text-2xl font-semibold mb-6 text-gray-800">
                Vía Pública
              </h2>
              <Button 
                asChild
                size="lg" 
                className="w-full py-3 text-lg font-semibold bg-purple-600 hover:bg-purple-700"
              >
                <Link href="/publimar/viaPublica">Acceder a Vía Pública</Link>
              </Button>
            </CardContent>
          </Card>
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
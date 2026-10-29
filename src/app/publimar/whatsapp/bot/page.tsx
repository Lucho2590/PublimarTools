"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminOrAbove } from "@/lib/permissions";
import { SimulatorTab } from "./components/SimulatorTab";
import { TrainingTab } from "./components/TrainingTab";
import { LearnTab } from "./components/LearnTab";
import { MetricsTab } from "./components/MetricsTab";
import { ConfigTab } from "./components/ConfigTab";

export default function WhatsappBotPage() {
  const { userRole } = useAuth();
  const canEdit = isAdminOrAbove(userRole);
  const [tab, setTab] = useState("simulador");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Bot de Banderas</h1>
        <p className="text-sm text-slate-600">
          Responde con reglas y menús; la IA entra solo cuando no alcanza. Probalo en el simulador y
          enseñale lo que no entendió.
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="simulador">Simulador</TabsTrigger>
          {canEdit && <TabsTrigger value="aprender">Por aprender</TabsTrigger>}
          {canEdit && <TabsTrigger value="entrenamiento">Entrenamiento</TabsTrigger>}
          <TabsTrigger value="metricas">Métricas</TabsTrigger>
          {canEdit && <TabsTrigger value="config">Configuración</TabsTrigger>}
        </TabsList>
        <TabsContent value="simulador" className="mt-4">
          <SimulatorTab />
        </TabsContent>
        {canEdit && (
          <TabsContent value="aprender" className="mt-4">
            <LearnTab />
          </TabsContent>
        )}
        {canEdit && (
          <TabsContent value="entrenamiento" className="mt-4">
            <TrainingTab />
          </TabsContent>
        )}
        <TabsContent value="metricas" className="mt-4">
          <MetricsTab />
        </TabsContent>
        {canEdit && (
          <TabsContent value="config" className="mt-4">
            <ConfigTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

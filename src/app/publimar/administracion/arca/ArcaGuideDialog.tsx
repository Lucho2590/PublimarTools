"use client";

import { ExternalLink, Info, Lightbulb, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type TGuideTab = "antes" | "homologacion" | "produccion" | "problemas";

const ARCA_LOGIN = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";

type TStep = {
  title: string;
  where?: string;
  body: React.ReactNode;
  tip?: React.ReactNode;
  link?: { href: string; label: string };
};

function Steps({ steps }: { steps: TStep[] }) {
  return (
    <ol className="relative space-y-5 pl-1">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-4">
          <div className="flex flex-col items-center">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
              {i + 1}
            </span>
            {i < steps.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
          </div>
          <div className="flex-1 pb-1 space-y-1.5">
            <p className="font-semibold text-slate-900 leading-7">{s.title}</p>
            {s.where && (
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.where}</p>
            )}
            <div className="text-sm text-slate-700 space-y-1.5">{s.body}</div>
            {s.tip && (
              <div className="flex gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" />
                <div>{s.tip}</div>
              </div>
            )}
            {s.link && (
              <a
                href={s.link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
              >
                {s.link.label}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Note({ tone = "info", children }: { tone?: "info" | "warn"; children: React.ReactNode }) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "flex gap-2 rounded-lg border px-3 py-2.5 text-sm",
        tone === "warn" ? "bg-red-50 border-red-200 text-red-900" : "bg-blue-50 border-blue-200 text-blue-900",
      )}
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

const b = (t: string) => <b className="font-semibold text-slate-900">{t}</b>;

const HOMOLOGACION: TStep[] = [
  {
    title: "Generá el pedido de certificado en esta pantalla",
    where: "PublimarTools → Certificado digital → Pruebas",
    body: (
      <p>
        Primero guardá CUIT y razón social en {b("Datos del emisor")}. En {b("CUIT de quien entra a ARCA")} poné el
        CUIT de la persona que va a hacer el trámite con su clave fiscal (en una SRL, el socio gerente; ARCA emite el
        certificado a su nombre, no al de la empresa). Después tocá {b("Generar CSR")}: se descarga un archivo{" "}
        <code>.csr</code>. La clave privada queda guardada (cifrada) en el servidor y no hace falta tocarla.
      </p>
    ),
  },
  {
    title: "Adherí el servicio de certificados de prueba",
    where: "ARCA → Administrador de Relaciones de Clave Fiscal",
    body: (
      <p>
        Entrá con la clave fiscal del titular → {b("Adherir servicio")} → ARCA → Servicios interactivos →{" "}
        {b("WSASS - Autogestión Certificados Homologación")} → Confirmar. Puede tardar unos minutos en aparecer en el
        menú.
      </p>
    ),
    link: { href: ARCA_LOGIN, label: "Ingresar a ARCA" },
  },
  {
    title: "Creá el certificado con el CSR",
    where: "ARCA → WSASS → Nuevo Certificado",
    body: (
      <p>
        Poné un nombre (por ejemplo <code>banderas-app</code>), abrí el <code>.csr</code> con un editor de texto,
        pegá todo su contenido (incluidas las líneas BEGIN/END) y tocá {b("Crear DN y obtener certificado")}. ARCA
        muestra el certificado en pantalla: copialo completo.
      </p>
    ),
  },
  {
    title: "Autorizá los dos servicios",
    where: "ARCA → WSASS → Crear autorización a servicio",
    body: (
      <p>
        Elegí el certificado recién creado y autorizalo para {b("wsfe")} (facturación). Después repetí el paso y
        autorizalo para {b("ws_sr_constancia_inscripcion")} (validar CUIT en el padrón). Si el certificado es de una
        persona y factura una empresa, en {b("CUIT representada")} poné el CUIT de la empresa.
      </p>
    ),
    tip: <>Si falta la autorización de <code>ws_sr_constancia_inscripcion</code>, se puede facturar pero el botón &quot;Validar en ARCA&quot; falla.</>,
  },
  {
    title: "Cargá el certificado y probá",
    where: "PublimarTools → Certificado digital → Pruebas",
    body: (
      <p>
        Pegá el certificado (o subí el archivo) → {b("Guardar certificado")}. Con el ambiente en {b("Pruebas")}, tocá{" "}
        {b("Probar conexión")}: las tres verificaciones tienen que quedar en verde.
      </p>
    ),
    tip: <>En pruebas el punto de venta puede ser cualquiera (por ejemplo 1). Las facturas salen marcadas &quot;sin validez fiscal&quot;.</>,
  },
];

const PRODUCCION: TStep[] = [
  {
    title: "Generá el pedido de certificado de producción",
    where: "PublimarTools → Certificado digital → Producción",
    body: <p>Tocá {b("Generar CSR")} en la pestaña Producción. Es un pedido distinto al de pruebas.</p>,
  },
  {
    title: "Subí el CSR y descargá el certificado",
    where: "ARCA → Administración de Certificados Digitales",
    body: (
      <p>
        Si no aparece el servicio, adherilo desde el Administrador de Relaciones. Elegí tu CUIT (el que cargaste como
        &quot;quien entra a ARCA&quot;) →{" "}
        {b("Agregar alias")} → poné un nombre, subí el <code>.csr</code> → {b("Agregar alias")}. Después entrá al
        alias y {b("descargá el certificado")} (<code>.crt</code>).
      </p>
    ),
    link: { href: ARCA_LOGIN, label: "Ingresar a ARCA" },
  },
  {
    title: "Asociá el certificado a los dos servicios",
    where: "ARCA → Administrador de Relaciones de Clave Fiscal → Nueva Relación",
    body: (
      <>
        <p>
          Si el certificado es tuyo y factura una empresa, al entrar elegí {b("representar a la empresa")}. Después{" "}
          {b("Buscar")} → ARCA → WebServices → {b("Facturación Electrónica")}. En {b("Representante")} elegí el
          certificado (computador fiscal) con el alias que creaste → Confirmar.
        </p>
        <p>
          Repetí con {b("Consulta a Padrón Constancia de Inscripción")} para que funcione la validación de CUIT.
        </p>
      </>
    ),
  },
  {
    title: "Creá un punto de venta para web services",
    where: "ARCA → Administración de Puntos de Venta y Domicilios",
    body: (
      <p>
        {b("Agregar")} → número nuevo (por ejemplo 3) → sistema{" "}
        {b("Factura Electrónica - Monotributo / Responsable Inscripto - Web Services")} → domicilio → Aceptar. Cargá
        ese número en {b("Punto de venta")} de esta pantalla.
      </p>
    ),
    tip: <>Tiene que ser un punto de venta nuevo: el que se usa en &quot;Comprobantes en línea&quot; no sirve para web services.</>,
  },
  {
    title: "Cargá el certificado, pasá a producción y probá",
    where: "PublimarTools",
    body: (
      <p>
        Subí el <code>.crt</code> en la pestaña Producción → {b("Guardar certificado")}. Cambiá el ambiente a{" "}
        {b("Producción")} → {b("Probar conexión")}. Con todo en verde, emití una primera factura chica para controlar.
      </p>
    ),
  },
];

const PROBLEMAS: { error: string; causa: React.ReactNode }[] = [
  {
    error: "WSASS rechaza el CSR / el CUIT no coincide",
    causa: <>El CSR tiene que ir a nombre de quien entró a ARCA. Generá uno nuevo con su CUIT en &quot;CUIT de quien entra a ARCA&quot;.</>,
  },
  {
    error: "\"ARCA rechazó el certificado\" / cms.cert…",
    causa: <>El certificado no corresponde al ambiente (uno de pruebas en producción o al revés), está vencido o no lo emitió ARCA. Generá un CSR nuevo en la pestaña correcta.</>,
  },
  {
    error: "\"No está autorizado para este servicio\"",
    causa: <>Falta la autorización (pruebas: WSASS → Crear autorización) o la relación (producción: Administrador de Relaciones) para <code>wsfe</code> o para el padrón.</>,
  },
  {
    error: "Punto de venta inválido o no habilitado",
    causa: <>El número cargado no existe o no es de tipo &quot;Web Services&quot;. Revisalo en Administración de Puntos de Venta.</>,
  },
  {
    error: "\"Ya hay un ticket de acceso vigente\"",
    causa: <>Se pidió acceso desde otro sistema con el mismo certificado. Esperá unos minutos y reintentá.</>,
  },
  {
    error: "El padrón no devuelve datos de un CUIT",
    causa: <>En pruebas el padrón tiene datos de ejemplo y muchos CUIT reales no aparecen. Con el certificado de producción se consultan los reales.</>,
  },
  {
    error: "\"El certificado no corresponde al último CSR\"",
    causa: <>Se generó otro CSR después de pedir el certificado. Usá el certificado del último CSR o pedí uno nuevo.</>,
  },
];

export function ArcaGuideDialog({
  open,
  onOpenChange,
  tab,
  onTabChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tab: TGuideTab;
  onTabChange: (t: TGuideTab) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cómo configurar ARCA</DialogTitle>
          <DialogDescription>
            Lo que hay que hacer en la web de ARCA (con la clave fiscal del titular) para que la app pueda facturar y
            validar CUITs.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => onTabChange(v as TGuideTab)}>
          <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4 h-auto">
            <TabsTrigger value="antes">Antes de empezar</TabsTrigger>
            <TabsTrigger value="homologacion">1 · Pruebas</TabsTrigger>
            <TabsTrigger value="produccion">2 · Producción</TabsTrigger>
            <TabsTrigger value="problemas">Problemas</TabsTrigger>
          </TabsList>

          <TabsContent value="antes" className="space-y-4 pt-3 focus-visible:ring-0 focus-visible:ring-offset-0">
            <p className="text-sm text-slate-700">
              Se configura dos veces: primero en {b("pruebas (homologación)")}, donde las facturas no tienen validez
              fiscal, y después en {b("producción")}. Cada ambiente tiene su propio certificado.
            </p>
            <ul className="space-y-2 text-sm text-slate-700">
              {[
                <>Clave fiscal {b("nivel 3")} del titular del CUIT de Banderas o, si es una sociedad, de quien la representa (el certificado sale a nombre de esa persona).</>,
                <>Banderas tiene que ser {b("Responsable Inscripto")}: es la condición que emite Factura A y B.</>,
                <>La variable {b("ARCA_ENCRYPTION_KEY")} cargada en el servidor (si falta, esta pantalla lo avisa arriba).</>,
                <>Unos 20 minutos para pruebas y otros 20 para producción.</>,
              ].map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Note>
              El orden es: datos del emisor → CSR → certificado en ARCA → autorizar servicios → cargar certificado →
              probar. La pestaña de cada ambiente lo explica paso a paso.
            </Note>
          </TabsContent>

          <TabsContent value="homologacion" className="pt-3 focus-visible:ring-0 focus-visible:ring-offset-0">
            <Steps steps={HOMOLOGACION} />
          </TabsContent>

          <TabsContent value="produccion" className="space-y-4 pt-3 focus-visible:ring-0 focus-visible:ring-offset-0">
            <Note tone="warn">En producción las facturas tienen validez fiscal. Conviene terminar las pruebas primero.</Note>
            <Steps steps={PRODUCCION} />
          </TabsContent>

          <TabsContent value="problemas" className="pt-3 focus-visible:ring-0 focus-visible:ring-offset-0">
            <div className="divide-y rounded-lg border">
              {PROBLEMAS.map((p) => (
                <div key={p.error} className="px-4 py-3 space-y-1">
                  <p className="text-sm font-semibold text-slate-900">{p.error}</p>
                  <p className="text-sm text-slate-600">{p.causa}</p>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

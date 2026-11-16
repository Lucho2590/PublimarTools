import { Metadata } from "next";

// Política de privacidad PÚBLICA (sin login). Meta la exige para publicar la
// app de WhatsApp. Se renderiza en el servidor para que la lea sin JavaScript.

export const metadata: Metadata = {
  title: "Política de privacidad — La Casa de las Banderas",
  description: "Cómo usamos los datos de quienes nos escriben por WhatsApp.",
};

const BUSINESS = "La Casa de las Banderas (Publimar)";
const CITY = "Mar del Plata, Argentina";
/** Mail de contacto para consultas de privacidad (vacío = solo WhatsApp/local). */
const CONTACT_EMAIL = "";
const UPDATED = "15 de noviembre de 2026";

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-2">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="space-y-2 text-slate-700">{children}</div>
    </section>
  );
}

export default function PrivacidadPage() {
  return (
    <main className="h-screen overflow-y-auto bg-slate-50">
      <article className="mx-auto max-w-3xl space-y-8 px-6 py-12 leading-relaxed">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-slate-900">Política de privacidad</h1>
          <p className="text-slate-600">
            {BUSINESS} · {CITY} · Última actualización: {UPDATED}
          </p>
        </header>

        <p className="text-slate-700">
          Esta política explica qué datos usamos cuando nos escribís por WhatsApp o nos hacés un pedido, para qué los
          usamos y qué podés hacer con ellos.
        </p>

        <Section title="Qué datos usamos">
          <ul className="list-disc space-y-1 pl-6">
            <li>Tu número de teléfono y el nombre de tu perfil de WhatsApp.</li>
            <li>Los mensajes que nos mandás y los que te respondemos (texto, fotos y archivos que compartas).</li>
            <li>
              Los datos que nos des para un pedido o presupuesto: nombre, empresa, CUIT, dirección de entrega y
              detalles del trabajo.
            </li>
          </ul>
        </Section>

        <Section title="Para qué los usamos">
          <ul className="list-disc space-y-1 pl-6">
            <li>Responder tus consultas y atenderte.</li>
            <li>Armar presupuestos, tomar pedidos, coordinar entregas y facturar.</li>
            <li>Mantener el historial de la charla para no pedirte los mismos datos dos veces.</li>
          </ul>
          <p>
            Parte de las respuestas las da un asistente automático con inteligencia artificial, que usa la información
            de nuestros productos y de tu consulta. Cuando hace falta, la charla pasa a una persona del equipo. No
            usamos tus datos para publicidad ni los vendemos.
          </p>
        </Section>

        <Section title="Con quién se comparten">
          <p>Solo con los servicios que necesitamos para funcionar, que tratan los datos por cuenta nuestra:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Meta (WhatsApp Business), para recibir y enviar los mensajes.</li>
            <li>Google Cloud / Firebase y Vercel, donde se guardan los datos y funciona el sistema.</li>
            <li>Un proveedor de inteligencia artificial, para generar las respuestas automáticas.</li>
            <li>ARCA (ex AFIP), cuando corresponde emitir una factura.</li>
          </ul>
        </Section>

        <Section title="Cuánto tiempo los guardamos">
          <p>
            Mientras sigamos teniendo relación comercial con vos, y después el tiempo que exijan las normas contables
            e impositivas. Podés pedirnos que borremos tus datos en cualquier momento (ver abajo).
          </p>
        </Section>

        <Section title="Tus derechos">
          <p>
            Podés pedir acceder a tus datos, corregirlos o que los eliminemos, y dejar de recibir mensajes nuestros,
            según la Ley 25.326 de Protección de Datos Personales. La Agencia de Acceso a la Información Pública, como
            órgano de control de esa ley, atiende las denuncias y reclamos por incumplimientos.
          </p>
        </Section>

        <Section id="borrar-datos" title="Cómo pedir que borremos tus datos">
          <p>
            Escribinos por WhatsApp al mismo número con el que hablaste con nosotros, diciendo &quot;quiero que borren
            mis datos&quot;
            {CONTACT_EMAIL ? (
              <>
                , o mandá un mail a <a className="text-blue-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </>
            ) : null}
            . Lo hacemos dentro de los 30 días y te confirmamos cuando esté hecho.
          </p>
        </Section>

        <Section title="Contacto">
          <p>
            {BUSINESS}, {CITY}.{" "}
            {CONTACT_EMAIL ? (
              <>
                Mail: <a className="text-blue-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
              </>
            ) : (
              "Por WhatsApp o en el local."
            )}
          </p>
        </Section>
      </article>
    </main>
  );
}

// PDF de un comprobante ARCA autorizado (Factura / NC, A o B), con el QR
// obligatorio (RG 4892) y las leyendas de RG 5003 / RG 5614 que correspondan.
// Se genera en el navegador; jsPDF y qrcode se cargan bajo demanda.

import type { TArcaInvoice } from "@/types/arca";
import {
  CONDICION_FISCAL,
  LEYENDA_TRANSPARENCIA,
  cbteTipoLabel,
  docTipoLabel,
} from "./constants";
import { formatCuit } from "@/lib/cuit";
import { round2 } from "./amounts";

const money = (n: number) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

const isoToAr = (iso?: string) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

/** URL del QR según la especificación de ARCA (JSON en base64). */
export function arcaQrUrl(inv: TArcaInvoice): string {
  const payload = {
    ver: 1,
    fecha: inv.fecha,
    cuit: Number(inv.emisor.cuit),
    ptoVta: inv.puntoVenta,
    tipoCmp: inv.cbteTipo,
    nroCmp: Number(inv.numero),
    importe: inv.impTotal,
    moneda: "PES",
    ctz: 1,
    tipoDocRec: inv.receptor.docTipo,
    nroDocRec: Number(inv.receptor.docNro),
    tipoCodAut: "E",
    codAut: Number(inv.cae),
  };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
}

export async function downloadArcaInvoicePdf(inv: TArcaInvoice): Promise<void> {
  const pdf = await buildArcaInvoicePdf(inv);
  pdf.save(`${`${cbteTipoLabel(inv.cbteTipo)} ${inv.numeroFormateado}`.replace(/\s+/g, "_")}.pdf`);
}

export async function buildArcaInvoicePdf(inv: TArcaInvoice) {
  if (inv.status !== "authorized" || !inv.cae || !inv.numero) {
    throw new Error("El comprobante no está autorizado por ARCA");
  }
  const [{ default: jsPDF }, { default: autoTable }, QRCode] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    import("qrcode"),
  ]);

  const pdf = new jsPDF("p", "mm", "a4");
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 10;
  const mid = W / 2;
  const letraA = inv.letra === "A";
  const titulo = inv.kind === "nc" ? "NOTA DE CRÉDITO" : "FACTURA";

  if (inv.environment !== "produccion") {
    pdf.setTextColor(220, 38, 38);
    pdf.setFontSize(9);
    pdf.text("HOMOLOGACIÓN — COMPROBANTE DE PRUEBA SIN VALIDEZ FISCAL", mid, 6, { align: "center" });
    pdf.setTextColor(0, 0, 0);
  }

  // ---- Encabezado: emisor | letra | datos del comprobante ----
  const top = 9;
  const headH = 48;
  pdf.setLineWidth(0.3);
  pdf.rect(M, top, W - 2 * M, headH);
  pdf.line(mid, top + 14, mid, top + headH);
  // Recuadro de la letra
  pdf.setFillColor(255, 255, 255);
  pdf.rect(mid - 8, top, 16, 14, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text(inv.letra, mid, top + 9, { align: "center" });
  pdf.setFontSize(6.5);
  pdf.text(`COD. ${String(inv.cbteTipo).padStart(2, "0")}`, mid, top + 12.5, { align: "center" });

  // Emisor
  pdf.setFontSize(13);
  const razonLines = pdf.splitTextToSize(inv.emisor.razonSocial || "-", mid - M - 14);
  pdf.text(razonLines, M + 4, top + 9);
  pdf.setFontSize(8.5);
  let y = top + 9 + razonLines.length * 5.5 + 2;
  const labeled = (label: string, value: string, x: number, yy: number, maxW = mid - M - 8) => {
    pdf.setFont("helvetica", "bold");
    pdf.text(`${label}: `, x, yy);
    const lw = pdf.getTextWidth(`${label}: `);
    pdf.setFont("helvetica", "normal");
    const lines = pdf.splitTextToSize(value || "-", maxW - lw);
    pdf.text(lines, x + lw, yy);
    return yy + lines.length * 4.2;
  };
  y = labeled("Razón Social", inv.emisor.razonSocial, M + 4, y);
  y = labeled("Domicilio Comercial", inv.emisor.domicilioComercial, M + 4, y);
  labeled("Condición frente al IVA", inv.emisor.condicionIva, M + 4, y);

  // Datos del comprobante
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(titulo, mid + 10, top + 9);
  pdf.setFontSize(8.5);
  const [pv, nro] = (inv.numeroFormateado || "").split("-");
  let ry = top + 16;
  ry = labeled("Punto de Venta", pv || String(inv.puntoVenta), mid + 10, ry, W - M - mid - 12);
  ry = labeled("Comp. Nro", nro || String(inv.numero), mid + 10, ry, W - M - mid - 12);
  ry = labeled("Fecha de Emisión", isoToAr(inv.fecha), mid + 10, ry, W - M - mid - 12);
  ry += 1.5;
  ry = labeled("CUIT", formatCuit(inv.emisor.cuit), mid + 10, ry, W - M - mid - 12);
  ry = labeled("Ingresos Brutos", inv.emisor.iibb, mid + 10, ry, W - M - mid - 12);
  labeled("Fecha de Inicio de Actividades", inv.emisor.inicioActividades, mid + 10, ry, W - M - mid - 12);

  // ---- Receptor ----
  const rTop = top + headH + 2;
  const r = inv.receptor;
  const docValue = r.docTipo === 80 ? formatCuit(r.docNro) : r.docTipo === 96 ? r.docNro : "-";
  const condicionLabel = CONDICION_FISCAL[r.condicion]?.printLabel || "-";
  const asociado =
    inv.kind === "nc" && inv.facturaAsociadaNumero && inv.facturaAsociadaCbteTipo
      ? `${cbteTipoLabel(inv.facturaAsociadaCbteTipo)} ${inv.facturaAsociadaNumero}`
      : null;
  const rH = asociado ? 26 : 22;
  pdf.rect(M, rTop, W - 2 * M, rH);
  let ly = rTop + 6;
  ly = labeled(docTipoLabel(r.docTipo), docValue, M + 4, ly);
  ly = labeled("Condición frente al IVA", condicionLabel, M + 4, ly);
  if (asociado) labeled("Comprobante asociado", asociado, M + 4, ly);
  let ry2 = rTop + 6;
  ry2 = labeled("Apellido y Nombre / Razón Social", r.razonSocial, mid, ry2, W - M - mid - 4);
  labeled("Domicilio", r.domicilio || "-", mid, ry2, W - M - mid - 4);

  // ---- Ítems ----
  // En la A los precios van netos de IVA; en la B, finales.
  const factor = letraA ? 1.21 : 1;
  const head = letraA
    ? [["Descripción", "Cant.", "Precio Unit.", "Subtotal", "IVA", "Subtotal c/IVA"]]
    : [["Descripción", "Cant.", "Precio Unit.", "Subtotal"]];
  const body = inv.items.map((it) =>
    letraA
      ? [
          it.descripcion,
          String(it.cantidad),
          money(round2(it.precioUnitario / factor)),
          money(round2(it.subtotal / factor)),
          "21%",
          money(it.subtotal),
        ]
      : [it.descripcion, String(it.cantidad), money(it.precioUnitario), money(it.subtotal)],
  );
  autoTable(pdf, {
    startY: rTop + rH + 3,
    head,
    body,
    theme: "grid",
    margin: { left: M, right: M },
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold" },
    columnStyles: letraA
      ? { 1: { halign: "right", cellWidth: 14 }, 2: { halign: "right", cellWidth: 26 }, 3: { halign: "right", cellWidth: 26 }, 4: { halign: "center", cellWidth: 12 }, 5: { halign: "right", cellWidth: 28 } }
      : { 1: { halign: "right", cellWidth: 16 }, 2: { halign: "right", cellWidth: 30 }, 3: { halign: "right", cellWidth: 30 } },
  });

  // ---- Totales + leyendas; el pie (QR + CAE) va anclado abajo ----
  let ty = ((pdf as any).lastAutoTable?.finalY ?? rTop + rH + 20) + 6;
  if (ty > H - M - 30 - 45) {
    pdf.addPage();
    ty = M + 10;
  }
  const totalsX = W - M - 70;
  const totalRow = (label: string, value: number, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(bold ? 10 : 9);
    pdf.text(label, totalsX, ty);
    pdf.text(`$ ${money(value)}`, W - M - 2, ty, { align: "right" });
    ty += bold ? 6 : 5;
  };
  if (letraA) {
    totalRow("Importe Neto Gravado:", inv.impNeto);
    totalRow("IVA 21%:", inv.impIVA);
    totalRow("Importe Total:", inv.impTotal, true);
  } else {
    totalRow("Subtotal:", inv.impTotal);
    totalRow("Importe Total:", inv.impTotal, true);
  }

  let ley = ty + 2;
  pdf.setFontSize(7.5);
  for (const leyenda of inv.leyendas || []) {
    if (leyenda === LEYENDA_TRANSPARENCIA) {
      pdf.setFont("helvetica", "bold");
      pdf.text(leyenda, M, ley);
      ley += 4;
      pdf.setFont("helvetica", "normal");
      pdf.text(`IVA Contenido: $ ${money(inv.impIVA)}`, M, ley);
      ley += 4;
      pdf.text("Otros Impuestos Nacionales Indirectos: $ 0,00", M, ley);
      ley += 5;
    } else {
      pdf.setFont("helvetica", "italic");
      const lines = pdf.splitTextToSize(leyenda, W - 2 * M);
      pdf.text(lines, M, ley);
      ley += lines.length * 3.6 + 2;
    }
  }

  // Pie: QR + CAE
  const qrSize = 30;
  const qrY = H - M - qrSize;
  const qrData = await QRCode.toDataURL(arcaQrUrl(inv), { margin: 0, width: 300 });
  pdf.addImage(qrData, "PNG", M, qrY, qrSize, qrSize);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Comprobante Autorizado", M + qrSize + 6, qrY + 8);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.text(
    "Esta Administración Federal no se responsabiliza por los datos ingresados en el detalle de la operación",
    M + qrSize + 6,
    qrY + 13,
    { maxWidth: W - 2 * M - qrSize - 76 },
  );
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.text("CAE N°:", W - M - 60, qrY + 8);
  pdf.text("Fecha de Vto. de CAE:", W - M - 60, qrY + 14);
  pdf.setFont("helvetica", "normal");
  pdf.text(inv.cae, W - M - 2, qrY + 8, { align: "right" });
  pdf.text(isoToAr(inv.caeVto), W - M - 2, qrY + 14, { align: "right" });

  return pdf;
}

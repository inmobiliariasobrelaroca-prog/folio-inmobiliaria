// ============================================================
// tesoreria/Reportes.tsx
//
// Reportes de tesorería para un período: se elige por qué agrupar
// (bolsa, cuenta del banco, tipo de gasto, obra, proveedor o mes) y sale
// cuánto entró y cuánto salió de cada uno, con el detalle debajo.
// Todo se puede bajar a Excel o a PDF.
//
// Cómo cuenta los traslados: al agrupar por bolsa o por banco, un
// traslado es salida de una y entrada de la otra, así cada cuenta cuadra
// con su saldo. Al agrupar por tipo de gasto, obra, proveedor o mes, los
// traslados no cuentan: no son plata que entra ni que se gasta, solo se
// mueve de lugar.
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { Download, FileText, ChevronDown, ChevronRight, Paperclip, Pencil, Check, X } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmt, fmtDate, C_ORIGEN, C_GASTO, C_BOLSA } from "./comun";

const AGRUPAR = [
  ["bolsa",     "Bolsa"],
  ["banco",     "Cuenta del banco"],
  ["categoria", "Tipo de gasto o ingreso"],
  ["obra",      "Obra"],
  ["proveedor", "Proveedor"],
  ["mes",       "Mes"],
];

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio",
               "agosto","septiembre","octubre","noviembre","diciembre"];

// Los documentos de un movimiento viven en dos lugares: las facturas y
// vouchers de gastos (tabla factura_movimientos, bucket "facturas") y las
// boletas que suben los clientes al pagar (comprobantes, bucket
// "comprobantes"). Se traen de los dos y se firman en lotes.
async function cargarDocumentos(movs) {
  const docs = {};
  const ids = movs.map((m) => m.id);
  const push = (movId, d) => { (docs[movId] = docs[movId] || []).push(d); };
  const trozos = (arr, k) => arr.reduce((a, _, i) => (i % k ? a : [...a, arr.slice(i, i + k)]), []);

  for (const grupo of trozos(ids, 100)) {
    const { data } = await supabase.from("factura_movimientos")
      .select("movimiento_id, facturas(storage_path, tipo_documento)")
      .in("movimiento_id", grupo);
    for (const r of data || []) {
      if (r.facturas?.storage_path) {
        push(r.movimiento_id, { bucket: "facturas", path: r.facturas.storage_path,
                                tipo: r.facturas.tipo_documento || "documento" });
      }
    }
  }

  const porComp = {};
  for (const m of movs) if (m.comprobante_id) porComp[m.comprobante_id] = m.id;
  const compIds = Object.keys(porComp);
  for (const grupo of trozos(compIds, 100)) {
    const { data } = await supabase.from("comprobantes")
      .select("id, imagen_url, imagenes_extra").in("id", grupo);
    for (const c of data || []) {
      const movId = porComp[c.id];
      for (const ruta of [c.imagen_url, ...(c.imagenes_extra || [])].filter(Boolean)) {
        if (/^https?:\/\//i.test(ruta)) push(movId, { externo: true, url: ruta, tipo: "boleta" });
        else push(movId, { bucket: "comprobantes", path: ruta, tipo: "boleta" });
      }
    }
  }

  // Firmar por bucket
  for (const bucket of ["facturas", "comprobantes"]) {
    const rutas = Object.values(docs).flat().filter((d) => d.bucket === bucket).map((d) => d.path);
    for (const grupo of trozos([...new Set(rutas)], 100)) {
      const { data } = await supabase.storage.from(bucket).createSignedUrls(grupo, 3600);
      const url = {};
      (data || []).forEach((f) => { if (f.signedUrl && f.path) url[f.path] = f.signedUrl; });
      Object.values(docs).flat().forEach((d) => {
        if (d.bucket === bucket && url[d.path]) d.url = url[d.path];
      });
    }
  }
  Object.values(docs).flat().forEach((d) => {
    d.esPdf = /\.pdf($|\?)/i.test(d.path || d.url || "");
  });
  return docs;
}

// Baja una imagen, la achica y la devuelve lista para el PDF. Las que no
// sean imagen (un PDF adjunto, por ejemplo) devuelven null.
async function imagenParaPdf(url, max = 1100) {
  try {
    const r = await fetch(url);
    const b = await r.blob();
    if (!b.type.startsWith("image/")) return null;
    const bmp = await createImageBitmap(b);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return { data: c.toDataURL("image/jpeg", 0.72), w: c.width, h: c.height };
  } catch { return null; }
}

function primerDiaMes() {
  const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function hoyIso() { return new Date().toISOString().slice(0, 10); }

export default function Reportes() {
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoyIso());
  const [agrupar, setAgrupar] = useState("bolsa");
  const [soloTipo, setSoloTipo] = useState("todos");
  const [movs, setMovs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);
  const [docs, setDocs] = useState({});
  const [conImagenes, setConImagenes] = useState(false);
  // Qué entra al archivo que se baja. Por defecto todo; se pueden sacar
  // grupos (bolsas, obras...) y secciones, por ejemplo para mandarle a un
  // tercero solo lo que le corresponde ver.
  const [panelBajar, setPanelBajar] = useState(false);
  const [excluidos, setExcluidos] = useState(new Set());
  const [conResumen, setConResumen] = useState(true);
  const [conDetalle, setConDetalle] = useState(true);
  // Presupuesto de cada obra: lo asignado, lo gastado, lo que está
  // comprometido por pagar y lo que queda. Opcional al imprimir.
  const [conPresupuesto, setConPresupuesto] = useState(true);
  const [presupuestos, setPresupuestos] = useState({});
  useEffect(() => {
    supabase.from("v_presupuesto_centros").select("*").then(({ data }) => {
      const m = {};
      (data || []).forEach((c) => { m[c.nombre] = c; });
      setPresupuestos(m);
    });
  }, []);
  const [armando, setArmando] = useState("");

  useEffect(() => {
    (async () => {
      setCargando(true);
      const { data } = await supabase
        .from("movimientos")
        .select("id, tipo, fecha, monto, descripcion, notas, factura_pendiente, comprobante_id, " +
                "centros_costo(nombre), categorias(nombre), proveedores(nombre), " +
                "origen:bolsa_origen_id(nombre, banco), destino:bolsa_destino_id(nombre, banco)")
        .gte("fecha", desde).lte("fecha", hasta)
        .order("fecha", { ascending: true });
      setMovs(data || []);
      setCargando(false);
      setAbierto(null);
      setExcluidos(new Set());
      setDocs(await cargarDocumentos(data || []));
    })();
  }, [desde, hasta]);

  // Cada movimiento se convierte en una o dos "líneas" según la agrupación
  const lineas = useMemo(() => {
    const out = [];
    const porCuenta = agrupar === "bolsa" || agrupar === "banco";
    for (const m of movs) {
      if (soloTipo !== "todos" && m.tipo !== soloTipo) continue;
      const monto = Number(m.monto || 0);
      if (porCuenta) {
        const clave = (b) => agrupar === "bolsa" ? (b?.nombre || "Sin bolsa") : (b?.banco || "Sin banco");
        if (m.destino) out.push({ grupo: clave(m.destino), entra: monto, sale: 0, m });
        if (m.origen)  out.push({ grupo: clave(m.origen),  entra: 0, sale: monto, m });
      } else {
        if (m.tipo === "traslado") continue;
        let grupo;
        if (agrupar === "categoria") grupo = m.categorias?.nombre || "Sin clasificar";
        else if (agrupar === "obra") grupo = m.centros_costo?.nombre || "Sin obra";
        else if (agrupar === "proveedor") grupo = m.proveedores?.nombre || "Sin proveedor";
        else {
          const [a, mm] = m.fecha.split("-");
          grupo = `${a}-${mm}`;
        }
        out.push({
          grupo,
          entra: m.tipo === "ingreso" ? monto : 0,
          sale:  m.tipo === "egreso"  ? monto : 0,
          m,
        });
      }
    }
    return out;
  }, [movs, agrupar, soloTipo]);

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const l of lineas) {
      if (!mapa.has(l.grupo)) mapa.set(l.grupo, { grupo: l.grupo, entra: 0, sale: 0, n: 0, lineas: [] });
      const g = mapa.get(l.grupo);
      g.entra += l.entra; g.sale += l.sale; g.n += 1; g.lineas.push(l);
    }
    const arr = [...mapa.values()];
    if (agrupar === "mes") arr.sort((a, b) => a.grupo.localeCompare(b.grupo));
    else arr.sort((a, b) => (b.entra + b.sale) - (a.entra + a.sale));
    return arr;
  }, [lineas, agrupar]);

  const totEntra = grupos.reduce((a, g) => a + g.entra, 0);
  const totSale = grupos.reduce((a, g) => a + g.sale, 0);
  const porCuenta = agrupar === "bolsa" || agrupar === "banco";
  const etqEntra = porCuenta ? "Entró" : "Ingresos";
  const etqSale = porCuenta ? "Salió" : "Gastos";
  const nombreGrupo = (g) => {
    if (agrupar !== "mes") return g;
    const [a, mm] = g.split("-");
    return `${MESES[Number(mm) - 1]} ${a}`;
  };
  const tituloAgrupar = AGRUPAR.find(([k]) => k === agrupar)?.[1] || "";
  const periodo = `${fmtDate(desde)} al ${fmtDate(hasta)}`;

  // ---------- Exportar ----------

  // Columnas del detalle. La que coincide con la agrupación se omite, porque
  // ya sale como título del grupo.
  const bolsaDe = (m) => m.tipo === "traslado"
    ? `${m.origen?.nombre || "?"} → ${m.destino?.nombre || "?"}`
    : (m.tipo === "egreso" ? m.origen?.nombre : m.destino?.nombre) || "";
  const respaldoDe = (m) => {
    const k = (docs[m.id] || []).length;
    if (k) return `${k} doc.`;
    return m.tipo === "egreso" && m.factura_pendiente ? "SIN FACTURA" : "—";
  };
  const conPresup = agrupar === "obra" && conPresupuesto;

  // Lo que se va a bajar: solo los grupos marcados, con sus propios totales.
  const sel = grupos.filter((g) => !excluidos.has(g.grupo));
  const selE = sel.reduce((a, g) => a + g.entra, 0);
  const selS = sel.reduce((a, g) => a + g.sale, 0);
  const parcial = sel.length < grupos.length;
  const notaParcial = parcial
    ? `Incluye ${sel.length} de ${grupos.length} ${tituloAgrupar.toLowerCase()}: ${sel.map((g) => nombreGrupo(g.grupo)).join(", ")}.`
    : "";

  const bajarExcel = () => {
    // CSV con BOM: Excel lo abre con tildes y columnas bien separadas.
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = [
      [`Reporte de tesorería por ${tituloAgrupar.toLowerCase()}`],
      [`Período: ${periodo}`],
      ...(parcial ? [[notaParcial]] : []),
      [],
      ...(conResumen ? [
        [tituloAgrupar, etqEntra, etqSale, "Neto", "Movimientos"],
        ...sel.map((g) => [nombreGrupo(g.grupo), g.entra.toFixed(2), g.sale.toFixed(2),
                              (g.entra - g.sale).toFixed(2), g.n]),
        ["TOTAL", selE.toFixed(2), selS.toFixed(2), (selE - selS).toFixed(2),
         sel.reduce((a, g) => a + g.n, 0)],
        [],
      ] : []),
      ...(conPresup ? [
        ["PRESUPUESTO DE CADA OBRA"],
        ["Obra", "Presupuesto", "Gastado en el período", "Gastado en total", "Por pagar", "Queda"],
        ...sel.map((g) => {
          const pr = presupuestos[g.grupo];
          return [nombreGrupo(g.grupo),
            pr?.inversion_declarada != null ? Number(pr.inversion_declarada).toFixed(2) : "sin presupuesto",
            g.sale.toFixed(2),
            pr ? Number(pr.gastado || 0).toFixed(2) : "",
            pr ? Number(pr.comprometido || 0).toFixed(2) : "",
            pr?.disponible != null ? Number(pr.disponible).toFixed(2) : ""];
        }),
        (() => {
          const t = (campo) => sel.reduce((a, g) => a + Number(presupuestos[g.grupo]?.[campo] || 0), 0);
          return ["TOTAL", t("inversion_declarada").toFixed(2), selS.toFixed(2),
                  t("gastado").toFixed(2), t("comprometido").toFixed(2), t("disponible").toFixed(2)];
        })(),
        [],
      ] : []),
      ...(conDetalle ? [
      ["DETALLE"],
      [tituloAgrupar, "Fecha", "Tipo", "Descripción", "Notas", etqEntra, etqSale,
       "Bolsa origen", "Bolsa destino", "Tipo de gasto", "Obra", "Proveedor", "Documentos"],
      ...sel.flatMap((g) => [
        ...g.lineas.map((l) => {
          const ds = docs[l.m.id] || [];
          return [
            nombreGrupo(g.grupo), l.m.fecha, l.m.tipo, l.m.descripcion || "", l.m.notas || "",
            l.entra ? l.entra.toFixed(2) : "", l.sale ? l.sale.toFixed(2) : "",
            l.m.origen?.nombre || "", l.m.destino?.nombre || "",
            l.m.categorias?.nombre || "", l.m.centros_costo?.nombre || "",
            l.m.proveedores?.nombre || "",
            ds.length ? `${ds.length} (${[...new Set(ds.map((d) => d.tipo))].join(", ")})` : "sin documento",
          ];
        }),
        // Subtotal de cada grupo, para que el detalle cuadre por sí solo
        [`Subtotal ${nombreGrupo(g.grupo)}`, "", "", "", "",
         g.entra.toFixed(2), g.sale.toFixed(2), "", "", "", "", "", ""],
      ]),
      ["GRAN TOTAL", "", "", "", "", selE.toFixed(2), selS.toFixed(2), "", "", "", "", "",
       `Neto ${(selE - selS).toFixed(2)}`],
      ] : []),
    ];
    const csv = "\uFEFF" + filas.map((f) => f.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reporte-tesoreria-${agrupar}-${desde}-a-${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const bajarPdf = async () => {
    // Horizontal: el detalle lleva proveedor, tipo de gasto, bolsa y respaldo
    const doc = new jsPDF({ unit: "mm", format: "letter", orientation: "landscape" });
    const fq = (n) => "Q " + Number(n || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text("Sobre la Roca · Reporte de tesorería", 14, 18);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(110);
    doc.text(`Por ${tituloAgrupar.toLowerCase()} · ${periodo}`, 14, 25);
    let arranque = 31;
    if (parcial) {
      // Que quien lo lea sepa que no es el total de la empresa
      doc.setFontSize(8.5);
      const lineasNota = doc.splitTextToSize(notaParcial, 250);
      doc.text(lineasNota, 14, 30);
      arranque = 30 + lineasNota.length * 4 + 2;
    }
    doc.setTextColor(0);

    if (conResumen) autoTable(doc, {
      startY: arranque,
      head: [[tituloAgrupar, etqEntra, etqSale, "Neto", "Mov."]],
      body: sel.map((g) => [nombreGrupo(g.grupo), fq(g.entra), fq(g.sale), fq(g.entra - g.sale), g.n]),
      foot: [["Total", fq(selE), fq(selS), fq(selE - selS),
              sel.reduce((a, g) => a + g.n, 0)]],
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [16, 24, 38] },
      footStyles: { fillColor: [201, 162, 39], textColor: [16, 24, 38] },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });

    if (conPresup) autoTable(doc, {
      startY: conResumen ? doc.lastAutoTable.finalY + 8 : arranque,
      head: [["Obra", "Presupuesto", "Gastado en el período", "Gastado en total", "Por pagar", "Queda"]],
      body: sel.map((g) => {
        const pr = presupuestos[g.grupo];
        return [nombreGrupo(g.grupo),
          pr?.inversion_declarada != null ? fq(pr.inversion_declarada) : "sin presupuesto",
          fq(g.sale),
          pr ? fq(pr.gastado) : "—",
          pr ? fq(pr.comprometido) : "—",
          pr?.disponible != null ? fq(pr.disponible) : "—"];
      }),
      foot: [(() => {
        const t = (campo) => sel.reduce((a, g) => a + Number(presupuestos[g.grupo]?.[campo] || 0), 0);
        return ["Total", fq(t("inversion_declarada")), fq(selS),
                fq(t("gastado")), fq(t("comprometido")), fq(t("disponible"))];
      })()],
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [201, 162, 39], textColor: [16, 24, 38] },
      footStyles: { fillColor: [16, 24, 38], textColor: [237, 231, 217] },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" },
                      4: { halign: "right" }, 5: { halign: "right" } },
    });

    // Columnas del detalle, sin repetir la de la agrupación
    const cols = [
      [tituloAgrupar, (g) => nombreGrupo(g.grupo), 24],
      ["Fecha", (g, l) => fmtDate(l.m.fecha), 16],
      // La descripción toma el ancho que sobre, para que nunca se salga de la hoja
      ["Descripción y notas", (g, l) => (l.m.descripcion || l.m.tipo) + (l.m.notas ? `\n${l.m.notas}` : ""), "auto"],
      ...(agrupar !== "categoria" ? [["Tipo de gasto", (g, l) => l.m.categorias?.nombre || "", 24]] : []),
      ...(agrupar !== "proveedor" ? [["Proveedor", (g, l) => l.m.proveedores?.nombre || "", 24]] : []),
      ...(agrupar !== "obra" ? [["Obra", (g, l) => l.m.centros_costo?.nombre || "", 20]] : []),
      ...(agrupar !== "bolsa" ? [["Bolsa", (g, l) => bolsaDe(l.m), 26]] : []),
      ["Respaldo", (g, l) => respaldoDe(l.m), 15],
      [etqEntra, (g, l) => l.entra ? fq(l.entra) : "", 20],
      [etqSale, (g, l) => l.sale ? fq(l.sale) : "", 20],
    ];
    const iRespaldo = cols.findIndex((c) => c[0] === "Respaldo");

    if (conDetalle) autoTable(doc, {
      startY: (conResumen || conPresup) ? doc.lastAutoTable.finalY + 8 : arranque,
      head: [cols.map((c) => c[0])],
      // Cada grupo cierra con su subtotal; al final, el gran total
      body: sel.flatMap((g) => [
        ...g.lineas.map((l) => cols.map((c) => c[1](g, l))),
        cols.map((c, i) => i === 0 ? `Subtotal ${nombreGrupo(g.grupo)}`
          : i === cols.length - 2 ? fq(g.entra)
          : i === cols.length - 1 ? fq(g.sale) : ""),
      ]),
      foot: [cols.map((c, i) => i === 0 ? "Gran total"
        : i === 2 ? `Neto ${fq(selE - selS)}`
        : i === cols.length - 2 ? fq(selE)
        : i === cols.length - 1 ? fq(selS) : "")],
      styles: { fontSize: 7.2, cellPadding: 1.4, overflow: "linebreak" },
      headStyles: { fillColor: [42, 53, 71] },
      footStyles: { fillColor: [201, 162, 39], textColor: [16, 24, 38], fontStyle: "bold" },
      columnStyles: Object.fromEntries(cols.map((c, i) => [i, {
        cellWidth: c[2],
        halign: i >= cols.length - 2 ? "right" : (i === iRespaldo ? "center" : "left"),
      }])),
      // "SIN FACTURA" en rojo, para que salte a la vista al revisar
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === iRespaldo && d.cell.raw === "SIN FACTURA") {
          d.cell.styles.textColor = [192, 57, 43]; d.cell.styles.fontStyle = "bold";
        }
        if (d.section === "body" && String(d.row.raw?.[0] || "").startsWith("Subtotal ")) {
          d.cell.styles.fontStyle = "bold";
          d.cell.styles.fillColor = [238, 238, 238];
        }
      },
    });

    // Anexo con las imágenes de los documentos, si se pidió
    if (conImagenes) {
      const conDocs = sel.flatMap((g) => g.lineas)
        .filter((l, i, arr) => arr.findIndex((x) => x.m.id === l.m.id) === i)
        .filter((l) => (docs[l.m.id] || []).some((d) => d.url && !d.esPdf));
      let hechas = 0;
      const total = conDocs.reduce((a, l) => a + (docs[l.m.id] || []).filter((d) => d.url && !d.esPdf).length, 0);
      const hayTablas = conResumen || conDetalle;
      if (hayTablas) doc.addPage();
      const yTitulo = hayTablas ? 18 : arranque + 4;
      doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.text(hayTablas ? "Anexo: documentos de respaldo" : "Documentos de respaldo", 14, yTitulo);
      let y = yTitulo + 8;
      const alto = doc.internal.pageSize.getHeight();
      for (const l of conDocs) {
        if (y > alto - 40) { doc.addPage(); y = 18; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(9);
        doc.text(`${fmtDate(l.m.fecha)} · ${(l.m.descripcion || l.m.tipo).slice(0, 80)} · ${fq(l.entra || l.sale)}`, 14, y);
        y += 4;
        for (const d of (docs[l.m.id] || []).filter((d) => d.url && !d.esPdf)) {
          hechas++;
          setArmando(`Armando el PDF: imagen ${hechas} de ${total}...`);
          const img = await imagenParaPdf(d.url);
          if (!img) continue;
          const maxW = 182, maxH = 115;
          const k = Math.min(maxW / (img.w * 0.2646), maxH / (img.h * 0.2646), 1);
          const w = img.w * 0.2646 * k, h = img.h * 0.2646 * k;
          if (y + h > alto - 12) { doc.addPage(); y = 18; }
          doc.addImage(img.data, "JPEG", 14, y, w, h);
          y += h + 5;
        }
        const pdfs = (docs[l.m.id] || []).filter((d) => d.esPdf).length;
        if (pdfs) {
          doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(110);
          doc.text(`Además tiene ${pdfs} documento${pdfs === 1 ? "" : "s"} en PDF: se ve${pdfs === 1 ? "" : "n"} en la app.`, 14, y);
          doc.setTextColor(0); y += 5;
        }
        y += 3;
      }
      setArmando("");
    }

    doc.save(`reporte-tesoreria-${agrupar}-${desde}-a-${hasta}.pdf`);
  };

  // ---------- Pantalla ----------

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-[#8A93A3]">Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="w-full mt-0.5 bg-[#0C121C] border border-[#2A3547] rounded p-2 text-[12px]" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-[#8A93A3]">Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="w-full mt-0.5 bg-[#0C121C] border border-[#2A3547] rounded p-2 text-[12px]" />
        </label>
      </div>

      <div>
        <span className="text-[10px] uppercase tracking-wide text-[#8A93A3]">Agrupar por</span>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {AGRUPAR.map(([k, t]) => (
            <button key={k} onClick={() => { setAgrupar(k); setAbierto(null); }}
              className={`text-[11px] px-2.5 py-1.5 rounded-md ${agrupar === k
                ? "bg-[#C9A227] text-[#101826] font-medium" : "bg-[#2A3547] text-[#8A93A3]"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[["todos", "Todo"], ["ingreso", "Solo ingresos"], ["egreso", "Solo gastos"],
          ...(porCuenta ? [["traslado", "Solo traslados"]] : [])].map(([k, t]) => (
          <button key={k} onClick={() => setSoloTipo(k)}
            className={`text-[10px] px-2 py-1 rounded ${soloTipo === k
              ? "bg-[#161F2E] border border-[#C9A227] text-[#EDE7D9]"
              : "border border-[#2A3547] text-[#8A93A3]"}`}>
            {t}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="text-sm text-[#8A93A3]">Cargando...</div>
      ) : grupos.length === 0 ? (
        <div className="text-[11px] text-[#8A93A3] py-3">No hay movimientos en ese período.</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Tot rotulo={etqEntra} valor={totEntra} color={C_ORIGEN} />
            <Tot rotulo={etqSale} valor={totSale} color={C_GASTO} />
            <Tot rotulo="Neto" valor={totEntra - totSale} color={totEntra - totSale >= 0 ? C_ORIGEN : C_GASTO} />
          </div>

          {!porCuenta && (
            <div className="text-[10px] text-[#6b7280]">
              Los traslados entre bolsas no cuentan acá: no es plata que entra ni
              que se gasta, solo se mueve. Para verlos, agrupá por bolsa o por cuenta.
            </div>
          )}

          {!panelBajar ? (
            <button onClick={() => setPanelBajar(true)}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] bg-[#2A3547] hover:bg-[#3a4864] py-2 rounded-md">
              <Download size={12} /> Bajar o imprimir el reporte
            </button>
          ) : (
            <div className="bg-[#0C121C] border border-[#C9A227]/50 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[12px] text-[#EDE7D9]">Qué incluir</div>
                <button onClick={() => setPanelBajar(false)} className="text-[#8A93A3]"><X size={14} /></button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wide text-[#8A93A3]">{tituloAgrupar}</span>
                  <span className="flex gap-2 text-[10px]">
                    <button onClick={() => setExcluidos(new Set())} className="text-[#C9A227]">Todos</button>
                    <button onClick={() => setExcluidos(new Set(grupos.map((g) => g.grupo)))} className="text-[#8A93A3]">Ninguno</button>
                  </span>
                </div>
                <div className="space-y-0.5 max-h-56 overflow-y-auto">
                  {grupos.map((g) => {
                    const marcado = !excluidos.has(g.grupo);
                    return (
                      <label key={g.grupo} className="flex items-center gap-2 text-[11px] py-1 cursor-pointer">
                        <input type="checkbox" checked={marcado}
                          onChange={() => {
                            const x = new Set(excluidos);
                            marcado ? x.add(g.grupo) : x.delete(g.grupo);
                            setExcluidos(x);
                          }} />
                        <span className={`flex-1 truncate ${marcado ? "" : "text-[#6b7280] line-through"}`}>
                          {nombreGrupo(g.grupo)}
                        </span>
                        <span className="font-mono text-[10px] text-[#8A93A3] shrink-0">
                          {fmt(g.entra + g.sale)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wide text-[#8A93A3]">Secciones</span>
                <label className="flex items-center gap-2 text-[11px] py-1">
                  <input type="checkbox" checked={conResumen} onChange={(e) => setConResumen(e.target.checked)} />
                  Resumen con totales por {tituloAgrupar.toLowerCase()}
                </label>
                <label className="flex items-center gap-2 text-[11px] py-1">
                  <input type="checkbox" checked={conDetalle} onChange={(e) => setConDetalle(e.target.checked)} />
                  Detalle de cada movimiento, con sus notas
                </label>
                {agrupar === "obra" && (
                  <label className="flex items-center gap-2 text-[11px] py-1">
                    <input type="checkbox" checked={conPresupuesto} onChange={(e) => setConPresupuesto(e.target.checked)} />
                    Presupuesto de cada obra: asignado, gastado, por pagar y lo que queda
                  </label>
                )}
                <label className="flex items-center gap-2 text-[11px] py-1">
                  <input type="checkbox" checked={conImagenes} onChange={(e) => setConImagenes(e.target.checked)} />
                  Imágenes de los documentos <span className="text-[#6b7280]">(solo PDF)</span>
                </label>
              </div>

              {(() => {
                const n = grupos.length - excluidos.size;
                const vacio = n === 0 || (!conResumen && !conDetalle && !conImagenes && !(agrupar === "obra" && conPresupuesto));
                return (
                  <>
                    <div className="text-[10px] text-[#8A93A3]">
                      {n === grupos.length
                        ? `Va todo: ${grupos.length} ${tituloAgrupar.toLowerCase()}.`
                        : `Van ${n} de ${grupos.length}. El archivo lo va a decir arriba, para que quien lo lea sepa que no es el total.`}
                    </div>
                    {armando && <div className="text-[11px] text-[#C9A227]">{armando}</div>}
                    <div className="flex gap-2">
                      <button onClick={bajarExcel} disabled={vacio || (!conResumen && !conDetalle && !(agrupar === "obra" && conPresupuesto))}
                        className="flex-1 flex items-center justify-center gap-1.5 text-[11px] bg-[#2A3547] hover:bg-[#3a4864] disabled:opacity-40 py-2 rounded-md">
                        <Download size={12} /> Excel
                      </button>
                      <button onClick={bajarPdf} disabled={vacio || !!armando}
                        className="flex-1 flex items-center justify-center gap-1.5 text-[11px] bg-[#C9A227] text-[#101826] font-medium disabled:opacity-40 py-2 rounded-md">
                        <FileText size={12} /> PDF
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          <div className="space-y-1.5">
            {grupos.map((g) => (
              <div key={g.grupo} className="bg-[#161F2E] border border-[#2A3547] rounded-lg">
                <button onClick={() => setAbierto(abierto === g.grupo ? null : g.grupo)}
                  className="w-full text-left p-3 flex items-center gap-2">
                  {abierto === g.grupo ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] truncate">{nombreGrupo(g.grupo)}</div>
                    <div className="text-[10px] text-[#6b7280]">
                      {g.n} movimiento{g.n === 1 ? "" : "s"}
                      {(() => {
                        const unicos = [...new Set(g.lineas.map((l) => l.m.id))];
                        const con = unicos.filter((id) => (docs[id] || []).length > 0).length;
                        return <span> · <Paperclip size={9} className="inline -mt-0.5" /> {con} de {unicos.length} con documento</span>;
                      })()}
                    </div>
                    {agrupar === "obra" && presupuestos[g.grupo]?.inversion_declarada != null && (() => {
                      const pr = presupuestos[g.grupo];
                      const queda = Number(pr.disponible || 0);
                      return (
                        <div className="text-[10px] text-[#8A93A3] mt-0.5">
                          Presupuesto {fmt(pr.inversion_declarada)} · gastado {fmt(pr.gastado)}
                          {Number(pr.comprometido) > 0 && ` · por pagar ${fmt(pr.comprometido)}`}
                          {" · "}<span style={{ color: queda < 0 ? C_GASTO : C_ORIGEN }}>
                            {queda < 0 ? `pasado por ${fmt(-queda)}` : `queda ${fmt(queda)}`}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="text-right shrink-0 font-mono text-[11px]">
                    {g.entra > 0 && <div style={{ color: C_ORIGEN }}>+{fmt(g.entra)}</div>}
                    {g.sale > 0 && <div style={{ color: C_GASTO }}>−{fmt(g.sale)}</div>}
                  </div>
                </button>
                {abierto === g.grupo && (
                  <div className="border-t border-[#2A3547] px-3 pb-2 pt-1 divide-y divide-[#2A3547]">
                    {g.lineas.map((l, i) => (
                      <Linea key={i} l={l} docs={docs[l.m.id] || []}
                        onNota={(texto) => setMovs(movs.map((m) => m.id === l.m.id ? { ...m, notas: texto } : m))} />
                    ))}
                    <div className="flex items-center gap-2 pt-1.5 text-[10px]">
                      <span className="flex-1 text-[#8A93A3]">Subtotal de {nombreGrupo(g.grupo)}</span>
                      {g.entra > 0 && <span className="font-mono" style={{ color: C_ORIGEN }}>+{fmt(g.entra)}</span>}
                      {g.sale > 0 && <span className="font-mono" style={{ color: C_GASTO }}>−{fmt(g.sale)}</span>}
                      <span className="font-mono text-[#EDE7D9]">neto {fmt(g.entra - g.sale)}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Un movimiento dentro del reporte: su nota, sus documentos, y la opción de
// escribirle o corregirle la nota sin salir del reporte.
function Linea({ l, docs, onNota }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(l.m.notas || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    setError(""); setGuardando(true);
    const limpio = texto.trim() || null;
    const { error: e } = await supabase.from("movimientos").update({ notas: limpio }).eq("id", l.m.id);
    setGuardando(false);
    if (e) { setError(e.message); return; }
    onNota(limpio);
    setEditando(false);
  };

  return (
    <div className="py-2 text-[10px]">
      <div className="flex items-start gap-2">
        <span className="text-[#6b7280] shrink-0 w-16">{fmtDate(l.m.fecha)}</span>
        <span className="flex-1 min-w-0 text-[#8A93A3]">
          {l.m.descripcion || l.m.tipo}
          {l.m.factura_pendiente && <span className="text-amber-400"> · sin factura</span>}
        </span>
        <span className="font-mono shrink-0" style={{ color: l.entra ? C_ORIGEN : C_GASTO }}>
          {l.entra ? `+${fmt(l.entra)}` : `−${fmt(l.sale)}`}
        </span>
      </div>

      {!editando && (
        <div className="flex items-start gap-1.5 mt-1 ml-[4.5rem]">
          {l.m.notas
            ? <span className="flex-1 text-[#EDE7D9]/80 italic whitespace-pre-line">{l.m.notas}</span>
            : <span className="flex-1 text-[#6b7280]">Sin notas</span>}
          <button onClick={() => { setTexto(l.m.notas || ""); setEditando(true); }}
            title={l.m.notas ? "Editar la nota" : "Agregar una nota"}
            className="text-[#8A93A3] hover:text-[#C9A227] shrink-0">
            <Pencil size={11} />
          </button>
        </div>
      )}

      {editando && (
        <div className="mt-1.5 ml-[4.5rem] space-y-1.5">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} autoFocus
            className="w-full bg-[#0C121C] border border-[#2A3547] rounded p-1.5 text-[11px] leading-relaxed" />
          {error && <div className="text-red-400">{error}</div>}
          <div className="flex gap-1.5">
            <button onClick={() => setEditando(false)} disabled={guardando}
              className="flex items-center gap-1 bg-[#2A3547] px-2 py-1 rounded"><X size={10} /> Cancelar</button>
            <button onClick={guardar} disabled={guardando}
              className="flex items-center gap-1 bg-[#C9A227] text-[#101826] font-medium px-2 py-1 rounded">
              <Check size={10} /> {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {docs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5 ml-[4.5rem]">
          {docs.map((d, k) => (
            <a key={k} href={d.url || "#"} target="_blank" rel="noopener noreferrer"
              title={`${d.tipo}${d.externo ? " (enlace externo)" : ""}`}
              className="block w-14 h-14 rounded border border-[#2A3547] overflow-hidden bg-[#0C121C] shrink-0">
              {d.url && !d.esPdf && !d.externo
                ? <img src={d.url} alt={d.tipo} className="w-full h-full object-cover" loading="lazy" />
                : <div className="w-full h-full flex flex-col items-center justify-center text-[8px] text-[#8A93A3] gap-0.5">
                    <FileText size={14} />{d.esPdf ? "PDF" : d.externo ? "Drive" : d.tipo}
                  </div>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Tot({ rotulo, valor, color }) {
  return (
    <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-[#8A93A3]">{rotulo}</div>
      <div className="font-mono text-sm mt-0.5" style={{ color }}>{fmt(valor)}</div>
    </div>
  );
}

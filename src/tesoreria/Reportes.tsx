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
import { Download, FileText, ChevronDown, ChevronRight } from "lucide-react";
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

  useEffect(() => {
    (async () => {
      setCargando(true);
      const { data } = await supabase
        .from("movimientos")
        .select("id, tipo, fecha, monto, descripcion, factura_pendiente, " +
                "centros_costo(nombre), categorias(nombre), proveedores(nombre), " +
                "origen:bolsa_origen_id(nombre, banco), destino:bolsa_destino_id(nombre, banco)")
        .gte("fecha", desde).lte("fecha", hasta)
        .order("fecha", { ascending: true });
      setMovs(data || []);
      setCargando(false);
      setAbierto(null);
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

  const bajarExcel = () => {
    // CSV con BOM: Excel lo abre con tildes y columnas bien separadas.
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = [
      [`Reporte de tesorería por ${tituloAgrupar.toLowerCase()}`],
      [`Período: ${periodo}`],
      [],
      [tituloAgrupar, etqEntra, etqSale, "Neto", "Movimientos"],
      ...grupos.map((g) => [nombreGrupo(g.grupo), g.entra.toFixed(2), g.sale.toFixed(2),
                            (g.entra - g.sale).toFixed(2), g.n]),
      ["TOTAL", totEntra.toFixed(2), totSale.toFixed(2), (totEntra - totSale).toFixed(2),
       grupos.reduce((a, g) => a + g.n, 0)],
      [],
      ["DETALLE"],
      [tituloAgrupar, "Fecha", "Tipo", "Descripción", etqEntra, etqSale,
       "Bolsa origen", "Bolsa destino", "Tipo de gasto", "Obra", "Proveedor"],
      ...grupos.flatMap((g) => g.lineas.map((l) => [
        nombreGrupo(g.grupo), l.m.fecha, l.m.tipo, l.m.descripcion || "",
        l.entra ? l.entra.toFixed(2) : "", l.sale ? l.sale.toFixed(2) : "",
        l.m.origen?.nombre || "", l.m.destino?.nombre || "",
        l.m.categorias?.nombre || "", l.m.centros_costo?.nombre || "",
        l.m.proveedores?.nombre || "",
      ])),
    ];
    const csv = "\uFEFF" + filas.map((f) => f.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reporte-tesoreria-${agrupar}-${desde}-a-${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const bajarPdf = () => {
    const doc = new jsPDF({ unit: "mm", format: "letter" });
    const fq = (n) => "Q " + Number(n || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text("Sobre la Roca · Reporte de tesorería", 14, 18);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(110);
    doc.text(`Por ${tituloAgrupar.toLowerCase()} · ${periodo}`, 14, 25);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 31,
      head: [[tituloAgrupar, etqEntra, etqSale, "Neto", "Mov."]],
      body: grupos.map((g) => [nombreGrupo(g.grupo), fq(g.entra), fq(g.sale), fq(g.entra - g.sale), g.n]),
      foot: [["Total", fq(totEntra), fq(totSale), fq(totEntra - totSale),
              grupos.reduce((a, g) => a + g.n, 0)]],
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [16, 24, 38] },
      footStyles: { fillColor: [201, 162, 39], textColor: [16, 24, 38] },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [[tituloAgrupar, "Fecha", "Descripción", etqEntra, etqSale]],
      body: grupos.flatMap((g) => g.lineas.map((l) => [
        nombreGrupo(g.grupo), fmtDate(l.m.fecha), (l.m.descripcion || l.m.tipo).slice(0, 70),
        l.entra ? fq(l.entra) : "", l.sale ? fq(l.sale) : "",
      ])),
      styles: { fontSize: 7.5 },
      headStyles: { fillColor: [42, 53, 71] },
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
    });

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

          <div className="flex gap-2">
            <button onClick={bajarExcel}
              className="flex-1 flex items-center justify-center gap-1.5 text-[11px] bg-[#2A3547] hover:bg-[#3a4864] py-2 rounded-md">
              <Download size={12} /> Bajar a Excel
            </button>
            <button onClick={bajarPdf}
              className="flex-1 flex items-center justify-center gap-1.5 text-[11px] bg-[#2A3547] hover:bg-[#3a4864] py-2 rounded-md">
              <FileText size={12} /> Bajar en PDF
            </button>
          </div>

          <div className="space-y-1.5">
            {grupos.map((g) => (
              <div key={g.grupo} className="bg-[#161F2E] border border-[#2A3547] rounded-lg">
                <button onClick={() => setAbierto(abierto === g.grupo ? null : g.grupo)}
                  className="w-full text-left p-3 flex items-center gap-2">
                  {abierto === g.grupo ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] truncate">{nombreGrupo(g.grupo)}</div>
                    <div className="text-[10px] text-[#6b7280]">{g.n} movimiento{g.n === 1 ? "" : "s"}</div>
                  </div>
                  <div className="text-right shrink-0 font-mono text-[11px]">
                    {g.entra > 0 && <div style={{ color: C_ORIGEN }}>+{fmt(g.entra)}</div>}
                    {g.sale > 0 && <div style={{ color: C_GASTO }}>−{fmt(g.sale)}</div>}
                  </div>
                </button>
                {abierto === g.grupo && (
                  <div className="border-t border-[#2A3547] px-3 pb-2 pt-1.5 space-y-1">
                    {g.lineas.map((l, i) => (
                      <div key={i} className="flex items-start gap-2 text-[10px]">
                        <span className="text-[#6b7280] shrink-0 w-16">{fmtDate(l.m.fecha)}</span>
                        <span className="flex-1 min-w-0 truncate text-[#8A93A3]">
                          {l.m.descripcion || l.m.tipo}
                          {l.m.factura_pendiente && <span className="text-amber-400"> · sin factura</span>}
                        </span>
                        <span className="font-mono shrink-0" style={{ color: l.entra ? C_ORIGEN : C_GASTO }}>
                          {l.entra ? `+${fmt(l.entra)}` : `−${fmt(l.sale)}`}
                        </span>
                      </div>
                    ))}
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

function Tot({ rotulo, valor, color }) {
  return (
    <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-[#8A93A3]">{rotulo}</div>
      <div className="font-mono text-sm mt-0.5" style={{ color }}>{fmt(valor)}</div>
    </div>
  );
}

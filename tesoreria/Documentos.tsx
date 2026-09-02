// ============================================================
// tesoreria/Documentos.tsx — adjuntar y ver facturas y vouchers
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Upload, FileText, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { fmt, fmtDate, llamarFuncionSesion, C_BOLSA } from "./comun";

// ---------- Adjuntar documentos a gastos ya pagados ----------

export function DocumentarGastos({ onCambio }) {
  const [gastos, setGastos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase.from("v_gastos_documentacion").select("*").limit(40);
    setGastos(data || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;
  if (gastos.length === 0) return <div className="text-sm text-[#8A93A3]">Todavía no hay gastos registrados.</div>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-[#8A93A3] mb-1">
        Cada gasto puede llevar varios papeles: el voucher del banco y después la factura del
        proveedor. Solo las facturas cierran el pendiente.
      </p>
      {gastos.map((g) => {
        const faltaFactura = Number(g.en_facturas) < Number(g.pagado) - 1;
        return (
          <div key={g.movimiento_id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">{g.descripcion || "Sin descripción"}</div>
                <div className="text-[11px] text-[#8A93A3] truncate">
                  {fmtDate(g.fecha)} · {g.centro_costo || "Sin obra"} · {g.bolsa}
                </div>
              </div>
              <div className="font-mono text-sm shrink-0">{fmt(g.pagado)}</div>
            </div>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {faltaFactura ? (
                <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-amber-700 text-amber-400 uppercase tracking-wide">
                  <AlertTriangle size={10} /> Falta factura por {fmt(Number(g.pagado) - Number(g.en_facturas))}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-emerald-700 text-emerald-400 uppercase tracking-wide">
                  <CheckCircle2 size={10} /> Documentado
                </span>
              )}
              {Number(g.en_vouchers) > 0 && (
                <span className="text-[10px] text-[#8A93A3]">Voucher {fmt(g.en_vouchers)}</span>
              )}
              <button
                onClick={() => setAbierto(abierto === g.movimiento_id ? null : g.movimiento_id)}
                className="ml-auto text-[11px] bg-[#2A3547] hover:bg-[#3a4864] px-2.5 py-1 rounded-md"
              >
                {abierto === g.movimiento_id ? "Cerrar" : `Documentos (${g.documentos})`}
              </button>
            </div>

            {abierto === g.movimiento_id && (
              <DocumentosDelGasto
                gasto={g}
                onCambio={() => { cargar(); onCambio && onCambio(); }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DocumentosDelGasto({ gasto, onCambio }) {
  const [docs, setDocs] = useState([]);
  const [tipo, setTipo] = useState("factura");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [releyendo, setReleyendo] = useState(null);
  const [visor, setVisor] = useState(null); // { docs, indice }

  // Vuelve a pasar por el lector un documento que quedó sin leer,
  // sin tener que subir el archivo otra vez.
  const releer = async (facturaId) => {
    setReleyendo(facturaId);
    setError("");
    try {
      const res = await llamarFuncionSesion("lector-facturas", { factura_id: facturaId });
      if (!res?.ok) throw new Error(res?.error || "El lector no devolvió datos");
      await cargar();
      onCambio && onCambio();
    } catch (e) {
      setError(e.message);
    } finally {
      setReleyendo(null);
    }
  };

  const cargar = async () => {
    const { data } = await supabase
      .from("factura_movimientos")
      .select("monto_aplicado, facturas(id, tipo_documento, estado_lectura, serie, numero, fecha, monto_total, storage_path, proveedores(nombre))")
      .eq("movimiento_id", gasto.movimiento_id);
    const filas = (data || [])
      .filter((r) => r.facturas)
      .map((r) => ({ ...r.facturas, monto_aplicado: r.monto_aplicado }));

    // Un solo lote de enlaces firmados para todas las miniaturas
    const rutas = filas.map((f) => f.storage_path).filter(Boolean);
    let urls = {};
    if (rutas.length) {
      const { data: firmados } = await supabase.storage
        .from("facturas").createSignedUrls(rutas, 3600);
      (firmados || []).forEach((f) => { if (f.signedUrl && f.path) urls[f.path] = f.signedUrl; });
    }
    setDocs(filas.map((f) => ({ ...f, url: urls[f.storage_path] || null })));
  };
  useEffect(() => { cargar(); }, [gasto.movimiento_id]);

  const subir = async (archivo) => {
    if (!archivo) return;
    setSubiendo(true);
    setError("");
    try {
      const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase();
      const hoy = new Date();
      const carpeta = `${hoy.getFullYear()}/${String(hoy.getMonth() + 1).padStart(2, "0")}`;
      const path = `${carpeta}/${crypto.randomUUID()}.${ext}`;

      const { error: errUp } = await supabase.storage
        .from("facturas").upload(path, archivo, { contentType: archivo.type });
      if (errUp) throw new Error("No se pudo subir: " + errUp.message);

      const { data: nueva, error: errIns } = await supabase
        .from("facturas")
        .insert({ storage_path: path, archivo_url: path, tipo_documento: tipo })
        .select("id").single();
      if (errIns) throw new Error(errIns.message);

      const res = await llamarFuncionSesion("lector-facturas", { factura_id: nueva.id });
      if (!res?.ok) throw new Error(res?.error || "El lector no devolvió datos");

      // Lo que se aplica a este gasto: lo que diga el documento, sin
      // pasarse de lo que falta por documentar.
      const { data: leida } = await supabase
        .from("facturas").select("monto_total").eq("id", nueva.id).single();
      const falta = Math.max(0, Number(gasto.pagado) - Number(gasto.en_facturas || 0) - Number(gasto.en_vouchers || 0));
      const aplicar = Math.min(Number(leida?.monto_total) || falta || Number(gasto.pagado), falta || Number(gasto.pagado));

      const { error: errLink } = await supabase.from("factura_movimientos").insert({
        factura_id: nueva.id,
        movimiento_id: gasto.movimiento_id,
        monto_aplicado: aplicar,
      });
      if (errLink) throw new Error(errLink.message);

      await cargar();
      onCambio && onCambio();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubiendo(false);
    }
  };

  const etiqueta = { factura: "Factura", voucher: "Voucher", recibo: "Recibo", nota_credito: "Nota de crédito", otro: "Otro" };
  const esImagen = (p) => p && !/\.pdf$/i.test(p);

  return (
    <div className="mt-3 pt-3 border-t border-[#2A3547] space-y-2">
      {error && <div className="text-[11px] text-red-400 bg-red-950/30 border border-red-800 rounded-md p-2">{error}</div>}

      {docs.length > 0 && (
        <div className="space-y-1.5">
          {docs.map((d, i) => (
            <div key={d.id} className="bg-[#0C121C] border border-[#2A3547] rounded-md p-2 flex items-center gap-2.5">
              <button type="button" onClick={() => d.url && setVisor({ docs, indice: i })}
                className="shrink-0 w-12 h-12 rounded-md bg-[#161F2E] border border-[#2A3547] overflow-hidden flex items-center justify-center">
                {esImagen(d.storage_path) && d.url ? (
                  <img src={d.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <FileText size={16} className="text-[#C9A227]" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-xs truncate">
                  <span style={{ color: C_BOLSA }}>{etiqueta[d.tipo_documento] || d.tipo_documento}</span>
                  {d.proveedores?.nombre ? ` · ${d.proveedores.nombre}` : ""}
                </div>
                <div className="text-[10px] text-[#8A93A3] truncate">
                  {[d.serie, d.numero].filter(Boolean).join("-")}
                  {d.fecha ? ` · ${fmtDate(d.fecha)}` : ""}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-xs">{fmt(d.monto_aplicado ?? d.monto_total)}</div>
                {(d.estado_lectura === "pendiente" || d.estado_lectura === "error") && (
                  <button type="button" onClick={() => releer(d.id)} disabled={releyendo === d.id}
                    className="text-[10px] underline mt-0.5" style={{ color: C_BOLSA }}>
                    {releyendo === d.id ? "Leyendo..." : "Leer ahora"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        {["factura", "voucher", "recibo"].map((t) => (
          <button key={t} type="button" onClick={() => setTipo(t)}
            className={`flex-1 text-[11px] py-1.5 rounded-md border ${tipo === t ? "bg-[#C9A227] text-[#101826] border-[#C9A227] font-medium" : "border-[#2A3547] text-[#EDE7D9]"}`}>
            {etiqueta[t]}
          </button>
        ))}
      </div>

      <label className="flex items-center justify-center gap-1.5 text-[11px] bg-[#2A3547] hover:bg-[#3a4864] py-2 rounded-md cursor-pointer">
        <Upload size={12} /> {subiendo ? "Leyendo..." : `Adjuntar ${etiqueta[tipo].toLowerCase()}`}
        <input type="file" accept="image/*,application/pdf" className="hidden" disabled={subiendo}
          onChange={(e) => subir(e.target.files && e.target.files[0])} />
      </label>

      {visor && <VisorDocumentos visor={visor} setVisor={setVisor} />}
    </div>
  );
}

// Visor a pantalla completa, con flechas para pasar de un documento a otro.
function VisorDocumentos({ visor, setVisor }) {
  const { docs, indice } = visor;
  const actual = docs[indice];
  const irA = (i) => setVisor({ docs, indice: (i + docs.length) % docs.length });

  useEffect(() => {
    const alTeclear = (e) => {
      if (e.key === "Escape") setVisor(null);
      if (e.key === "ArrowRight") irA(indice + 1);
      if (e.key === "ArrowLeft") irA(indice - 1);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [indice, docs]);

  const etiqueta = { factura: "Factura", voucher: "Voucher", recibo: "Recibo", nota_credito: "Nota de crédito", otro: "Otro" };
  const esPdf = actual.storage_path && /\.pdf$/i.test(actual.storage_path);

  return (
    <div onClick={() => setVisor(null)} className="fixed inset-0 bg-black/85 flex items-center justify-center z-[60] p-5">
      <div onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full flex flex-col items-center gap-3">
        {esPdf ? (
          <a href={actual.url} target="_blank" rel="noreferrer"
            className="bg-[#161F2E] border border-[#2A3547] rounded-lg px-6 py-8 text-center">
            <FileText size={32} className="text-[#C9A227] mx-auto mb-2" />
            <div className="text-sm">Abrir el PDF</div>
          </a>
        ) : (
          <img src={actual.url} alt="Documento" className="max-w-full max-h-[78vh] rounded-md" />
        )}
        <div className="text-xs text-center text-white/80">
          {etiqueta[actual.tipo_documento] || actual.tipo_documento}
          {actual.proveedores?.nombre ? ` · ${actual.proveedores.nombre}` : ""}
          {actual.monto_total ? ` · ${fmt(actual.monto_total)}` : ""}
          {docs.length > 1 && <span className="text-white/50"> ({indice + 1}/{docs.length})</span>}
        </div>
      </div>
      {docs.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); irA(indice - 1); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white bg-black/40 rounded-full p-2">‹</button>
          <button onClick={(e) => { e.stopPropagation(); irA(indice + 1); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white bg-black/40 rounded-full p-2">›</button>
        </>
      )}
      <button onClick={() => setVisor(null)} className="absolute top-5 right-5 text-white"><X size={22} /></button>
    </div>
  );
}

export default DocumentarGastos;

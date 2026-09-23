// ============================================================
// tesoreria/Resumen.tsx — saldos, obras y movimientos
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { FileText, Upload, Trash2, AlertTriangle } from "lucide-react";
import { fmt, fmtDate, C_BOLSA } from "./comun";
import { DocumentosDelGasto } from "./Documentos";

export function ResumenTesoreria({ libre, delegado, apartado, bolsas, centros, cuotas }) {
  return (
    <div className="space-y-5">
      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4">
        <div className="text-[10px] uppercase tracking-wide text-[#8A93A3]">A tu disposición</div>
        <div className="font-serif text-3xl text-[#C9A227] mt-1">{fmt(libre)}</div>
        {(delegado > 0 || apartado > 0) && (
          <div className="text-[11px] text-[#8A93A3] mt-2 pt-2 border-t border-[#2A3547] space-y-1">
            {delegado > 0 && (
              <div className="flex justify-between">
                <span>Delegado a terceros</span>
                <span className="font-mono">{fmt(delegado)}</span>
              </div>
            )}
            {apartado > 0 && (
              <div className="flex justify-between">
                <span>Apartado o retenido</span>
                <span className="font-mono">{fmt(apartado)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-[#8A93A3] mb-2">Bolsas</div>
        <div className="space-y-2">
          {bolsas.map((b) => (
            <div key={b.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">{b.nombre}</div>
                <div className="text-[11px] text-[#8A93A3] truncate">
                  {b.banco ? `${b.banco}${b.titular ? ` · ${b.titular}` : ""}` : "Sin cuenta asignada"}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`font-mono text-sm ${b.disponible_para_gasto === false ? "text-[#8A93A3]" : ""}`}>
                  {fmt(b.saldo_actual)}
                </div>
                {b.disponible_para_gasto === false ? (
                  <div className="text-[9px] uppercase tracking-wide text-[#6b7280]">apartado</div>
                ) : b.delegada_a_rol_id ? (
                  <div className="text-[9px] uppercase tracking-wide text-[#6b7280]">
                    {b.titular ? `maneja ${b.titular}` : "delegado"}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#6b7280] mt-2">
          Lo marcado como apartado no cuenta en el total de arriba: son las cuotas ya
          reservadas y el fondo que el banco todavía no libera.
        </p>
      </div>

      {cuotas.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[#8A93A3] mb-2">Próximas cuotas de préstamos</div>
          <div className="space-y-1.5">
            {cuotas.map((c, i) => (
              <div key={i} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-[#8A93A3] truncate">
                    {c.acreedor} · #{c.numero} · {fmtDate(c.fecha_vencimiento)}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.estado === "reservada" && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#C9A227] text-[#C9A227] uppercase tracking-wide">Apartada</span>
                    )}
                    <span className="font-mono text-sm">{fmt(c.cuota_total)}</span>
                  </div>
                </div>
                <div className="text-[10px] text-[#8A93A3] mt-1">
                  Capital {fmt(c.capital)} · Interés {fmt(c.interes)} · Seguro {fmt(c.seguro)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <PresupuestoObras />
    </div>
  );
}

// ---------- Inversión declarada por obra ----------
//
// Cuando una obra llega a su presupuesto, el sistema rechaza el siguiente
// gasto. Por eso cada obra tiene aquí su botón para ajustarlo, y cada
// ajuste queda registrado con su motivo.

function PresupuestoObras() {
  const [filas, setFilas] = useState([]);

  const cargar = async () => {
    const { data } = await supabase.from("v_presupuesto_centros").select("*").order("nombre");
    setFilas(data || []);
  };
  useEffect(() => { cargar(); }, []);

  if (filas.length === 0) return null;

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#8A93A3] mb-2">Obras</div>
      <div className="space-y-2">
        {filas.map((c) => <ObraPresupuesto key={c.id} c={c} onCambio={cargar} />)}
      </div>
    </div>
  );
}

function ObraPresupuesto({ c, onCambio }) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState("sumar");     // "sumar" | "total"
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [historial, setHistorial] = useState(null);

  const tope = c.inversion_declarada != null;
  const actual = Number(c.inversion_declarada || 0);
  const gastado = Number(c.gastado || 0);
  const pct = tope && actual > 0 ? Math.min(100, (gastado / actual) * 100) : 0;
  const apretado = tope && pct >= 85;
  const nuevo = modo === "sumar" ? actual + (Number(monto) || 0) : (Number(monto) || 0);

  const abrir = async () => {
    setAbierto(true); setError(""); setMonto(""); setMotivo("");
    setModo(tope ? "sumar" : "total");
    const { data } = await supabase.from("presupuesto_ajustes")
      .select("antes, despues, motivo, created_at")
      .eq("centro_costo_id", c.id).order("created_at", { ascending: false }).limit(5);
    setHistorial(data || []);
  };

  const guardar = async () => {
    setError(""); setGuardando(true);
    try {
      const { error: e } = await supabase.rpc("ajustar_presupuesto", {
        p_centro: c.id, p_nuevo: nuevo, p_motivo: motivo.trim(),
      });
      if (e) throw new Error(e.message);
      setAbierto(false);
      onCambio();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };

  return (
    <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm truncate">{c.nombre}</div>
        <div className="font-mono text-xs shrink-0">{fmt(c.gastado)}</div>
      </div>
      {tope ? (
        <>
          <div className="h-1.5 bg-[#0C121C] rounded-full mt-2 overflow-hidden">
            <div className={`h-full rounded-full ${apretado ? "bg-red-500" : "bg-[#C9A227]"}`}
              style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[10px] text-[#8A93A3] mt-1">
            Quedan {fmt(c.disponible)} de {fmt(c.inversion_declarada)} declarados
            {Number(c.comprometido) > 0 && ` · ${fmt(c.comprometido)} por pagar`}
          </div>
          {apretado && (
            <div className="text-[10px] text-red-400 mt-0.5">
              Está cerca del tope: un gasto que lo pase va a ser rechazado.
            </div>
          )}
        </>
      ) : (
        <div className="text-[10px] text-[#6b7280] mt-1">Sin inversión declarada</div>
      )}

      {!abierto ? (
        <button onClick={abrir} className="text-[10px] text-[#C9A227] mt-1.5">
          {tope ? "Ajustar presupuesto" : "Ponerle presupuesto"}
        </button>
      ) : (
        <div className="mt-2 space-y-2">
          {tope && (
            <div className="grid grid-cols-2 gap-1.5">
              {[["sumar", "Sumarle"], ["total", "Cambiar el total"]].map(([k, t]) => (
                <button key={k} onClick={() => setModo(k)}
                  className={`text-[10px] py-1.5 rounded ${modo === k
                    ? "bg-[#C9A227] text-[#101826] font-medium" : "bg-[#0C121C] border border-[#2A3547] text-[#8A93A3]"}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <label className="block">
            <span className="text-[10px] text-[#8A93A3]">
              {modo === "sumar" ? "Cuánto se le suma" : "Presupuesto total"}
            </span>
            <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)}
              className="w-full mt-0.5 bg-[#0C121C] border border-[#2A3547] rounded p-1.5 text-[12px] font-mono" />
          </label>
          {Number(monto) > 0 && (
            <div className="text-[10px] text-[#8A93A3]">
              Queda en <span className="text-[#EDE7D9] font-mono">{fmt(nuevo)}</span>
              {tope && ` (antes ${fmt(actual)})`}, con {fmt(Math.max(0, nuevo - gastado - Number(c.comprometido || 0)))} libres.
            </div>
          )}
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué: ej. se agregaron acabados, subió el hierro..."
            className="w-full bg-[#0C121C] border border-[#2A3547] rounded p-1.5 text-[11px]" />
          {error && <div className="text-[11px] text-red-400">{error}</div>}
          <div className="flex gap-2">
            <button onClick={() => setAbierto(false)} disabled={guardando}
              className="flex-1 text-[10px] bg-[#2A3547] disabled:opacity-40 py-1.5 rounded">Cancelar</button>
            <button onClick={guardar} disabled={guardando || !(Number(monto) > 0) || !motivo.trim()}
              className="flex-1 text-[10px] bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-1.5 rounded">
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>

          {historial && historial.length > 0 && (
            <div className="pt-1.5 border-t border-[#2A3547]">
              <div className="text-[10px] uppercase tracking-wide text-[#6b7280] mb-1">Ajustes anteriores</div>
              {historial.map((h, i) => (
                <div key={i} className="text-[10px] text-[#8A93A3]">
                  {fmtDate(String(h.created_at).slice(0, 10))}: {h.antes != null ? fmt(h.antes) : "sin tope"} → {h.despues != null ? fmt(h.despues) : "sin tope"} · {h.motivo}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MovimientosTesoreria({ puedeBorrar = true }) {
  const [movs, setMovs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);
  // Mismo criterio que el reporte: un período, no un corte de 60 que
  // escondía movimientos viejos sin avisar.
  const hoyIso = new Date().toISOString().slice(0, 10);
  const primeroDelMes = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); })();
  const [desde, setDesde] = useState(primeroDelMes);
  const [hasta, setHasta] = useState(hoyIso);
  // Los mismos cortes del reporte, para poder mirar la lista por bolsa,
  // por obra, por proveedor... y no solo en orden de fecha.
  const [agrupar, setAgrupar] = useState("fecha");
  const [soloTipo, setSoloTipo] = useState("todos");
  const [borrando, setBorrando] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const borrar = async (id) => {
    setError(""); setTrabajando(true);
    try {
      const { error: e } = await supabase.rpc("borrar_movimiento", { p_id: id, p_motivo: motivo.trim() });
      if (e) throw new Error(e.message);
      setBorrando(null); setMotivo("");
      await cargar();
    } catch (e) { setError(e.message); }
    finally { setTrabajando(false); }
  };

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase
      .from("movimientos")
      // Hay dos caminos de movimientos a facturas: la columna vieja factura_id,
      // que ya no se usa, y la tabla factura_movimientos, que es la buena. Sin
      // decirle cuál, PostgREST responde 300 y la lista sale vacía.
      .select("*, facturas!factura_movimientos(id, storage_path, tipo_documento), centros_costo(nombre), categorias(nombre), proveedores(nombre), origen:bolsa_origen_id(nombre), destino:bolsa_destino_id(nombre)")
      .gte("fecha", desde).lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });
    const filas = data || [];

    // Miniatura del primer documento de cada movimiento, en un solo lote
    const rutas = filas
      .map((m) => (m.facturas || []).find((f) => f.storage_path)?.storage_path)
      .filter(Boolean);
    let urls = {};
    if (rutas.length) {
      const { data: firmados } = await supabase.storage
        .from("facturas").createSignedUrls(rutas, 3600);
      (firmados || []).forEach((f) => { if (f.signedUrl && f.path) urls[f.path] = f.signedUrl; });
    }
    // Dos movimientos del mismo día, mismo monto y misma bolsa casi siempre
    // son el mismo registrado dos veces.
    const veces = {};
    filas.forEach((m) => {
      const k = `${m.fecha}|${m.monto}|${m.tipo}|${m.bolsa_origen_id || ""}|${m.bolsa_destino_id || ""}`;
      veces[k] = (veces[k] || 0) + 1;
    });
    setMovs(filas.map((m) => {
      const primera = (m.facturas || []).find((f) => f.storage_path);
      const k = `${m.fecha}|${m.monto}|${m.tipo}|${m.bolsa_origen_id || ""}|${m.bolsa_destino_id || ""}`;
      return { ...m, miniatura: primera ? urls[primera.storage_path] : null,
               esPdf: primera ? /\.pdf$/i.test(primera.storage_path) : false,
               posibleDuplicado: veces[k] > 1 };
    }));
    setCargando(false);
  };
  useEffect(() => { cargar(); }, [desde, hasta]);

  const periodo = (
    <div className="grid grid-cols-2 gap-2 mb-3">
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
  );

  if (cargando) return <div>{periodo}<div className="text-sm text-[#8A93A3]">Cargando...</div></div>;
  if (movs.length === 0) return (
    <div>
      {periodo}
      <div className="text-sm text-[#8A93A3]">
        No hay movimientos entre esas fechas. Ampliá el período si buscás algo más viejo.
      </div>
    </div>
  );

  const visibles = movs.filter((m) => soloTipo === "todos" || m.tipo === soloTipo);
  const entro = visibles.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + Number(m.monto), 0);
  const salio = visibles.filter((m) => m.tipo === "egreso").reduce((a, m) => a + Number(m.monto), 0);

  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio",
                 "agosto","septiembre","octubre","noviembre","diciembre"];
  const claveDe = (m) => {
    if (agrupar === "bolsa") return m.tipo === "traslado"
      ? `${m.origen?.nombre || "?"} → ${m.destino?.nombre || "?"}`
      : (m.tipo === "egreso" ? m.origen?.nombre : m.destino?.nombre) || "Sin bolsa";
    if (agrupar === "banco") return (m.tipo === "egreso" ? m.origen?.banco : m.destino?.banco) || "Sin banco";
    if (agrupar === "categoria") return m.categorias?.nombre || "Sin clasificar";
    if (agrupar === "obra") return m.centros_costo?.nombre || "Sin obra";
    if (agrupar === "proveedor") return m.proveedores?.nombre || "Sin proveedor";
    if (agrupar === "mes") { const [a, mm] = m.fecha.split("-"); return `${MESES[Number(mm) - 1]} ${a}`; }
    return null;
  };

  const secciones = (() => {
    if (agrupar === "fecha") return [{ titulo: null, movs: visibles }];
    const mapa = new Map();
    for (const m of visibles) {
      const k = claveDe(m);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(m);
    }
    return [...mapa.entries()]
      .map(([titulo, ms]) => ({ titulo, movs: ms,
        total: ms.reduce((a, m) => a + (m.tipo === "ingreso" ? Number(m.monto) : -Number(m.monto)), 0) }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  })();

  return (
    <div className="space-y-2">
      {periodo}

      <div>
        <span className="text-[10px] uppercase tracking-wide text-[#8A93A3]">Agrupar por</span>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {[["fecha", "Fecha"], ["bolsa", "Bolsa"], ["banco", "Cuenta del banco"],
            ["categoria", "Tipo de gasto o ingreso"], ["obra", "Obra"],
            ["proveedor", "Proveedor"], ["mes", "Mes"]].map(([k, t]) => (
            <button key={k} onClick={() => setAgrupar(k)}
              className={`text-[11px] px-2.5 py-1.5 rounded-md ${agrupar === k
                ? "bg-[#C9A227] text-[#101826] font-medium" : "bg-[#2A3547] text-[#8A93A3]"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[["todos", "Todo"], ["ingreso", "Solo ingresos"], ["egreso", "Solo gastos"],
          ["traslado", "Solo traslados"]].map(([k, t]) => (
          <button key={k} onClick={() => setSoloTipo(k)}
            className={`text-[10px] px-2 py-1 rounded ${soloTipo === k
              ? "bg-[#161F2E] border border-[#C9A227] text-[#EDE7D9]"
              : "border border-[#2A3547] text-[#8A93A3]"}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-[11px] text-[#8A93A3] pb-1">
        <span>{visibles.length} movimiento{visibles.length === 1 ? "" : "s"}</span>
        <span className="font-mono">
          <span className="text-emerald-400">+{fmt(entro)}</span>
          {" · "}
          <span className="text-red-400">−{fmt(salio)}</span>
        </span>
      </div>
      {secciones.map((sec) => (
        <div key={sec.titulo || "todos"} className="space-y-2">
          {sec.titulo && (
            <div className="flex items-baseline justify-between gap-2 pt-1.5">
              <span className="text-[11px] text-[#EDE7D9] truncate">{sec.titulo}</span>
              <span className="text-[10px] text-[#8A93A3] shrink-0">
                {sec.movs.length} mov · <span className="font-mono">{fmt(Math.abs(sec.total))}</span>
              </span>
            </div>
          )}
      {sec.movs.map((m) => {
        const color = m.tipo === "ingreso" ? "text-emerald-400" : m.tipo === "egreso" ? "text-red-400" : "text-[#C9A227]";
        const signo = m.tipo === "ingreso" ? "+" : m.tipo === "egreso" ? "−" : "";
        const docs = (m.facturas || []).length;
        const expandido = abierto === m.id;
        return (
          <div key={m.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
            <div className="flex items-start gap-3">
              {/* Miniatura o marcador de que falta papel */}
              <button type="button" onClick={() => setAbierto(expandido ? null : m.id)}
                className="shrink-0 w-11 h-11 rounded-md bg-[#0C121C] border border-[#2A3547] overflow-hidden flex items-center justify-center">
                {m.miniatura && !m.esPdf ? (
                  <img src={m.miniatura} alt="" className="w-full h-full object-cover" />
                ) : docs > 0 ? (
                  <FileText size={16} style={{ color: C_BOLSA }} />
                ) : (
                  <Upload size={15} className="text-[#3a4864]" />
                )}
              </button>

              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{m.descripcion || "Sin descripción"}</div>
                {m.notas && (
                  <div className="text-[11px] text-[#EDE7D9]/70 italic line-clamp-2 whitespace-pre-line">{m.notas}</div>
                )}
                <div className="text-[11px] text-[#8A93A3] truncate">
                  {fmtDate(m.fecha)}
                  {m.tipo === "traslado"
                    ? ` · ${m.origen?.nombre} → ${m.destino?.nombre}`
                    : ` · ${m.origen?.nombre || m.destino?.nombre || ""}`}
                </div>
                <div className="text-[10px] text-[#8A93A3] truncate mt-0.5">
                  {[m.centros_costo?.nombre, m.categorias?.nombre, m.proveedores?.nombre]
                    .filter(Boolean).join(" · ")}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className={`font-mono text-sm ${color}`}>{signo}{fmt(m.monto)}</div>
                <button type="button" onClick={() => setAbierto(expandido ? null : m.id)}
                  className="text-[10px] mt-1"
                  style={{ color: docs > 0 ? C_BOLSA : "#8A93A3" }}>
                  {docs > 0 ? `${docs} doc${docs > 1 ? "s" : ""}` : "sin papeles"}
                </button>
              </div>
            </div>

            {m.factura_pendiente && (
              <div className="mt-2 text-[10px] text-amber-400">Falta la factura del proveedor</div>
            )}

            {m.posibleDuplicado && (
              <div className="mt-2 text-[10px] text-amber-400 flex items-start gap-1">
                <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                Hay otro movimiento del mismo día, por el mismo monto y la misma bolsa.
                Puede estar registrado dos veces.
              </div>
            )}

            {puedeBorrar && borrando !== m.id && (
              <button onClick={() => { setBorrando(m.id); setMotivo(""); setError(""); }}
                className="mt-2 flex items-center gap-1 text-[10px] text-[#8A93A3] hover:text-red-400">
                <Trash2 size={10} /> Borrar este movimiento
              </button>
            )}

            {borrando === m.id && (
              <div className="mt-2 space-y-1.5 border-t border-[#2A3547] pt-2">
                <div className="text-[10px] text-red-400">
                  Se va a borrar {fmt(m.monto)} del {fmtDate(m.fecha)}. El saldo de
                  {m.tipo === "ingreso" ? ` ${m.destino?.nombre}` : ` ${m.origen?.nombre}`} cambia.
                  Queda registrado quién lo borró y por qué.
                </div>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Por qué se borra: ej. se registró dos veces"
                  className="w-full bg-[#0C121C] border border-[#2A3547] rounded p-1.5 text-[11px]" />
                {error && <div className="text-[10px] text-red-400">{error}</div>}
                <div className="flex gap-2">
                  <button onClick={() => { setBorrando(null); setError(""); }} disabled={trabajando}
                    className="flex-1 text-[10px] bg-[#2A3547] disabled:opacity-40 py-1.5 rounded">Cancelar</button>
                  <button onClick={() => borrar(m.id)} disabled={trabajando || !motivo.trim()}
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] bg-red-900 disabled:opacity-40 py-1.5 rounded">
                    <Trash2 size={10} /> {trabajando ? "Borrando..." : "Borrar"}
                  </button>
                </div>
              </div>
            )}

            {expandido && (
              <DocumentosDelGasto
                gasto={{ movimiento_id: m.id, pagado: m.monto }}
                onCambio={cargar}
              />
            )}
          </div>
        );
      })}
        </div>
      ))}
    </div>
  );
}


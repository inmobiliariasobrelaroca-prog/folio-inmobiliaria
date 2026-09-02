// ============================================================
// tesoreria/Compromisos.tsx — cuentas por pagar y sus abonos
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Plus } from "lucide-react";
import { fmt, Campo, CampoMoneda, SelectorCategoria, C_BOLSA, C_GASTO } from "./comun";

// ---------- Cuentas por pagar ----------
//
// Compras donde se acordó un total pero solo se ha desembolsado parte,
// como las puertas y ventanas de MEC. El saldo no toca las bolsas
// hasta que se paga, pero sí cuenta contra la inversión de la obra.

export function Compromisos({ bolsas, onCambio }) {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [abonando, setAbonando] = useState(null);
  const [error, setError] = useState("");

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase.from("v_compromisos").select("*");
    setLista(data || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const pendientes = lista.filter((c) => c.estado === "pendiente");
  const totalPendiente = pendientes.reduce((s, c) => s + Number(c.saldo), 0);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;

  return (
    <div className="space-y-3">
      {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-md p-2.5">{error}</div>}

      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wide text-[#8A93A3]">Debemos en total</span>
        <span className="font-serif text-2xl" style={{ color: C_GASTO }}>{fmt(totalPendiente)}</span>
      </div>

      <button onClick={() => setCreando(!creando)}
        className="w-full flex items-center justify-center gap-1.5 text-xs bg-[#2A3547] py-2.5 rounded-md">
        <Plus size={14} /> {creando ? "Cancelar" : "Nueva cuenta por pagar"}
      </button>

      {creando && <NuevoCompromiso onCreado={() => { setCreando(false); cargar(); onCambio && onCambio(); }} />}

      {lista.length === 0 && <div className="text-sm text-[#8A93A3]">No hay cuentas por pagar registradas.</div>}

      {lista.map((c) => {
        const pct = Number(c.monto_total) > 0 ? (Number(c.pagado) / Number(c.monto_total)) * 100 : 0;
        const pagado = c.estado === "pagado";
        return (
          <div key={c.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">{c.descripcion}</div>
                <div className="text-[11px] text-[#8A93A3] truncate">
                  {c.proveedor || "Sin proveedor"}
                  {c.proveedor_contacto ? ` · ${c.proveedor_contacto}` : ""}
                </div>
                <div className="text-[10px] text-[#8A93A3] truncate mt-0.5">
                  {c.centro_costo || "Sin obra"}{c.categoria ? ` · ${c.categoria}` : ""}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-sm" style={{ color: pagado ? "#4ADE80" : C_GASTO }}>
                  {pagado ? "Pagado" : fmt(c.saldo)}
                </div>
                <div className="text-[10px] text-[#8A93A3]">de {fmt(c.monto_total)}</div>
              </div>
            </div>

            <div className="h-1.5 bg-[#0C121C] rounded-full mt-2 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pagado ? "#4ADE80" : C_BOLSA }} />
            </div>

            {!pagado && (
              abonando === c.id ? (
                <AbonoCompromiso compromiso={c} bolsas={bolsas}
                  onCancelar={() => setAbonando(null)}
                  onListo={() => { setAbonando(null); cargar(); onCambio && onCambio(); }} />
              ) : (
                <button onClick={() => setAbonando(c.id)}
                  className="mt-2.5 w-full text-[11px] bg-[#C9A227] text-[#101826] font-medium py-2 rounded-md">
                  Registrar un abono
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

function AbonoCompromiso({ compromiso, bolsas, onCancelar, onListo }) {
  const [monto, setMonto] = useState(Number(compromiso.saldo));
  const [bolsa, setBolsa] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setError(""); setGuardando(true);
    try {
      const { error: e } = await supabase.from("movimientos").insert({
        tipo: "egreso", fecha, monto: Number(monto),
        bolsa_origen_id: bolsa,
        centro_costo_id: compromiso.centro_costo_id,
        compromiso_id: compromiso.id,
        descripcion: `Abono a ${compromiso.descripcion}`,
        factura_pendiente: true,
      });
      if (e) throw new Error(e.message);
      onListo();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-2.5 pt-2.5 border-t border-[#2A3547] space-y-2">
      <CampoMoneda label="Monto del abono" value={monto} onChange={setMonto} />
      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿De qué bolsa sale?</span>
        <select value={bolsa} onChange={(e) => setBolsa(e.target.value)}
          className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm">
          <option value="">Elegí una bolsa</option>
          {bolsas.map((b) => <option key={b.id} value={b.id}>{b.nombre} — {fmt(b.saldo_actual)}</option>)}
        </select>
      </label>
      <Campo label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      {error && <div className="text-[11px] text-red-400">{error}</div>}
      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 text-[11px] bg-[#2A3547] py-2 rounded-md">Cancelar</button>
        <button onClick={guardar} disabled={!bolsa || Number(monto) <= 0 || guardando}
          className="flex-1 text-[11px] bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded-md">
          {guardando ? "Guardando..." : "Registrar abono"}
        </button>
      </div>
    </div>
  );
}

function NuevoCompromiso({ onCreado }) {
  const [descripcion, setDescripcion] = useState("");
  const [total, setTotal] = useState(0);
  const [centro, setCentro] = useState("");
  const [categoria, setCategoria] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [nuevoProv, setNuevoProv] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [arbol, setArbol] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    const [{ data: a }, { data: p }] = await Promise.all([
      supabase.from("v_centros_arbol").select("*").eq("estado", "activo").order("camino"),
      supabase.from("proveedores").select("id, nombre").order("nombre"),
    ]);
    setArbol(a || []);
    setProveedores(p || []);
  };
  useEffect(() => { cargar(); }, []);

  const crearProveedor = async () => {
    if (!nuevoProv.trim()) return;
    const { data, error: e } = await supabase.from("proveedores")
      .insert({ nombre: nuevoProv.trim() }).select("id, nombre").single();
    if (e) { setError(e.message); return; }
    setProveedores([...proveedores, data]);
    setProveedor(data.id);
    setNuevoProv("");
  };

  const guardar = async () => {
    setError(""); setGuardando(true);
    try {
      const { error: e } = await supabase.from("compromisos").insert({
        descripcion: descripcion.trim(),
        monto_total: Number(total),
        centro_costo_id: centro || null,
        categoria_id: categoria || null,
        proveedor_id: proveedor || null,
        fecha_limite: fechaLimite || null,
      });
      if (e) throw new Error(e.message);
      onCreado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 space-y-3">
      <Campo label="¿Qué se compró?" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <CampoMoneda label="Total acordado" value={total} onChange={setTotal} />
        <Campo label="Fecha límite (opcional)" type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
      </div>
      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿Para qué obra?</span>
        <select value={centro} onChange={(e) => setCentro(e.target.value)}
          className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm">
          <option value="">Sin obra</option>
          {arbol.map((c) => (
            <option key={c.id} value={c.id}>
              {"\u00A0\u00A0".repeat(c.nivel || 0)}{c.nivel > 0 ? "└ " : ""}{c.nombre}
            </option>
          ))}
        </select>
      </label>
      <SelectorCategoria tipo="egreso" valor={categoria} onChange={setCategoria} />
      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿A quién le debemos?</span>
        <select value={proveedor} onChange={(e) => setProveedor(e.target.value)}
          className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm">
          <option value="">Sin especificar</option>
          {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </label>
      <div className="flex gap-2">
        <input value={nuevoProv} onChange={(e) => setNuevoProv(e.target.value)} placeholder="O escribí un nombre nuevo"
          className="flex-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs" />
        <button type="button" onClick={crearProveedor} disabled={!nuevoProv.trim()}
          className="text-[11px] bg-[#2A3547] disabled:opacity-40 px-3 rounded-md">Agregar</button>
      </div>
      {error && <div className="text-[11px] text-red-400">{error}</div>}
      <button onClick={guardar} disabled={!descripcion.trim() || Number(total) <= 0 || guardando}
        className="w-full text-xs bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2.5 rounded-md">
        {guardando ? "Guardando..." : "Crear cuenta por pagar"}
      </button>
    </div>
  );
}

export default Compromisos;

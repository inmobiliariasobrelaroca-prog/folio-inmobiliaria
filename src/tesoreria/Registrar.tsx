// ============================================================
// tesoreria/Registrar.tsx — alta de ingresos, gastos y traslados
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { CheckCircle2 } from "lucide-react";
import { fmt, Campo, CampoMoneda, SelectorCategoria, CrearObra, CrearBolsa } from "./comun";

export function RegistrarMovimiento({ bolsas, centros, onGuardado }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [tipo, setTipo] = useState("egreso");
  const [fecha, setFecha] = useState(hoy);
  const [monto, setMonto] = useState(0);
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [centro, setCentro] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [pendiente, setPendiente] = useState(true);
  const [nuevaObra, setNuevaObra] = useState(false);
  const [nuevaBolsa, setNuevaBolsa] = useState(false);
  const [listaCentros, setListaCentros] = useState(centros);
  const [listaBolsas, setListaBolsas] = useState(bolsas);
  const [arbol, setArbol] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [proveedor, setProveedor] = useState("");
  const [nuevoProv, setNuevoProv] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(null);

  useEffect(() => { setListaCentros(centros); }, [centros]);
  useEffect(() => { setListaBolsas(bolsas); }, [bolsas]);

  const cargarCatalogos = async () => {
    const [{ data: a }, { data: p }] = await Promise.all([
      supabase.from("v_centros_arbol").select("*").eq("estado", "activo").order("camino"),
      supabase.from("proveedores").select("id, nombre, tipo").order("nombre"),
    ]);
    setArbol(a || []);
    setProveedores(p || []);
  };
  useEffect(() => { cargarCatalogos(); }, []);

  const crearProveedor = async () => {
    if (!nuevoProv.trim()) return;
    const { data, error: e } = await supabase.from("proveedores")
      .insert({ nombre: nuevoProv.trim(), tipo: "persona" }).select("id, nombre").single();
    if (e) { setError(e.message); return; }
    setProveedores([...proveedores, data]);
    setProveedor(data.id);
    setNuevoProv("");
  };

  const limpiar = () => {
    setMonto(0); setCentro(""); setCategoria(""); setDescripcion(""); setProveedor("");
    setFecha(hoy); setPendiente(true); setError("");
  };

  const listo =
    Number(monto) > 0 &&
    (tipo === "ingreso" ? destino : tipo === "egreso" ? origen : origen && destino && origen !== destino);

  const guardar = async () => {
    setError(""); setOk(null); setGuardando(true);
    try {
      const fila = {
        tipo, fecha, monto: Number(monto),
        descripcion: descripcion.trim() || null,
        bolsa_origen_id:  tipo === "ingreso" ? null : origen,
        bolsa_destino_id: tipo === "egreso"  ? null : destino,
        centro_costo_id:  tipo === "egreso" ? (centro || null) : null,
        categoria_id:     tipo === "traslado" ? null : (categoria || null),
        factura_pendiente: tipo === "egreso" ? pendiente : false,
        proveedor_id: tipo === "egreso" ? (proveedor || null) : null,
      };
      const { error: e } = await supabase.from("movimientos").insert(fila);
      if (e) throw new Error(e.message);
      setOk(`${tipo === "ingreso" ? "Ingreso" : tipo === "egreso" ? "Gasto" : "Traslado"} de ${fmt(monto)} registrado.`);
      limpiar();
      onGuardado && onGuardado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const selBolsa = (valor, set, label) => (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">{label}</span>
      <select value={valor} onChange={(e) => set(e.target.value)}
        className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]">
        <option value="">Elegí una bolsa</option>
        {listaBolsas.map((b) => (
          <option key={b.id} value={b.id}>{b.nombre} — {fmt(b.saldo_actual)}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      {ok && (
        <div className="text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800 rounded-md p-2.5 flex items-center gap-2">
          <CheckCircle2 size={14} /> {ok}
        </div>
      )}
      {error && (
        <div className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-md p-2.5">{error}</div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[["ingreso", "Entró dinero"], ["egreso", "Se gastó"], ["traslado", "Se movió"]].map(([v, l]) => (
          <button key={v} type="button" onClick={() => { setTipo(v); setError(""); setOk(null); }}
            className={`text-xs py-2.5 rounded-md border ${tipo === v ? "bg-[#C9A227] text-[#101826] border-[#C9A227] font-medium" : "border-[#2A3547] text-[#EDE7D9]"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CampoMoneda label="Monto" value={monto} onChange={setMonto} />
        <Campo label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>

      {tipo === "ingreso" && selBolsa(destino, setDestino, "¿A qué bolsa entró?")}
      {tipo === "egreso" && selBolsa(origen, setOrigen, "¿De qué bolsa salió?")}
      {tipo === "traslado" && (
        <div className="space-y-3">
          {selBolsa(origen, setOrigen, "Sale de")}
          {selBolsa(destino, setDestino, "Entra a")}
        </div>
      )}

      <div className="flex justify-end -mt-1">
        <button type="button" onClick={() => setNuevaBolsa(!nuevaBolsa)} className="text-[11px] text-[#C9A227] underline">
          {nuevaBolsa ? "Cancelar" : "+ Crear bolsa nueva"}
        </button>
      </div>
      {nuevaBolsa && (
        <CrearBolsa onCancelar={() => setNuevaBolsa(false)}
          onCreada={(b) => {
            setListaBolsas([...listaBolsas, { ...b, saldo_actual: 0 }]);
            if (tipo === "ingreso" || tipo === "traslado") setDestino(b.id); else setOrigen(b.id);
            setNuevaBolsa(false);
            onGuardado && onGuardado();
          }} />
      )}

      {tipo === "egreso" && (
        <>
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿Para qué obra?</span>
              <select value={centro} onChange={(e) => setCentro(e.target.value)}
                className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]">
                <option value="">Elegí una obra</option>
                {arbol.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"\u00A0\u00A0".repeat(c.nivel || 0)}{c.nivel > 0 ? "└ " : ""}{c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setNuevaObra(!nuevaObra)}
              className="mb-0.5 text-[11px] bg-[#2A3547] px-2.5 py-2 rounded-md shrink-0">
              {nuevaObra ? "Cancelar" : "+ Nueva"}
            </button>
          </div>
          {nuevaObra && (
            <CrearObra onCancelar={() => setNuevaObra(false)}
              onCreada={(c) => { setListaCentros([...listaCentros, c]); setCentro(c.id); setNuevaObra(false); onGuardado && onGuardado(); }} />
          )}
        </>
      )}

      {tipo !== "traslado" && (
        <SelectorCategoria tipo={tipo === "ingreso" ? "ingreso" : "egreso"} valor={categoria} onChange={setCategoria} />
      )}

      {tipo === "egreso" && (
        <div>
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿A quién se le pagó?</span>
              <select value={proveedor} onChange={(e) => setProveedor(e.target.value)}
                className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]">
                <option value="">Sin especificar</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
          </div>
          <div className="flex gap-2 mt-2">
            <input value={nuevoProv} onChange={(e) => setNuevoProv(e.target.value)}
              placeholder="O escribí un nombre nuevo"
              className="flex-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs" />
            <button type="button" onClick={crearProveedor} disabled={!nuevoProv.trim()}
              className="text-[11px] bg-[#2A3547] disabled:opacity-40 px-3 rounded-md">Agregar</button>
          </div>
        </div>
      )}

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿Qué fue exactamente?</span>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej. compra de duchas, comida de albañiles"
          className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]" />
      </label>

      {tipo === "egreso" && (
        <label className="flex items-center justify-between bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 cursor-pointer">
          <span className="text-xs">
            Falta la factura del proveedor
            <span className="block text-[10px] text-[#8A93A3] mt-0.5">
              Apagalo si no van a dar factura, como comida o pasajes.
            </span>
          </span>
          <input type="checkbox" checked={pendiente} onChange={(e) => setPendiente(e.target.checked)}
            className="w-4 h-4 accent-[#C9A227] shrink-0 ml-3" />
        </label>
      )}

      <button onClick={guardar} disabled={!listo || guardando}
        className="w-full bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-3 rounded-md text-sm">
        {guardando ? "Guardando..." : "Registrar movimiento"}
      </button>

      <p className="text-[10px] text-[#6b7280] text-center leading-relaxed">
        Si la bolsa no tiene saldo suficiente, o si el gasto pasa la inversión declarada de la obra,
        el sistema no lo deja pasar y te dice cuánto queda disponible.
      </p>
    </div>
  );
}

export default RegistrarMovimiento;

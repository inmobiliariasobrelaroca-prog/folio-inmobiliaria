// ============================================================
// Ofertas.tsx — solicitudes de rebaja de los vendedores
//
// Los lotes no tienen piso de negociación: el vendedor no puede bajar el
// precio por su cuenta. Cuando un cliente ofrece menos, manda la oferta
// con su motivo y aquí se aprueba o se rechaza.
//
// La respuesta es la autorización, y queda escrita con fecha y con quien
// la dio: si después hay discusión sobre a qué precio se cerró, está.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { Check, X, Clock } from "lucide-react";
import { fmt, fmtDate } from "./tesoreria/comun";

export default function Ofertas({ onVolver }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [verResueltas, setVerResueltas] = useState(false);

  const cargar = async () => {
    const { data } = await supabase
      .from("v_solicitudes_oferta")
      .select("*")
      .order("created_at", { ascending: false });
    setFilas(data || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;

  const pendientes = filas.filter((f) => f.estado === "pendiente");
  const resueltas = filas.filter((f) => f.estado !== "pendiente");

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#8A93A3] leading-relaxed">
        Ofertas que los vendedores recibieron por debajo del precio de lista.
        Mientras no las apruebes, no se puede cerrar a ese precio.
      </p>

      {pendientes.length === 0 && (
        <div className="text-[11px] text-[#8A93A3] py-2">
          No hay ofertas esperando respuesta.
        </div>
      )}

      {pendientes.map((f) => <Oferta key={f.id} f={f} onCambio={cargar} />)}

      {resueltas.length > 0 && (
        <button onClick={() => setVerResueltas(!verResueltas)}
          className="w-full text-[11px] text-[#8A93A3] py-2">
          {verResueltas ? "Ocultar" : "Ver"} las ya resueltas ({resueltas.length})
        </button>
      )}

      {verResueltas && resueltas.map((f) => (
        <div key={f.id} className="bg-[#0C121C] border border-[#2A3547] rounded-lg p-2.5 opacity-80">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] truncate">
              {f.lote_numero ? `Lote ${f.lote_numero}` : "Casa"} · {f.cliente_nombre}
            </span>
            <span className={`text-[10px] ${f.estado === "aprobada" ? "text-emerald-400" : "text-red-400"}`}>
              {f.estado === "aprobada"
                ? `aprobada a ${fmt(f.precio_autorizado)}`
                : "rechazada"}
            </span>
          </div>
          <div className="text-[10px] text-[#8A93A3]">
            Pedía {fmt(f.precio_ofrecido)} sobre {fmt(f.precio_lista)}
            {f.asesor_nombre ? ` · ${f.asesor_nombre}` : ""}
            {f.resuelta_at ? ` · ${fmtDate(String(f.resuelta_at).slice(0, 10))}` : ""}
          </div>
          {f.respuesta && (
            <div className="text-[10px] text-[#6b7280] mt-0.5">{f.respuesta}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function Oferta({ f, onCambio }) {
  const [modo, setModo] = useState(null);          // null | "aprobar" | "rechazar"
  const [respuesta, setRespuesta] = useState("");
  const [precio, setPrecio] = useState(String(f.precio_ofrecido));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const resolver = async (aprobar) => {
    setError(""); setGuardando(true);
    try {
      const { error: e } = await supabase.rpc("resolver_oferta", {
        p_solicitud: f.id,
        p_aprobar: aprobar,
        p_respuesta: respuesta.trim() || null,
        p_precio_autorizado: aprobar ? Number(precio) : null,
      });
      if (e) throw new Error(e.message);
      onCambio();
    } catch (e) { setError(e.message); setGuardando(false); }
  };

  return (
    <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm truncate">
            {f.lote_numero ? `Lote ${f.lote_numero}` : "Casa"}
            {f.sector ? ` · sector ${f.sector}` : ""}
            {f.destino ? ` · como ${f.destino === "casa" ? "casa" : "terreno"}` : ""}
          </div>
          <div className="text-[11px] text-[#8A93A3] truncate">
            {f.cliente_nombre}
            {f.cliente_telefono ? ` · ${f.cliente_telefono}` : ""}
          </div>
          <div className="text-[10px] text-[#6b7280] flex items-center gap-1 mt-0.5">
            <Clock size={10} />
            {f.asesor_nombre || "Sin asesor"} · {fmtDate(String(f.created_at).slice(0, 10))}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-sm text-amber-400">{fmt(f.precio_ofrecido)}</div>
          <div className="text-[10px] text-[#8A93A3]">de {fmt(f.precio_lista)}</div>
        </div>
      </div>

      <div className="text-[11px] mt-2 bg-[#0C121C] border border-[#2A3547] rounded-md p-2">
        <div className="text-[#8A93A3] text-[10px] uppercase tracking-wide mb-0.5">Por qué</div>
        {f.motivo}
      </div>

      <div className="text-[10px] text-[#8A93A3] mt-1.5">
        Pide {fmt(f.rebaja_pedida)} menos, un {f.rebaja_pct}% del precio
        {f.enganche_ofrecido ? ` · enganche ${fmt(f.enganche_ofrecido)}` : ""}
        {f.plazo_anios ? ` · ${f.plazo_anios} años` : ""}
      </div>

      {error && <div className="text-[11px] text-red-400 mt-1.5">{error}</div>}

      {!modo ? (
        <div className="flex gap-2 mt-2.5">
          <button onClick={() => { setModo("aprobar"); setRespuesta(""); setPrecio(String(f.precio_ofrecido)); }}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] bg-emerald-800 hover:bg-emerald-700 py-2 rounded-md">
            <Check size={12} /> Aprobar
          </button>
          <button onClick={() => { setModo("rechazar"); setRespuesta(""); }}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] bg-red-900 hover:bg-red-800 py-2 rounded-md">
            <X size={12} /> Rechazar
          </button>
        </div>
      ) : (
        <div className="mt-2.5 space-y-2">
          {modo === "aprobar" && (
            <label className="block">
              <span className="text-[10px] text-[#8A93A3]">
                Precio autorizado (podés aprobar a otro monto)
              </span>
              <input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)}
                className="w-full mt-0.5 bg-[#0C121C] border border-[#2A3547] rounded p-2 text-[12px] font-mono" />
            </label>
          )}
          <input value={respuesta} onChange={(e) => setRespuesta(e.target.value)}
            placeholder={modo === "aprobar"
              ? "Nota para el vendedor (opcional)"
              : "Por qué no se puede (se la va a leer el vendedor)"}
            className="w-full bg-[#0C121C] border border-[#2A3547] rounded p-2 text-[11px]" />
          <div className="flex gap-2">
            <button onClick={() => setModo(null)} disabled={guardando}
              className="flex-1 text-[10px] bg-[#2A3547] disabled:opacity-40 py-2 rounded">Cancelar</button>
            <button onClick={() => resolver(modo === "aprobar")}
              disabled={guardando || (modo === "aprobar" && !(Number(precio) > 0))}
              className={`flex-1 text-[10px] font-medium disabled:opacity-40 py-2 rounded ${
                modo === "aprobar" ? "bg-emerald-700 text-white" : "bg-red-900 text-white"}`}>
              {guardando ? "Guardando..." : modo === "aprobar" ? "Aprobar" : "Rechazar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

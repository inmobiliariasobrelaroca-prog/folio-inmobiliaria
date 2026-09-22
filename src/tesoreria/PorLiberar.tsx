// ============================================================
// tesoreria/PorLiberar.tsx
//
// Dinero que ya es de la empresa pero todavía no está en ninguna cuenta:
// un desembolso que el banco retiene, un depósito avisado que no se
// acredita, un pago prometido con fecha.
//
// No suma a ninguna bolsa hasta que se libera. Al liberarlo (todo o una
// parte, porque los bancos a veces sueltan por tramos) se crea el ingreso
// en su bolsa, ligado a este registro para no perder el rastro.
//
// No confundir con "Reserva servicio de deuda": esa plata sí está en la
// cuenta, solo que se apartó a propósito. Esto todavía no ha entrado.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Check, X, Clock } from "lucide-react";
import { fmt, fmtDate, C_ORIGEN, C_BOLSA } from "./comun";

export default function PorLiberar({ onCambio }) {
  const [fondos, setFondos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [verCerrados, setVerCerrados] = useState(false);

  const cargar = async () => {
    const { data } = await supabase
      .from("v_fondos_por_liberar")
      .select("*")
      .order("fecha", { ascending: true });
    setFondos(data || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;

  const abiertos = fondos.filter((f) => f.estado === "pendiente" || f.estado === "parcial");
  const cerrados = fondos.filter((f) => f.estado === "liberado" || f.estado === "descartado");
  const totalPendiente = abiertos.reduce((a, f) => a + Number(f.pendiente || 0), 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#8A93A3] leading-relaxed">
        Dinero que ya es de la empresa pero todavía no está en las cuentas. No
        se puede gastar hasta que lo pongás disponible.
      </p>

      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
        <div className="text-[10px] uppercase tracking-wide text-[#8A93A3]">Total por liberar</div>
        <div className="font-mono text-xl mt-0.5" style={{ color: C_BOLSA }}>{fmt(totalPendiente)}</div>
        <div className="text-[10px] text-[#6b7280] mt-0.5">
          {abiertos.length} {abiertos.length === 1 ? "fondo pendiente" : "fondos pendientes"}
        </div>
      </div>

      {abiertos.length === 0 && (
        <div className="text-[11px] text-[#8A93A3] py-2">
          No hay dinero por liberar. Para anotar uno, registrá un ingreso y
          elegí "No, está por liberar".
        </div>
      )}

      {abiertos.map((f) => (
        <Fondo key={f.id} f={f} onCambio={() => { cargar(); onCambio && onCambio(); }} />
      ))}

      {cerrados.length > 0 && (
        <button onClick={() => setVerCerrados(!verCerrados)}
          className="w-full text-[11px] text-[#8A93A3] py-2">
          {verCerrados ? "Ocultar" : "Ver"} los ya liberados o descartados ({cerrados.length})
        </button>
      )}
      {verCerrados && cerrados.map((f) => (
        <div key={f.id} className="bg-[#0C121C] border border-[#2A3547] rounded-lg p-2.5 opacity-70">
          <div className="text-[11px]">{f.concepto}</div>
          <div className="text-[10px] text-[#8A93A3]">
            {fmt(f.monto)} · {f.estado === "liberado"
              ? `liberado${f.ultima_liberacion ? ` el ${fmtDate(f.ultima_liberacion)}` : ""}`
              : `descartado${f.motivo_descarte ? `: ${f.motivo_descarte}` : ""}`}
          </div>
        </div>
      ))}
    </div>
  );
}

function Fondo({ f, onCambio }) {
  const [modo, setModo] = useState(null);          // null | "liberar" | "descartar"
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const pendiente = Number(f.pendiente || 0);
  const liberado = Number(f.liberado || 0);
  const pct = f.monto > 0 ? Math.round((liberado / Number(f.monto)) * 100) : 0;
  const vencido = f.fecha_esperada && f.fecha_esperada < new Date().toISOString().slice(0, 10);

  const liberar = async () => {
    setError(""); setGuardando(true);
    try {
      const { error: e } = await supabase.rpc("liberar_fondo", {
        p_fondo: f.id, p_monto: Number(monto), p_fecha: fecha, p_nota: nota.trim() || null,
      });
      if (e) throw new Error(e.message);
      onCambio();
    } catch (e) { setError(e.message); setGuardando(false); }
  };

  const descartar = async () => {
    setError(""); setGuardando(true);
    try {
      const { error: e } = await supabase.from("fondos_por_liberar")
        .update({ descartado: true, motivo_descarte: nota.trim() || null })
        .eq("id", f.id);
      if (e) throw new Error(e.message);
      onCambio();
    } catch (e) { setError(e.message); setGuardando(false); }
  };

  return (
    <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm">{f.concepto}</div>
          <div className="text-[11px] text-[#8A93A3]">
            Entra a {f.bolsa}{f.origen ? ` · ${f.origen}` : ""}
          </div>
          <div className="text-[10px] text-[#6b7280] mt-0.5 flex items-center gap-1">
            <Clock size={10} />
            Anotado el {fmtDate(f.fecha)}
            {f.fecha_esperada && (
              <span className={vencido ? "text-amber-400" : ""}>
                {" "}· se esperaba el {fmtDate(f.fecha_esperada)}{vencido ? ", ya pasó" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-sm" style={{ color: C_BOLSA }}>{fmt(pendiente)}</div>
          <div className="text-[10px] text-[#8A93A3]">por liberar</div>
        </div>
      </div>

      {liberado > 0 && (
        <div className="mt-2">
          <div className="h-1.5 bg-[#0C121C] rounded-full overflow-hidden">
            <div className="h-full" style={{ width: `${pct}%`, background: C_ORIGEN }} />
          </div>
          <div className="text-[10px] text-[#8A93A3] mt-1">
            Liberado {fmt(liberado)} de {fmt(f.monto)} ({pct}%)
          </div>
        </div>
      )}

      {f.notas && !modo && (
        <div className="text-[10px] text-[#6b7280] mt-1.5 leading-relaxed">{f.notas}</div>
      )}

      {!modo && (
        <div className="flex gap-2 mt-2.5">
          <button onClick={() => { setModo("liberar"); setMonto(String(pendiente)); setNota(""); setError(""); }}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] bg-[#C9A227] text-[#101826] font-medium py-2 rounded-md">
            <Check size={12} /> Poner disponible
          </button>
          <button onClick={() => { setModo("descartar"); setNota(""); setError(""); }}
            className="text-[11px] bg-[#2A3547] text-[#8A93A3] px-3 py-2 rounded-md">
            Descartar
          </button>
        </div>
      )}

      {modo === "liberar" && (
        <div className="mt-2.5 space-y-2">
          <p className="text-[10px] text-[#8A93A3]">
            Se crea el ingreso en {f.bolsa}. Si el banco soltó solo una parte,
            cambiá el monto: el resto queda por liberar.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] text-[#8A93A3]">Cuánto entró</span>
              <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)}
                className="w-full mt-0.5 bg-[#0C121C] border border-[#2A3547] rounded p-1.5 text-[11px] font-mono" />
            </label>
            <label className="block">
              <span className="text-[10px] text-[#8A93A3]">Qué día entró</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                className="w-full mt-0.5 bg-[#0C121C] border border-[#2A3547] rounded p-1.5 text-[11px]" />
            </label>
          </div>
          <input value={nota} onChange={(e) => setNota(e.target.value)}
            placeholder="Referencia o nota (opcional)"
            className="w-full bg-[#0C121C] border border-[#2A3547] rounded p-1.5 text-[11px]" />
          {error && <div className="text-[11px] text-red-400">{error}</div>}
          <div className="flex gap-2">
            <button onClick={() => setModo(null)} disabled={guardando}
              className="flex-1 text-[10px] bg-[#2A3547] disabled:opacity-40 py-2 rounded">Cancelar</button>
            <button onClick={liberar} disabled={guardando || !(Number(monto) > 0)}
              className="flex-1 text-[10px] bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded">
              {guardando ? "Guardando..." : `Liberar ${Number(monto) > 0 ? fmt(monto) : ""}`}
            </button>
          </div>
        </div>
      )}

      {modo === "descartar" && (
        <div className="mt-2.5 space-y-2">
          <p className="text-[10px] text-amber-400">
            Descartarlo es para cuando ese dinero ya no va a llegar. Lo liberado
            hasta ahora se queda; solo se deja de esperar el resto.
          </p>
          <input value={nota} onChange={(e) => setNota(e.target.value)}
            placeholder="Por qué ya no llega"
            className="w-full bg-[#0C121C] border border-[#2A3547] rounded p-1.5 text-[11px]" />
          {error && <div className="text-[11px] text-red-400">{error}</div>}
          <div className="flex gap-2">
            <button onClick={() => setModo(null)} disabled={guardando}
              className="flex-1 text-[10px] bg-[#2A3547] disabled:opacity-40 py-2 rounded">Cancelar</button>
            <button onClick={descartar} disabled={guardando || !nota.trim()}
              className="flex-1 flex items-center justify-center gap-1 text-[10px] bg-red-900 disabled:opacity-40 py-2 rounded">
              <X size={11} /> Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

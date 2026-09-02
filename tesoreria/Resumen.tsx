// ============================================================
// tesoreria/Resumen.tsx — saldos, obras y movimientos
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { fmt, fmtDate, C_BOLSA } from "./comun";

export function ResumenTesoreria({ total, bolsas, centros, cuotas }) {
  return (
    <div className="space-y-5">
      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4">
        <div className="text-[10px] uppercase tracking-wide text-[#8A93A3]">Disponible en todas las bolsas</div>
        <div className="font-serif text-3xl text-[#C9A227] mt-1">{fmt(total)}</div>
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
              <div className={`font-mono text-sm shrink-0 ${b.tipo === "reserva" ? "text-[#C9A227]" : ""}`}>
                {fmt(b.saldo_actual)}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#6b7280] mt-2">
          La reserva de servicio de deuda ya está apartada para las cuotas — no la uses para obra.
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

function PresupuestoObras() {
  const [filas, setFilas] = useState([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("v_presupuesto_centros").select("*").order("nombre");
      setFilas(data || []);
    })();
  }, []);

  if (filas.length === 0) return null;

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#8A93A3] mb-2">Obras</div>
      <div className="space-y-2">
        {filas.map((c) => {
          const tope = c.inversion_declarada != null;
          const pct = tope && Number(c.inversion_declarada) > 0
            ? Math.min(100, (Number(c.gastado) / Number(c.inversion_declarada)) * 100)
            : 0;
          const apretado = tope && pct >= 85;
          return (
            <div key={c.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm truncate">{c.nombre}</div>
                <div className="font-mono text-xs shrink-0">{fmt(c.gastado)}</div>
              </div>
              {tope ? (
                <>
                  <div className="h-1.5 bg-[#0C121C] rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${apretado ? "bg-red-500" : "bg-[#C9A227]"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-[#8A93A3] mt-1">
                    Quedan {fmt(c.disponible)} de {fmt(c.inversion_declarada)} declarados
                  </div>
                </>
              ) : (
                <div className="text-[10px] text-[#6b7280] mt-1">Sin inversión declarada</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MovimientosTesoreria() {
  const [movs, setMovs] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("movimientos")
        .select("*, centros_costo(nombre), categorias(nombre), origen:bolsa_origen_id(nombre), destino:bolsa_destino_id(nombre)")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      setMovs(data || []);
      setCargando(false);
    })();
  }, []);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;
  if (movs.length === 0) return <div className="text-sm text-[#8A93A3]">Sin movimientos todavía.</div>;

  return (
    <div className="space-y-2">
      {movs.map((m) => {
        const color = m.tipo === "ingreso" ? "text-emerald-400" : m.tipo === "egreso" ? "text-red-400" : "text-[#C9A227]";
        const signo = m.tipo === "ingreso" ? "+" : m.tipo === "egreso" ? "−" : "";
        return (
          <div key={m.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">{m.descripcion || "Sin descripción"}</div>
                <div className="text-[11px] text-[#8A93A3] truncate">
                  {fmtDate(m.fecha)}
                  {m.tipo === "traslado"
                    ? ` · ${m.origen?.nombre} → ${m.destino?.nombre}`
                    : ` · ${m.origen?.nombre || m.destino?.nombre || ""}`}
                </div>
                {(m.centros_costo?.nombre || m.categorias?.nombre) && (
                  <div className="text-[10px] text-[#8A93A3] mt-0.5">
                    {[m.centros_costo?.nombre, m.categorias?.nombre].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <div className={`font-mono text-sm shrink-0 ${color}`}>{signo}{fmt(m.monto)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// tesoreria/Resumen.tsx — saldos, obras y movimientos
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { FileText, Upload } from "lucide-react";
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
  const [abierto, setAbierto] = useState(null);

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase
      .from("movimientos")
      .select("*, facturas(id, storage_path, tipo_documento), centros_costo(nombre), categorias(nombre), proveedores(nombre), origen:bolsa_origen_id(nombre), destino:bolsa_destino_id(nombre)")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60);
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
    setMovs(filas.map((m) => {
      const primera = (m.facturas || []).find((f) => f.storage_path);
      return { ...m, miniatura: primera ? urls[primera.storage_path] : null,
               esPdf: primera ? /\.pdf$/i.test(primera.storage_path) : false };
    }));
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;
  if (movs.length === 0) return <div className="text-sm text-[#8A93A3]">Sin movimientos todavía.</div>;

  return (
    <div className="space-y-2">
      {movs.map((m) => {
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
  );
}


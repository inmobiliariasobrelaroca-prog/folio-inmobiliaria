// ============================================================
// tesoreria/Tarjetas.tsx
//
// Una tarjeta no es un préstamo: no tiene plazo ni cuota fija. Lo que
// hay es un corte cada mes con su saldo y su pago mínimo, y la decisión
// de cuánto pagar según lo que haya en caja.
//
// Por eso la pantalla gira alrededor del corte, no de la tarjeta.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Plus, CreditCard, Check, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { fmt, fmtDate, C_GASTO, C_BOLSA, C_ORIGEN, Campo, CampoMoneda } from "./comun";

const hoyISO = () => new Date().toISOString().slice(0, 10);
const mesActual = () => hoyISO().slice(0, 7) + "-01";

export default function Tarjetas({ bolsas, onCambio }) {
  const [tarjetas, setTarjetas] = useState([]);
  const [cortes, setCortes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState(null);
  const [panel, setPanel] = useState(null);   // { tarjetaId } corte nuevo
  const [pagando, setPagando] = useState(null); // corte
  const [aviso, setAviso] = useState("");

  const cargar = async () => {
    const [t, c] = await Promise.all([
      supabase.from("tarjetas").select("*").eq("activa", true).order("banco"),
      supabase.from("v_tarjetas_estado").select("*").order("periodo", { ascending: false }),
    ]);
    setTarjetas(t.data || []);
    setCortes(c.data || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const listo = (msg) => {
    setPanel(null); setPagando(null); setAviso(msg || "");
    cargar(); onCambio && onCambio();
  };

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;

  const pendienteTotal = cortes
    .filter((c) => c.pendiente > 0)
    .reduce((a, c) => a + Number(c.pendiente), 0);
  const minimoTotal = cortes
    .filter((c) => c.pendiente > 0)
    .reduce((a, c) => a + Number(c.falta_para_el_minimo), 0);

  return (
    <div className="space-y-3">
      {aviso && <div className="text-[11px] text-emerald-400">{aviso}</div>}

      {pendienteTotal > 0 && (
        <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 flex gap-6">
          <div>
            <div className="text-[10px] uppercase text-[#8A93A3]">Pendiente en tarjetas</div>
            <div className="font-mono text-lg" style={{ color: C_GASTO }}>{fmt(pendienteTotal)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[#8A93A3]">Falta para los mínimos</div>
            <div className="font-mono text-lg" style={{ color: C_BOLSA }}>{fmt(minimoTotal)}</div>
          </div>
        </div>
      )}

      {tarjetas.map((t) => {
        const mios = cortes.filter((c) => c.tarjeta_id === t.id);
        const vivo = mios.find((c) => Number(c.pendiente) > 0);
        return (
          <div key={t.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm flex items-center gap-1.5">
                  <CreditCard size={13} className="text-[#8A93A3] shrink-0" />
                  {t.nombre}
                </div>
                <div className="text-[10px] text-[#8A93A3]">
                  {t.titular}{t.ultimos_digitos ? ` · ····${t.ultimos_digitos}` : ""}
                  {t.dia_pago ? ` · paga el ${t.dia_pago}` : ""}
                </div>
              </div>
              {vivo && (
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm" style={{ color: C_GASTO }}>{fmt(vivo.pendiente)}</div>
                  <div className="text-[10px] text-[#8A93A3]">del corte {vivo.periodo?.slice(0, 7)}</div>
                </div>
              )}
            </div>

            {vivo && <Corte c={vivo} bolsas={bolsas}
              pagando={pagando === vivo.corte_id}
              onPagar={() => { setPagando(vivo.corte_id); setAviso(""); }}
              onCancelar={() => setPagando(null)} onListo={listo} />}

            {panel?.tarjetaId === t.id ? (
              <FormCorte tarjeta={t} onCancelar={() => setPanel(null)} onListo={listo} />
            ) : (
              <button onClick={() => { setPanel({ tarjetaId: t.id }); setAviso(""); }}
                className="w-full flex items-center justify-center gap-1 text-[11px] bg-[#2A3547] hover:bg-[#3a4864] py-1.5 rounded-md mt-2">
                <Plus size={11} /> Cargar el corte del mes
              </button>
            )}

            {mios.length > 0 && (
              <>
                <button onClick={() => setAbierta(abierta === t.id ? null : t.id)}
                  className="w-full flex items-center justify-center gap-1 text-[10px] text-[#8A93A3] hover:text-[#EDE7D9] mt-1.5 py-1">
                  {abierta === t.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  {abierta === t.id ? "Ocultar el historial" : `Ver los ${mios.length} cortes`}
                </button>
                {abierta === t.id && (
                  <div className="space-y-1 mt-1">
                    {mios.map((c) => (
                      <div key={c.corte_id}
                        className="bg-[#0C121C] border border-[#2A3547] rounded-md p-2 flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px]">{c.periodo?.slice(0, 7)}</div>
                          <div className="text-[10px] text-[#8A93A3]">
                            Saldo {fmt(c.saldo_total)} · mínimo {fmt(c.pago_minimo)} · pagado {fmt(c.pagado)}
                          </div>
                        </div>
                        <span className="text-[10px] shrink-0" style={{
                          color: c.estado === "pagado_total" ? C_ORIGEN
                               : c.estado === "sin_pagar" ? C_GASTO : C_BOLSA }}>
                          {{ pagado_total: "Pagado", pagado_minimo: "Solo el mínimo",
                             pagado_parcial: "Parcial", sin_pagar: "Sin pagar" }[c.estado]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- El corte vivo ----------

function Corte({ c, bolsas, pagando, onPagar, onCancelar, onListo }) {
  const [monto, setMonto] = useState(Number(c.falta_para_el_minimo) || Number(c.pendiente) || 0);
  const [bolsa, setBolsa] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const dias = c.dias_para_la_fecha_limite;
  const vencido = dias != null && dias < 0;

  const guardar = async () => {
    setError(""); setGuardando(true);
    try {
      const { data, error: e } = await supabase.rpc("pagar_tarjeta", {
        p_corte: c.corte_id, p_bolsa: bolsa,
        p_monto: Number(monto), p_fecha: fecha, p_nota: nota.trim() || null,
      });
      if (e) throw new Error(e.message);
      onListo(data);
    } catch (e) { setError(e.message); setGuardando(false); }
  };

  return (
    <div className="mt-2 pt-2 border-t border-[#2A3547]">
      <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
        <div>
          <div className="text-[#8A93A3]">Saldo del corte</div>
          <div className="font-mono">{fmt(c.saldo_total)}</div>
        </div>
        <div>
          <div className="text-[#8A93A3]">Pago mínimo</div>
          <div className="font-mono" style={{ color: C_BOLSA }}>{fmt(c.pago_minimo)}</div>
        </div>
        <div>
          <div className="text-[#8A93A3]">Ya pagado</div>
          <div className="font-mono" style={{ color: C_ORIGEN }}>{fmt(c.pagado)}</div>
        </div>
      </div>

      {c.fecha_limite && (
        <div className={`text-[10px] mb-2 ${vencido ? "text-red-400" : dias <= 5 ? "text-amber-400" : "text-[#8A93A3]"}`}>
          {vencido
            ? `Se pasó la fecha límite hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"} (${fmtDate(c.fecha_limite)}).`
            : `Fecha límite ${fmtDate(c.fecha_limite)} · faltan ${dias} día${dias === 1 ? "" : "s"}.`}
        </div>
      )}

      {/* Lo que cuesta no pagar todo. Es el dato que decide cuál liquidar
          primero cuando el dinero no alcanza para todas. */}
      {c.interes_mensual_estimado > 0 && Number(c.pendiente) > 0 && (
        <div className="text-[10px] text-amber-400 mb-2 flex items-start gap-1">
          <AlertTriangle size={11} className="shrink-0 mt-0.5" />
          <span>
            Dejar {fmt(c.pendiente)} sin pagar cuesta unos {fmt(c.interes_mensual_estimado)} de
            intereses este mes, al {c.tasa_anual}% anual.
          </span>
        </div>
      )}

      {!pagando ? (
        <button onClick={onPagar}
          className="w-full text-[11px] bg-[#C9A227] text-[#101826] font-medium py-2 rounded-md">
          Registrar un pago
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button onClick={() => setMonto(Number(c.falta_para_el_minimo))}
              disabled={!(Number(c.falta_para_el_minimo) > 0)}
              className="flex-1 text-[10px] bg-[#2A3547] disabled:opacity-40 py-1.5 rounded">
              Solo el mínimo · {fmt(c.falta_para_el_minimo)}
            </button>
            <button onClick={() => setMonto(Number(c.pendiente))}
              className="flex-1 text-[10px] bg-[#2A3547] py-1.5 rounded">
              Todo · {fmt(c.pendiente)}
            </button>
          </div>

          <CampoMoneda label="Cuánto se paga" value={monto} onChange={setMonto} />

          <div>
            <label className="block text-[10px] text-[#8A93A3] mb-1">De qué bolsa sale</label>
            <select value={bolsa} onChange={(e) => setBolsa(e.target.value)}
              className="w-full bg-[#0C121C] border border-[#2A3547] rounded-md p-2 text-[11px]">
              <option value="">Elegir...</option>
              {(bolsas || []).filter((b) => b.uso_permitido !== "ninguno" && b.uso_permitido !== "solo_deuda")
                .map((b) => (
                  <option key={b.id} value={b.id}>{b.nombre}</option>
                ))}
            </select>
          </div>

          <Campo label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <Campo label="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />

          {error && <div className="text-[11px] text-red-400">{error}</div>}

          <div className="flex gap-2">
            <button onClick={onCancelar} disabled={guardando}
              className="flex-1 text-[10px] bg-[#2A3547] disabled:opacity-40 py-2 rounded">Cancelar</button>
            <button onClick={guardar} disabled={!bolsa || guardando || Number(monto) <= 0}
              className="flex-1 flex items-center justify-center gap-1 text-[10px] bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded">
              {guardando ? "Guardando..." : (<><Check size={11} /> Pagar</>)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Cargar el corte del mes ----------

function FormCorte({ tarjeta, onCancelar, onListo }) {
  const [periodo, setPeriodo] = useState(mesActual().slice(0, 7));
  const [saldo, setSaldo] = useState(0);
  const [minimo, setMinimo] = useState(0);
  const [fechaCorte, setFechaCorte] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    setError(""); setGuardando(true);
    try {
      const { error: e } = await supabase.from("tarjeta_cortes").insert({
        tarjeta_id: tarjeta.id,
        periodo: `${periodo}-01`,
        fecha_corte: fechaCorte || null,
        fecha_limite: fechaLimite || null,
        saldo_total: Number(saldo),
        pago_minimo: Number(minimo),
        notas: notas.trim() || null,
      });
      if (e) throw new Error(
        e.code === "23505"
          ? "Ya hay un corte cargado para ese mes en esta tarjeta."
          : e.message);
      onListo(`Corte de ${periodo} cargado en ${tarjeta.nombre}.`);
    } catch (e) { setError(e.message); setGuardando(false); }
  };

  return (
    <div className="mt-2 pt-2 border-t border-[#2A3547] space-y-2">
      <Campo label="Mes del corte" type="month" value={periodo}
        onChange={(e) => setPeriodo(e.target.value)} />
      <CampoMoneda label="Saldo total del estado de cuenta" value={saldo} onChange={setSaldo} />
      <CampoMoneda label="Pago mínimo" value={minimo} onChange={setMinimo} />
      <Campo label="Fecha de corte" type="date" value={fechaCorte}
        onChange={(e) => setFechaCorte(e.target.value)} />
      <Campo label="Fecha límite de pago" type="date" value={fechaLimite}
        onChange={(e) => setFechaLimite(e.target.value)} />
      <Campo label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />

      {error && <div className="text-[11px] text-red-400">{error}</div>}

      <div className="flex gap-2">
        <button onClick={onCancelar} disabled={guardando}
          className="flex-1 text-[10px] bg-[#2A3547] disabled:opacity-40 py-2 rounded">Cancelar</button>
        <button onClick={guardar} disabled={guardando || Number(saldo) <= 0}
          className="flex-1 text-[10px] bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded">
          {guardando ? "Guardando..." : "Guardar el corte"}
        </button>
      </div>
    </div>
  );
}

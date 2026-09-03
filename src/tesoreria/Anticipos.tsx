// ============================================================
// tesoreria/Anticipos.tsx — adelantos a cuenta de comisiones
//
// El dinero que se le adelanta a quien vende, y su descuento
// cuando concreta una venta. No es gasto de obra: es por recuperar,
// y por eso vive aparte del resto del módulo.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Plus, CheckCircle2, Upload, FileText, X, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { fmt, fmtDate, llamarFuncionSesion, C_BOLSA, C_GASTO, Campo, CampoMoneda } from "./comun";

export default function Anticipos({ bolsas, onCambio }) {
  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [panel, setPanel] = useState(null); // { centroId, modo }
  const [abierta, setAbierta] = useState(null); // centro con la lista desplegada

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase.from("v_anticipos").select("*");
    setCuentas(data || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const listo = () => {
    setPanel(null);
    cargar();
    onCambio && onCambio();
  };

  // Recarga los totales sin mostrar "Cargando...", para que la lista
  // de adelantos no se desmonte y se pierda el mensaje del borrado.
  const refrescar = async () => {
    const { data } = await supabase.from("v_anticipos").select("*");
    setCuentas(data || []);
    onCambio && onCambio();
  };

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;

  const totalPorRecuperar = cuentas.reduce((s, c) => s + Number(c.por_recuperar), 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#8A93A3]">
        Lo que se adelanta acá no cuenta como costo de obra. Se vuelve
        comisión el día que la persona vende, y ahí se descuenta.
      </p>

      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wide text-[#8A93A3]">Por recuperar</span>
        <span className="font-serif text-2xl" style={{ color: C_BOLSA }}>{fmt(totalPorRecuperar)}</span>
      </div>

      {cuentas.length === 0 && (
        <div className="text-sm text-[#8A93A3]">No hay cuentas de adelantos.</div>
      )}

      {cuentas.map((c) => {
        const pct = Number(c.adelantado) > 0
          ? (Number(c.aplicado) / Number(c.adelantado)) * 100 : 0;
        return (
          <div key={c.centro_id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">{c.responsable || c.nombre}</div>
                <div className="text-[11px] text-[#8A93A3]">
                  {c.anticipo_mensual ? `${fmt(c.anticipo_mensual)} al mes` : "Sin monto fijo"}
                  {c.ultimo_adelanto ? ` · último ${fmtDate(c.ultimo_adelanto)}` : " · sin adelantos"}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-sm" style={{ color: C_GASTO }}>
                  {fmt(c.por_recuperar)}
                </div>
                <div className="text-[10px] text-[#8A93A3]">por recuperar</div>
              </div>
            </div>

            {Number(c.adelantado) > 0 && (
              <>
                <div className="h-1.5 bg-[#0C121C] rounded-full mt-2 overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: "#4ADE80" }} />
                </div>
                <div className="flex justify-between text-[10px] text-[#8A93A3] mt-1">
                  <span>Adelantado {fmt(c.adelantado)}</span>
                  <span>Recuperado {fmt(c.aplicado)}</span>
                </div>
              </>
            )}

            {panel?.centroId === c.centro_id ? (
              panel.modo === "adelanto" ? (
                <FormAdelanto cuenta={c} bolsas={bolsas}
                  onCancelar={() => setPanel(null)} onListo={listo} />
              ) : (
                <FormDescuento cuenta={c}
                  onCancelar={() => setPanel(null)} onListo={listo} />
              )
            ) : (
              <>
                <div className="flex gap-2 mt-2.5">
                  <button
                    onClick={() => setPanel({ centroId: c.centro_id, modo: "adelanto" })}
                    className="flex-1 flex items-center justify-center gap-1 text-[11px] bg-[#2A3547] py-2 rounded-md">
                    <Plus size={12} /> Dar adelanto
                  </button>
                  <button
                    onClick={() => setPanel({ centroId: c.centro_id, modo: "descuento" })}
                    disabled={Number(c.por_recuperar) <= 0}
                    className="flex-1 text-[11px] bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded-md">
                    Descontar de una venta
                  </button>
                </div>

                {Number(c.adelantado) > 0 && (
                  <ListaAdelantos
                    centroId={c.centro_id}
                    abierta={abierta === c.centro_id}
                    onToggle={() => setAbierta(abierta === c.centro_id ? null : c.centro_id)}
                    onBorrado={refrescar}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Dar un adelanto ----------
// La bolsa se elige cada vez: si Banrural anda bajo, sale de G&T o
// de la que haya, y queda registrado de dónde salió.

function FormAdelanto({ cuenta, bolsas, onCancelar, onListo }) {
  const [monto, setMonto] = useState(Number(cuenta.anticipo_mensual) || 0);
  const [bolsa, setBolsa] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [descripcion, setDescripcion] = useState("");
  const [archivo, setArchivo] = useState(null);
  const [paso, setPaso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const disponibles = (bolsas || []).filter(
    (b) => (b.uso_permitido || "libre") === "libre"
  );
  const elegida = disponibles.find((b) => b.id === bolsa);
  const alcanza = !elegida || Number(elegida.saldo_actual) >= Number(monto);

  const guardar = async () => {
    setError(""); setGuardando(true);
    try {
      const { data: cat } = await supabase
        .from("categorias").select("id")
        .eq("nombre", "Adelanto a cuenta de comisión").maybeSingle();

      const quien = cuenta.responsable || cuenta.nombre;
      const { data: mov, error: e } = await supabase.from("movimientos").insert({
        tipo: "egreso",
        fecha,
        monto: Number(monto),
        bolsa_origen_id: bolsa,
        centro_costo_id: cuenta.centro_id,
        categoria_id: cat?.id ?? null,
        descripcion: descripcion.trim()
          ? `Adelanto ${quien} — ${descripcion.trim()}`
          : `Adelanto a cuenta de comisión — ${quien}`,
        factura_pendiente: false,
      }).select("id").single();
      if (e) throw new Error(e.message);

      // El voucher del depósito. Si falla, el adelanto igual queda
      // registrado: perder el movimiento sería peor que perder la foto.
      if (archivo && mov?.id) {
        try {
          setPaso("Subiendo el voucher...");
          const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase();
          const d = new Date();
          const carpeta = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
          const path = `${carpeta}/${crypto.randomUUID()}.${ext}`;

          const { error: errUp } = await supabase.storage
            .from("facturas").upload(path, archivo, { contentType: archivo.type });
          if (errUp) throw new Error(errUp.message);

          const { data: nueva, error: errIns } = await supabase
            .from("facturas")
            .insert({ storage_path: path, archivo_url: path, tipo_documento: "voucher" })
            .select("id").single();
          if (errIns) throw new Error(errIns.message);

          setPaso("Leyendo el voucher...");
          await llamarFuncionSesion("lector-facturas", { factura_id: nueva.id });

          const { data: leida } = await supabase
            .from("facturas").select("monto_total").eq("id", nueva.id).single();
          const aplicar = Math.min(Number(leida?.monto_total) || Number(monto), Number(monto));

          const { error: errLink } = await supabase.from("factura_movimientos").insert({
            factura_id: nueva.id, movimiento_id: mov.id, monto_aplicado: aplicar,
          });
          if (errLink) throw new Error(errLink.message);

          await supabase.from("facturas")
            .update({ movimiento_id: mov.id, centro_costo_id: cuenta.centro_id })
            .eq("id", nueva.id);
        } catch (errDoc) {
          setPaso("");
          setError(`El adelanto se guardó, pero el voucher no: ${errDoc.message}`);
          setGuardando(false);
          return;
        }
      }

      setPaso("");
      onListo();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-2.5 pt-2.5 border-t border-[#2A3547] space-y-2">
      <CampoMoneda label="Cuánto se le da" value={monto} onChange={setMonto} />

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿De qué bolsa sale?</span>
        <select value={bolsa} onChange={(e) => setBolsa(e.target.value)}
          className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm">
          <option value="">Elegí una bolsa</option>
          {disponibles.map((b) => (
            <option key={b.id} value={b.id}>{b.nombre} — {fmt(b.saldo_actual)}</option>
          ))}
        </select>
      </label>

      {!alcanza && (
        <div className="text-[11px] text-amber-400">
          Esa bolsa no alcanza. Elegí otra o bajá el monto.
        </div>
      )}

      <Campo label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />

      <Campo label="Descripción o referencia (opcional)" value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)} />

      {/* El voucher del depósito que se le hizo */}
      {archivo ? (
        <div className="flex items-center gap-2 bg-[#0C121C] border border-[#2A3547] rounded-md p-2">
          <FileText size={14} style={{ color: C_BOLSA }} className="shrink-0" />
          <span className="text-[11px] truncate flex-1">{archivo.name}</span>
          <button type="button" onClick={() => setArchivo(null)}
            className="text-[#8A93A3] hover:text-[#EDE7D9] shrink-0"><X size={14} /></button>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-1.5 text-[11px] bg-[#2A3547] hover:bg-[#3a4864] py-2 rounded-md cursor-pointer">
          <Upload size={12} /> Adjuntar el voucher del depósito
          <input type="file" accept="image/*,application/pdf" className="hidden"
            onChange={(e) => setArchivo(e.target.files && e.target.files[0])} />
        </label>
      )}

      {error && <div className="text-[11px] text-red-400">{error}</div>}

      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 text-[11px] bg-[#2A3547] py-2 rounded-md">Cancelar</button>
        <button onClick={guardar} disabled={!bolsa || Number(monto) <= 0 || !alcanza || guardando}
          className="flex-1 text-[11px] bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded-md">
          {guardando ? (paso || "Guardando...") : "Registrar adelanto"}
        </button>
      </div>
    </div>
  );
}

// ---------- Descontar de una venta ----------
// No mueve dinero: convierte en comisión ganada parte de lo que ya
// se había adelantado, y se lo atribuye a la casa vendida.

function FormDescuento({ cuenta, onCancelar, onListo }) {
  const [monto, setMonto] = useState(Number(cuenta.por_recuperar) || 0);
  const [propiedad, setPropiedad] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [nota, setNota] = useState("");
  const [props, setProps] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("propiedades")
        .select("id, folio, direccion, cliente_nombre")
        .order("folio");
      setProps(data || []);
    })();
  }, []);

  const guardar = async () => {
    setError(""); setGuardando(true);
    try {
      const { error: e } = await supabase.from("anticipo_aplicaciones").insert({
        centro_id: cuenta.centro_id,
        fecha,
        monto: Number(monto),
        propiedad_id: propiedad || null,
        descripcion: nota.trim() || "Descontado de la comisión de la venta",
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
      <p className="text-[10px] text-[#6b7280]">
        Esto no mueve dinero. Registra que parte de lo adelantado ya se
        ganó. El pago de la comisión se registra aparte, por el neto que
        se le entregue.
      </p>

      <CampoMoneda label="Cuánto se descuenta" value={monto} onChange={setMonto} />

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿De qué venta?</span>
        <select value={propiedad} onChange={(e) => setPropiedad(e.target.value)}
          className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm">
          <option value="">Sin especificar</option>
          {props.map((p) => (
            <option key={p.id} value={p.id}>
              {p.folio ? `${p.folio} — ` : ""}{p.cliente_nombre || p.direccion}
            </option>
          ))}
        </select>
      </label>

      <Campo label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      <Campo label="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />

      {Number(monto) > Number(cuenta.por_recuperar) && (
        <div className="text-[11px] text-amber-400">
          Solo quedan {fmt(cuenta.por_recuperar)} por recuperar.
        </div>
      )}

      {error && <div className="text-[11px] text-red-400">{error}</div>}

      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 text-[11px] bg-[#2A3547] py-2 rounded-md">Cancelar</button>
        <button onClick={guardar}
          disabled={Number(monto) <= 0 || Number(monto) > Number(cuenta.por_recuperar) || guardando}
          className="flex-1 flex items-center justify-center gap-1 text-[11px] bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded-md">
          {guardando ? "Guardando..." : (<><CheckCircle2 size={12} /> Descontar</>)}
        </button>
      </div>
    </div>
  );
}

// ---------- Los adelantos uno por uno, y cómo deshacerlos ----------
// Un adelanto registrado dos veces descuadra la bolsa en silencio.
// El borrado va por eliminar_adelanto(), que verifica que sea de una
// cuenta recuperable y que no se haya descontado ya de una venta.

function ListaAdelantos({ centroId, abierta, onToggle, onBorrado }) {
  const [movs, setMovs] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [borrando, setBorrando] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase
      .from("v_adelantos_detalle")
      .select("*")
      .eq("centro_id", centroId)
      .order("created_at");
    setMovs(data || []);
    setCargando(false);
  };

  useEffect(() => { if (abierta) cargar(); }, [abierta, centroId]);

  // Mismo monto y misma fecha más de una vez: casi siempre es el
  // mismo adelanto registrado dos veces.
  const repetido = (m) =>
    movs.filter((o) => o.fecha === m.fecha && Number(o.monto) === Number(m.monto)).length > 1;

  const borrar = async (id) => {
    setError(""); setAviso(""); setBorrando(id);
    try {
      const { data, error: e } = await supabase.rpc("eliminar_adelanto", { p_movimiento: id });
      if (e) throw new Error(e.message);
      setConfirmar(null);
      setAviso(data || "Adelanto eliminado.");
      await cargar();
      onBorrado && onBorrado();
    } catch (e) {
      setError(e.message);
    } finally {
      setBorrando(null);
    }
  };

  return (
    <>
      <button onClick={onToggle}
        className="w-full flex items-center justify-center gap-1 text-[10px] text-[#8A93A3] hover:text-[#EDE7D9] mt-2 py-1">
        {abierta ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        {abierta ? "Ocultar los adelantos" : "Ver y corregir los adelantos"}
      </button>

      {abierta && (
        <div className="space-y-1.5 mt-1">
          {cargando && <div className="text-[10px] text-[#8A93A3]">Cargando...</div>}

          {aviso && <div className="text-[10px] text-emerald-400">{aviso}</div>}
          {error && <div className="text-[10px] text-red-400">{error}</div>}

          {!cargando && movs.length === 0 && (
            <div className="text-[10px] text-[#8A93A3]">Sin adelantos registrados.</div>
          )}

          {movs.map((m) => (
            <div key={m.movimiento_id}
              className="bg-[#0C121C] border border-[#2A3547] rounded-md p-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] truncate">{m.descripcion}</div>
                  <div className="text-[10px] text-[#8A93A3]">
                    {fmtDate(m.fecha)} · {m.bolsa || "sin bolsa"} ·{" "}
                    {Number(m.documentos) > 0 ? (
                      <span className="text-emerald-400">con voucher</span>
                    ) : (
                      <span className="text-amber-400">sin voucher</span>
                    )}
                  </div>
                  {repetido(m) && (
                    <div className="text-[10px] text-amber-400 mt-0.5">
                      Mismo monto y fecha que otro. Puede ser un duplicado.
                    </div>
                  )}
                </div>
                <div className="font-mono text-[11px] shrink-0" style={{ color: C_GASTO }}>
                  {fmt(m.monto)}
                </div>
                {confirmar !== m.movimiento_id && (
                  <button
                    onClick={() => { setConfirmar(m.movimiento_id); setError(""); setAviso(""); }}
                    className="text-[#8A93A3] hover:text-red-400 shrink-0 mt-0.5">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {confirmar === m.movimiento_id && (
                <div className="mt-2 pt-2 border-t border-[#2A3547]">
                  <div className="text-[10px] text-amber-400 mb-1.5">
                    {fmt(m.monto)} regresan a {m.bolsa || "su bolsa"}.
                    {Number(m.documentos) > 0 &&
                      " El voucher no se borra: queda suelto en Documentar."}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmar(null)}
                      className="flex-1 text-[10px] bg-[#2A3547] py-1.5 rounded">
                      No, dejarlo
                    </button>
                    <button onClick={() => borrar(m.movimiento_id)}
                      disabled={borrando === m.movimiento_id}
                      className="flex-1 text-[10px] bg-[#C0392B] disabled:opacity-40 py-1.5 rounded font-medium">
                      {borrando === m.movimiento_id ? "Borrando..." : "Sí, eliminar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ============================================================
// Propietario.tsx — casas que son de otra persona y administra la
// inmobiliaria.
//
// El caso que la motiva: la casa de Diagonal Lucas T. Cojulum es de Gustavo
// y Carolina; Cristian se la está pagando a ellos. La inmobiliaria cobra,
// les adelanta dinero cuando lo tiene, y se recupera cuando Cristian paga.
// Aparte les presta cada mes para el Banrural de su propia casa, y eso se
// recupera cuando vendan la casa de Zona 10.
//
// Son DOS cuentas y a propósito no se suman: el adelanto es rotativo, el
// préstamo crece hasta que se venda el inmueble que lo respalda. Un solo
// saldo haría imposible saber cuánto deben de verdad.
//
// La misma pantalla la ven los dos lados. La inmobiliaria además puede
// registrar entregas y recuperaciones; el propietario solo mira, salvo la
// boleta del banco, que sí la sube él.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { Upload, FileText, X, Check, ChevronLeft } from "lucide-react";
import { fmt, fmtDate } from "./tesoreria/comun";

const VERDE = "#2E9E6B", ROJO = "#C0392B", ORO = "#C9A227";

export default function Propietario({ esAdmin = false, onVolver }) {
  const [cuentas, setCuentas] = useState([]);
  const [cuenta, setCuenta] = useState(null);
  const [casas, setCasas] = useState([]);
  const [movs, setMovs] = useState([]);
  const [tab, setTab] = useState("casa");
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    const { data: cs } = await supabase.from("v_propietario_saldos").select("*").order("nombre");
    setCuentas(cs || []);
    const elegida = cuenta ? (cs || []).find((c) => c.cuenta_id === cuenta.cuenta_id) : (cs || [])[0];
    setCuenta(elegida || null);
    if (elegida) {
      const [{ data: props }, { data: ms }] = await Promise.all([
        supabase.from("cuentas_propietario_propiedades")
          .select("propiedad_id, propiedades(*)")
          .eq("cuenta_id", elegida.cuenta_id),
        supabase.from("propietario_movimientos").select("*")
          .eq("cuenta_id", elegida.cuenta_id)
          .order("fecha", { ascending: false }).order("created_at", { ascending: false }),
      ]);
      setCasas((props || []).map((p) => p.propiedades).filter(Boolean));
      setMovs(ms || []);
    }
    setCargando(false);
  };
  useEffect(() => { cargar(); }, [cuenta?.cuenta_id]);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;
  if (!cuenta) return (
    <div className="text-sm text-[#8A93A3]">
      No hay casas administradas a tu nombre.
    </div>
  );

  const adel = Number(cuenta.adelanto_pendiente || 0);
  const prest = Number(cuenta.prestamo_pendiente || 0);

  return (
    <div className="space-y-4">
      {onVolver && (
        <button onClick={onVolver} className="flex items-center gap-1 text-[11px] text-[#8A93A3]">
          <ChevronLeft size={14} /> Volver
        </button>
      )}

      <div>
        <div className="text-[10px] uppercase tracking-widest text-[#8A93A3]">Casas administradas</div>
        <h1 className="font-serif text-2xl">{cuenta.nombre}</h1>
      </div>

      {cuentas.length > 1 && (
        <select value={cuenta.cuenta_id}
          onChange={(e) => setCuenta(cuentas.find((c) => c.cuenta_id === e.target.value))}
          className="w-full bg-[#0C121C] border border-[#2A3547] rounded-md p-2 text-sm">
          {cuentas.map((c) => <option key={c.cuenta_id} value={c.cuenta_id}>{c.nombre}</option>)}
        </select>
      )}

      {/* Los dos saldos, separados a propósito */}
      <div className="grid grid-cols-2 gap-2">
        <Tarjeta rotulo="Adelantos por recuperar" valor={adel}
          nota="Se salda cuando el comprador paga" color={adel > 0 ? ORO : VERDE} />
        <Tarjeta rotulo="Préstamo por recuperar" valor={prest}
          nota={cuenta.garantia_nombre ? `Se paga al vender ${cuenta.garantia_nombre}` : "Sin respaldo señalado"}
          color={prest > 0 ? ROJO : VERDE} />
      </div>

      {cuenta.garantia_nota && (
        <div className="text-[10px] text-[#8A93A3] leading-relaxed bg-[#0C121C] border border-[#2A3547] rounded-md p-2">
          {cuenta.garantia_nota}
        </div>
      )}

      {Number(cuenta.prestamos_sin_boleta || 0) > 0 && (
        <div className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-800/60 rounded-md p-2">
          Hay {cuenta.prestamos_sin_boleta} pago{cuenta.prestamos_sin_boleta === 1 ? "" : "s"} del
          banco sin boleta adjunta. Subila en la pestaña Préstamo.
        </div>
      )}

      <div className="flex gap-1.5">
        {[["casa", "La casa"], ["adelantos", "Adelantos"], ["prestamo", "Préstamo"]].map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`text-[11px] px-3 py-1.5 rounded-md ${tab === k
              ? "bg-[#C9A227] text-[#101826] font-medium" : "bg-[#2A3547] text-[#8A93A3]"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "casa" && casas.map((c) => <Casa key={c.id} casa={c} />)}
      {tab === "casa" && casas.length === 0 && (
        <div className="text-[11px] text-[#8A93A3]">No hay casas enlazadas todavía.</div>
      )}

      {tab !== "casa" && (
        <Libro concepto={tab === "adelantos" ? "adelanto" : "prestamo"}
               movs={movs.filter((m) => m.concepto === (tab === "adelantos" ? "adelanto" : "prestamo"))}
               cuenta={cuenta} esAdmin={esAdmin} casas={casas} onCambio={cargar} />
      )}
    </div>
  );
}

function Tarjeta({ rotulo, valor, nota, color }) {
  return (
    <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-[#8A93A3]">{rotulo}</div>
      <div className="font-mono text-lg mt-0.5" style={{ color }}>{fmt(valor)}</div>
      <div className="text-[10px] text-[#6b7280] mt-0.5 leading-snug">{nota}</div>
    </div>
  );
}

// ---------- Cómo va pagando el comprador ----------

function Casa({ casa }) {
  const [cuotas, setCuotas] = useState([]);
  const [todo, setTodo] = useState(false);
  // Recibo abierto y su enlace ya firmado. Se pide solo al tocarlo: firmar
  // todos de una vez sería pedirle al servidor decenas de enlaces que nadie
  // va a mirar.
  const [abierta, setAbierta] = useState(null);
  const [recibos, setRecibos] = useState({});
  const [vista, setVista] = useState("pagos");
  const [docs, setDocs] = useState([]);

  useEffect(() => {
    supabase.from("documentos")
      .select("id, nombre, archivo_url, tipo, created_at")
      .eq("propiedad_id", casa.id).order("created_at", { ascending: false })
      .then(({ data }) => setDocs(data || []));
  }, [casa.id]);

  useEffect(() => {
    supabase.from("cuotas")
      .select("id, numero, fecha, pago, estado, fecha_pago_real, saldo_final, comprobantes(id, estado, imagen_url)")
      .eq("propiedad_id", casa.id).order("numero")
      .then(({ data }) => setCuotas(data || []));
  }, [casa.id]);

  const verRecibo = async (cuota) => {
    if (abierta === cuota.id) { setAbierta(null); return; }
    setAbierta(cuota.id);
    if (recibos[cuota.id]) return;
    const ruta = (cuota.comprobantes || [])[0]?.imagen_url;
    if (!ruta) return;
    // Las boletas viejas quedaron como enlace de Drive; las nuevas viven
    // dentro de la app y hay que firmarlas para poder verlas.
    if (/^https?:\/\//i.test(ruta)) {
      setRecibos((r) => ({ ...r, [cuota.id]: { url: ruta, externo: true } }));
      return;
    }
    const { data } = await supabase.storage.from("comprobantes").createSignedUrl(ruta, 3600);
    setRecibos((r) => ({ ...r, [cuota.id]: {
      url: data?.signedUrl || null,
      esPdf: /\.pdf($|\?)/i.test(ruta),
    } }));
  };

  const pagadas = cuotas.filter((c) => c.estado === "pagado");
  const ultima = pagadas[pagadas.length - 1];
  const proxima = cuotas.find((c) => c.estado !== "pagado");
  const hoy = new Date().toISOString().slice(0, 10);
  const vencidas = cuotas.filter((c) => c.estado !== "pagado" && c.fecha < hoy);
  const verlas = todo ? cuotas : cuotas.slice(0, 14);

  return (
    <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 space-y-2">
      <div>
        <div className="text-sm">{casa.direccion || casa.folio}</div>
        <div className="text-[11px] text-[#8A93A3]">
          Se la paga {casa.cliente_nombre}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="text-[10px] text-[#8A93A3]">Van pagadas</div>
          <div className="font-mono">{pagadas.length} de {cuotas.length}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#8A93A3]">Saldo del comprador</div>
          <div className="font-mono">{ultima ? fmt(ultima.saldo_final) : "—"}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#8A93A3]">Próxima cuota</div>
          <div className="font-mono">{proxima ? fmtDate(proxima.fecha) : "—"}</div>
        </div>
      </div>

      {vencidas.length > 0 && (
        <div className="text-[11px] text-amber-400">
          {vencidas.length} cuota{vencidas.length === 1 ? "" : "s"} sin pagar a la fecha.
        </div>
      )}

      <div className="flex gap-1.5 border-t border-[#2A3547] pt-2">
        {[["pagos", "Pagos"], ["condiciones", "Condiciones"], ["papeles", `Papeles (${docs.length})`]].map(([k, t]) => (
          <button key={k} onClick={() => setVista(k)}
            className={`text-[10px] px-2.5 py-1 rounded ${vista === k
              ? "bg-[#2A3547] text-[#EDE7D9]" : "text-[#8A93A3]"}`}>
            {t}
          </button>
        ))}
      </div>

      {vista === "condiciones" && <Condiciones casa={casa} />}
      {vista === "papeles" && <Papeles docs={docs} />}

      {vista === "pagos" && (
      <div className="pt-1 space-y-1">
        {verlas.map((c) => {
          const tiene = (c.comprobantes || []).length > 0;
          const rec = recibos[c.id];
          return (
            <div key={c.id}>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="w-7 text-[#6b7280]">#{c.numero}</span>
                <span className="w-16 text-[#8A93A3]">{fmtDate(c.fecha)}</span>
                <span className="flex-1 font-mono">{fmt(c.pago)}</span>
                {tiene && (
                  <button onClick={() => verRecibo(c)} title="Ver la boleta del pago"
                    className="text-[#C9A227] hover:text-[#EDE7D9] shrink-0">
                    <FileText size={11} />
                  </button>
                )}
                <span style={{ color: c.estado === "pagado" ? VERDE : c.fecha < hoy ? ROJO : "#8A93A3" }}>
                  {c.estado === "pagado"
                    ? `pagada ${c.fecha_pago_real ? fmtDate(c.fecha_pago_real) : ""}`
                    : c.fecha < hoy ? "sin pagar" : "pendiente"}
                </span>
              </div>

              {abierta === c.id && (
                <div className="mt-1.5 mb-2 ml-7">
                  {!rec ? (
                    <div className="text-[10px] text-[#8A93A3]">Abriendo la boleta...</div>
                  ) : !rec.url ? (
                    <div className="text-[10px] text-[#8A93A3]">Esa cuota no tiene boleta adjunta.</div>
                  ) : rec.esPdf || rec.externo ? (
                    <a href={rec.url} target="_blank" rel="noopener noreferrer"
                       className="text-[10px] text-[#C9A227] underline">
                      Abrir la boleta{rec.externo ? " (está en Drive)" : " en PDF"}
                    </a>
                  ) : (
                    <a href={rec.url} target="_blank" rel="noopener noreferrer">
                      <img src={rec.url} alt={`Boleta de la cuota ${c.numero}`}
                           className="max-h-60 rounded border border-[#2A3547]" />
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {cuotas.length > 14 && (
          <button onClick={() => setTodo(!todo)} className="text-[10px] text-[#C9A227] pt-1">
            {todo ? "Ver menos" : `Ver las ${cuotas.length} cuotas`}
          </button>
        )}
      </div>
      )}
    </div>
  );
}

// ---------- Lo que dice el contrato, en números ----------

function Condiciones({ casa }) {
  const filas = [
    ["Precio de venta", casa.precio != null ? fmt(casa.precio) : "—"],
    ["Enganche", casa.enganche != null ? fmt(casa.enganche) : "—"],
    ["Monto financiado", casa.precio != null && casa.enganche != null
      ? fmt(Math.max(0, Number(casa.precio) - Number(casa.enganche))) : "—"],
    ["Tasa de interés anual", casa.tasa_anual != null ? `${casa.tasa_anual}%` : "—"],
    ["Plazo", casa.plazo_anios ? `${casa.plazo_anios} años` : "—"],
    ["Sistema", casa.sistema_amortizacion === "saldos" ? "Sobre saldos" : "Cuota nivelada"],
    ["Forma de pago", casa.sistema_pago === "vencido" ? "Mes vencido" : "Mes adelantado"],
    ["Días de gracia", casa.dias_gracia != null ? `${casa.dias_gracia} días` : "—"],
    ["Mora diaria", casa.mora_diaria ? `${fmt(casa.mora_diaria)} por día` : "Sin mora"],
    ...(casa.aplica_luz
      ? [["Luz mensual", `${fmt(casa.monto_luz_mensual)} · ${casa.dias_gracia_luz ?? 0} días de gracia`]]
      : []),
    ...(casa.aplica_mantenimiento
      ? [["Mantenimiento", fmt(casa.monto_mantenimiento_mensual)]] : []),
    ["Fecha de inicio", casa.fecha_inicio ? fmtDate(casa.fecha_inicio) : "—"],
  ];
  return (
    <div className="pt-2 space-y-1">
      {filas.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 text-[11px] border-b border-[#2A3547] pb-1">
          <span className="text-[#8A93A3]">{k}</span>
          <span className="font-mono text-right">{v}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Contrato y demás papeles ----------

function Papeles({ docs }) {
  const [urls, setUrls] = useState({});

  const abrir = async (d) => {
    if (urls[d.id]) return;
    if (/^https?:\/\//i.test(d.archivo_url)) {
      setUrls((u) => ({ ...u, [d.id]: d.archivo_url }));
      return;
    }
    const { data } = await supabase.storage.from("documentos")
      .createSignedUrl(d.archivo_url, 3600);
    setUrls((u) => ({ ...u, [d.id]: data?.signedUrl || null }));
  };

  if (docs.length === 0) {
    return <div className="text-[11px] text-[#8A93A3] pt-2">No hay papeles cargados todavía.</div>;
  }

  return (
    <div className="pt-2 space-y-1.5">
      {docs.map((d) => (
        <div key={d.id} className="flex items-center gap-2 bg-[#0C121C] border border-[#2A3547] rounded-md p-2">
          <FileText size={13} className="text-[#C9A227] shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] truncate">{d.nombre}</div>
            <div className="text-[10px] text-[#6b7280]">
              {d.tipo || "documento"} · {fmtDate(String(d.created_at).slice(0, 10))}
            </div>
          </div>
          {urls[d.id] ? (
            <a href={urls[d.id]} target="_blank" rel="noopener noreferrer"
               className="text-[10px] text-[#C9A227] shrink-0">Abrir</a>
          ) : (
            <button onClick={() => abrir(d)} className="text-[10px] text-[#8A93A3] shrink-0">Ver</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- El libro de la cuenta ----------

function Libro({ concepto, movs, cuenta, esAdmin, casas, onCambio }) {
  const [modo, setModo] = useState(null);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [desc, setDesc] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const esAdelanto = concepto === "adelanto";
  const entregas = movs.filter((m) => m.clase === "entrega");
  const pendiente = Number(esAdelanto ? cuenta.adelanto_pendiente : cuenta.prestamo_pendiente);

  const registrar = async (clase) => {
    setError(""); setGuardando(true);
    try {
      const fn = clase === "entrega" ? "entregar_a_propietario" : "recuperar_de_propietario";
      const args = clase === "entrega"
        ? { p_cuenta: cuenta.cuenta_id, p_concepto: concepto, p_monto: Number(monto),
            p_fecha: fecha, p_descripcion: desc.trim() || null, p_bolsa: null }
        : { p_cuenta: cuenta.cuenta_id, p_concepto: concepto, p_monto: Number(monto),
            p_fecha: fecha, p_descripcion: desc.trim() || null, p_cuota: null };
      const { error: e } = await supabase.rpc(fn, args);
      if (e) throw new Error(e.message);
      setModo(null); setMonto(""); setDesc("");
      onCambio();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-[#8A93A3] leading-relaxed">
        {esAdelanto
          ? "Dinero entregado antes de que el comprador pague. Se salda cuando entra la cuota, así sea tarde."
          : `Dinero prestado para el banco. No se salda mes a mes: se recupera de una sola vez${cuenta.garantia_nombre ? `, al vender ${cuenta.garantia_nombre}` : ""}.`}
      </p>

      {esAdmin && !modo && (
        <div className="flex gap-2">
          <button onClick={() => { setModo("entrega"); setError(""); }}
            className="flex-1 text-[11px] bg-[#C9A227] text-[#101826] font-medium py-2 rounded-md">
            Registrar entrega
          </button>
          <button onClick={() => { setModo("recuperacion"); setError(""); setMonto(String(pendiente)); }}
            disabled={pendiente <= 0}
            className="flex-1 text-[11px] bg-[#2A3547] disabled:opacity-40 py-2 rounded-md">
            Registrar recuperación
          </button>
        </div>
      )}

      {esAdmin && modo && (
        <div className="bg-[#0C121C] border border-[#2A3547] rounded-md p-3 space-y-2">
          <div className="text-[11px] text-[#EDE7D9]">
            {modo === "entrega"
              ? `Entregar dinero ${esAdelanto ? "como adelanto" : "para el banco"}`
              : `Recuperar ${esAdelanto ? "del adelanto" : "del préstamo"}`}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] text-[#8A93A3]">Cuánto</span>
              <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)}
                className="w-full mt-0.5 bg-[#161F2E] border border-[#2A3547] rounded p-2 text-[12px] font-mono" />
            </label>
            <label className="block">
              <span className="text-[10px] text-[#8A93A3]">Qué día</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                className="w-full mt-0.5 bg-[#161F2E] border border-[#2A3547] rounded p-2 text-[12px]" />
            </label>
          </div>
          <input value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder={modo === "entrega"
              ? (esAdelanto ? "Ej. a cuenta de la cuota de septiembre" : "Ej. cuota Banrural de septiembre")
              : "Ej. cubierto con la cuota de Cristian"}
            className="w-full bg-[#161F2E] border border-[#2A3547] rounded p-2 text-[11px]" />
          {error && <div className="text-[11px] text-red-400">{error}</div>}
          <div className="flex gap-2">
            <button onClick={() => setModo(null)} disabled={guardando}
              className="flex-1 text-[10px] bg-[#2A3547] disabled:opacity-40 py-2 rounded">Cancelar</button>
            <button onClick={() => registrar(modo)} disabled={guardando || !(Number(monto) > 0)}
              className="flex-1 text-[10px] bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded">
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {movs.length === 0 && (
        <div className="text-[11px] text-[#8A93A3] py-2">Todavía no hay movimientos.</div>
      )}

      {movs.map((m) => (
        <Movimiento key={m.id} m={m} puedeSubir={!esAdelanto} onCambio={onCambio} />
      ))}
    </div>
  );
}

function Movimiento({ m, puedeSubir, onCambio }) {
  const [subiendo, setSubiendo] = useState(false);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!m.comprobante_path) return;
    supabase.storage.from("comprobantes").createSignedUrl(m.comprobante_path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl || null));
  }, [m.comprobante_path]);

  const subir = async (archivo) => {
    setError(""); setSubiendo(true);
    try {
      const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase();
      const path = `propietarios/${m.id}-${Date.now()}.${ext}`;
      const { error: e1 } = await supabase.storage
        .from("comprobantes").upload(path, archivo, { contentType: archivo.type });
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase.from("propietario_movimientos")
        .update({ comprobante_path: path }).eq("id", m.id);
      if (e2) throw new Error(e2.message);
      onCambio();
    } catch (e) { setError(e.message); }
    finally { setSubiendo(false); }
  };

  const entrega = m.clase === "entrega";

  return (
    <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-2.5">
      <div className="flex items-start gap-2">
        <span className="text-[10px] text-[#6b7280] w-16 shrink-0">{fmtDate(m.fecha)}</span>
        <span className="flex-1 text-[11px] text-[#8A93A3] min-w-0">
          {m.descripcion || (entrega ? "Entrega" : "Recuperación")}
        </span>
        <span className="font-mono text-[11px] shrink-0"
              style={{ color: entrega ? ROJO : VERDE }}>
          {entrega ? "+" : "−"}{fmt(m.monto)}
        </span>
      </div>

      {puedeSubir && entrega && (
        <div className="mt-1.5 ml-[4.5rem]">
          {m.comprobante_path ? (
            <a href={url || "#"} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1 text-[10px] text-[#C9A227]">
              <FileText size={10} /> Ver la boleta del banco
            </a>
          ) : (
            <label className="flex items-center gap-1 text-[10px] text-[#8A93A3] cursor-pointer hover:text-[#C9A227]">
              <Upload size={10} /> {subiendo ? "Subiendo..." : "Subir la boleta del banco"}
              <input type="file" accept="image/*,application/pdf" className="hidden" disabled={subiendo}
                onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])} />
            </label>
          )}
          {error && <div className="text-[10px] text-red-400 mt-0.5">{error}</div>}
        </div>
      )}
    </div>
  );
}

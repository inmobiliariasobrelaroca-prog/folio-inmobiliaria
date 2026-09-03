// ============================================================
// tesoreria/Rentas.tsx — locales en alquiler
//
// El inquilino que ya tiene portal sube su boleta y vos la aprobás.
// Esta pantalla es para el otro caso: el que deposita y te avisa por
// mensaje. Registrás el cobro y subís la boleta en el mismo paso.
//
// También sirve para adjuntar la boleta de un cobro que se registró
// antes sin ella.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Upload, FileText, X, Check, ChevronDown, ChevronUp } from "lucide-react";
import { fmt, fmtDate, C_ORIGEN, C_BOLSA, Campo, CampoMoneda } from "./comun";

// La carpeta del comprobante es el id de la propiedad. Así lo exige
// la política del bucket, que compara el primer tramo de la ruta.
async function subirBoleta(propiedadId, archivo) {
  const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${propiedadId}/${crypto.randomUUID()}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("comprobantes").upload(path, archivo, { contentType: archivo.type });
  if (error) throw new Error(error.message);
  return path;
}

export default function Rentas({ onCambio }) {
  const [locales, setLocales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);

  const cargar = async () => {
    const { data } = await supabase
      .from("propiedades")
      .select("id, folio, direccion, cliente_nombre, telefono, bolsa_destino_id")
      .eq("es_renta", true)
      .order("folio");
    setLocales(data || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;

  if (locales.length === 0)
    return <div className="text-sm text-[#8A93A3]">No hay locales en alquiler.</div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#8A93A3]">
        Al registrar el cobro, el ingreso entra solo a la bolsa del local.
      </p>

      {locales.map((l) => (
        <div key={l.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm truncate">{l.folio}</div>
              <div className="text-[11px] text-[#8A93A3] truncate">
                {l.cliente_nombre}{l.telefono ? ` · ${l.telefono}` : ""}
              </div>
              <div className="text-[10px] text-[#6b7280] truncate">{l.direccion}</div>
            </div>
          </div>

          <button
            onClick={() => setAbierto(abierto === l.id ? null : l.id)}
            className="w-full flex items-center justify-center gap-1 text-[10px] text-[#8A93A3] hover:text-[#EDE7D9] mt-2 py-1">
            {abierto === l.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {abierto === l.id ? "Ocultar los cobros" : "Ver los cobros"}
          </button>

          {abierto === l.id && (
            <Cobros local={l} onCambio={() => { cargar(); onCambio && onCambio(); }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- Los meses del contrato ----------

function Cobros({ local, onCambio }) {
  const [cuotas, setCuotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [panel, setPanel] = useState(null); // id de la cuota abierta
  const [aviso, setAviso] = useState("");

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase
      .from("cuotas")
      .select("id, numero, fecha, pago, estado, fecha_pago_real, comprobantes(id, imagen_url, estado)")
      .eq("propiedad_id", local.id)
      .order("numero");
    setCuotas(data || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, [local.id]);

  const listo = (msg) => {
    setPanel(null);
    setAviso(msg);
    cargar();
    onCambio && onCambio();
  };

  if (cargando) return <div className="text-[10px] text-[#8A93A3] mt-1">Cargando...</div>;

  // Una boleta cuenta como real solo si vive en el bucket. Los enlaces
  // externos se ven, pero no están dentro de la app.
  const esInterna = (url) => !!url && !/^https?:\/\//i.test(url);

  return (
    <div className="space-y-1.5 mt-1">
      {aviso && <div className="text-[10px] text-emerald-400">{aviso}</div>}

      {cuotas.map((c) => {
        const comp = (c.comprobantes || [])[0];
        const pagada = c.estado === "pagado";
        return (
          <div key={c.id} className="bg-[#0C121C] border border-[#2A3547] rounded-md p-2">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px]">
                  Cuota {c.numero} · {fmtDate(c.fecha)}
                </div>
                <div className="text-[10px] text-[#8A93A3]">
                  {pagada ? (
                    <>
                      Pagada {c.fecha_pago_real ? fmtDate(c.fecha_pago_real) : ""} ·{" "}
                      {esInterna(comp?.imagen_url) ? (
                        <span className="text-emerald-400">boleta en la app</span>
                      ) : comp?.imagen_url ? (
                        <span className="text-amber-400">boleta fuera de la app</span>
                      ) : (
                        <span className="text-amber-400">sin boleta</span>
                      )}
                    </>
                  ) : (
                    "Pendiente"
                  )}
                </div>
              </div>
              <div className="font-mono text-[11px] shrink-0"
                style={{ color: pagada ? C_ORIGEN : C_BOLSA }}>
                {fmt(c.pago)}
              </div>
            </div>

            {panel === c.id ? (
              <FormCobro
                local={local} cuota={c} comprobante={comp}
                onCancelar={() => setPanel(null)} onListo={listo} />
            ) : (
              (!pagada || !esInterna(comp?.imagen_url)) && (
                <button
                  onClick={() => { setPanel(c.id); setAviso(""); }}
                  className="w-full flex items-center justify-center gap-1 text-[10px] bg-[#2A3547] hover:bg-[#3a4864] py-1.5 rounded mt-1.5">
                  <Upload size={11} />
                  {pagada ? "Subir la boleta" : "Registrar el cobro"}
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Registrar el cobro, o solo adjuntar la boleta ----------

function FormCobro({ local, cuota, comprobante, onCancelar, onListo }) {
  const yaPagada = cuota.estado === "pagado";
  const [monto, setMonto] = useState(Number(cuota.pago) || 0);
  const [fecha, setFecha] = useState(
    cuota.fecha_pago_real || new Date().toISOString().slice(0, 10));
  const [nota, setNota] = useState("");
  const [archivo, setArchivo] = useState(null);
  const [paso, setPaso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    setError(""); setGuardando(true);
    try {
      setPaso("Subiendo la boleta...");
      const path = await subirBoleta(local.id, archivo);

      if (yaPagada && comprobante?.id) {
        // Solo se cambia la imagen. El cobro y su ingreso ya existen,
        // así que no se toca nada más.
        setPaso("Guardando...");
        const { error: e } = await supabase.from("comprobantes")
          .update({ imagen_url: path }).eq("id", comprobante.id);
        if (e) throw new Error(e.message);
        onListo("Boleta guardada dentro de la app.");
        return;
      }

      // Cobro nuevo. Se inserta en revisión y luego se aprueba, porque
      // el ingreso a tesorería lo dispara el paso a aprobado.
      setPaso("Registrando el cobro...");
      const { data: nuevo, error: e1 } = await supabase.from("comprobantes").insert({
        cuota_id: cuota.id,
        imagen_url: path,
        monto_depositado: Number(monto),
        monto_requerido: Number(cuota.pago),
        mora_al_subir: 0,
        excedente: Math.max(0, Number(monto) - Number(cuota.pago)),
        faltante: Math.max(0, Number(cuota.pago) - Number(monto)),
        resultado: Number(monto) >= Number(cuota.pago) ? "completo" : "parcial",
        estado: "revision",
        fecha_pago_real: fecha,
        nota_inmobiliaria: nota.trim()
          ? `Registrado desde Rentas. ${nota.trim()}`
          : "Registrado desde Rentas por el administrador.",
      }).select("id").single();
      if (e1) throw new Error(e1.message);

      setPaso("Aprobando...");
      const { error: e2 } = await supabase.from("comprobantes")
        .update({ estado: "aprobado", revisado_en: new Date().toISOString() })
        .eq("id", nuevo.id);
      if (e2) throw new Error(e2.message);

      const completo = Number(monto) >= Number(cuota.pago);
      const { error: e3 } = await supabase.from("cuotas").update({
        estado: completo ? "pagado" : "parcial",
        fecha_pago: fecha,
        fecha_pago_real: fecha,
        monto_pagado_acumulado: Number(monto),
      }).eq("id", cuota.id);
      if (e3) throw new Error(e3.message);

      onListo(`Cobro de ${fmt(monto)} registrado. El ingreso ya entró a la bolsa.`);
    } catch (e) {
      setPaso("");
      setError(e.message);
      setGuardando(false);
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-[#2A3547] space-y-2">
      {yaPagada ? (
        <p className="text-[10px] text-[#6b7280]">
          Este cobro ya está registrado. Subir la boleta solo guarda la
          imagen dentro de la app; no vuelve a mover dinero.
        </p>
      ) : (
        <>
          <CampoMoneda label="Cuánto depositó" value={monto} onChange={setMonto} />
          <Campo label="Fecha del depósito" type="date" value={fecha}
            onChange={(e) => setFecha(e.target.value)} />
          <Campo label="Referencia o nota (opcional)" value={nota}
            onChange={(e) => setNota(e.target.value)} />
        </>
      )}

      {archivo ? (
        <div className="flex items-center gap-2 bg-[#0C121C] border border-[#2A3547] rounded-md p-2">
          <FileText size={14} style={{ color: C_BOLSA }} className="shrink-0" />
          <span className="text-[11px] truncate flex-1">{archivo.name}</span>
          <button type="button" onClick={() => setArchivo(null)}
            className="text-[#8A93A3] hover:text-[#EDE7D9] shrink-0"><X size={14} /></button>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-1.5 text-[11px] bg-[#2A3547] hover:bg-[#3a4864] py-2 rounded-md cursor-pointer">
          <Upload size={12} /> Elegir la boleta
          <input type="file" accept="image/*,application/pdf" className="hidden"
            onChange={(e) => setArchivo(e.target.files && e.target.files[0])} />
        </label>
      )}

      {error && <div className="text-[11px] text-red-400">{error}</div>}

      <div className="flex gap-2">
        <button onClick={onCancelar} disabled={guardando}
          className="flex-1 text-[10px] bg-[#2A3547] disabled:opacity-40 py-2 rounded">
          Cancelar
        </button>
        <button onClick={guardar}
          disabled={!archivo || guardando || (!yaPagada && Number(monto) <= 0)}
          className="flex-1 flex items-center justify-center gap-1 text-[10px] bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded">
          {guardando ? (paso || "Guardando...") : (<><Check size={11} /> Guardar</>)}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// tesoreria/FacturasLote.tsx — subir varias facturas o recibos
// de una sola vez, en lugar de una por una.
//
// Se elige UNA obra y UNA bolsa para toda la carga (de ahí sale
// el dinero y ahí se invirtió), se eligen los archivos, se leen
// solos y se revisan antes de registrar el gasto de cada uno.
// Si una foto no se puede leer sola (borrosa, o es un voucher de
// transferencia sin formato de factura), se completa a mano.
// ============================================================

import { useState } from "react";
import { supabase } from "../supabaseClient";
import {
  Upload, FileText, CheckCircle2, AlertTriangle, Sparkles,
  X, Loader2, RotateCcw, Layers,
} from "lucide-react";
import { fmt, Campo, CampoMoneda, llamarFuncionSesion } from "./comun";

let contadorLocal = 0;
const idLocal = () => `lote_${Date.now()}_${contadorLocal++}`;

const nuevoItem = (archivo) => ({
  id: idLocal(),
  archivo,
  preview: archivo.type.startsWith("image/") ? URL.createObjectURL(archivo) : null,
  // pendiente | leyendo | leida | error_lectura | registrando | registrada | error_registro
  estado: "pendiente",
  facturaId: null,
  proveedor: "",
  serie: "",
  numero: "",
  fecha: "",
  monto: 0,
  revisar: false,
  incluir: true,
  error: "",
});

export function SubirFacturasLote({ bolsas, centros, onRegistrada }) {
  const [centroId, setCentroId] = useState("");
  const [bolsaId, setBolsaId] = useState("");
  const [items, setItems] = useState([]);
  const [leyendoTodas, setLeyendoTodas] = useState(false);
  const [registrandoTodas, setRegistrandoTodas] = useState(false);
  const [error, setError] = useState("");

  const puedeElegirArchivos = centroId && bolsaId;

  const agregarArchivos = (lista) => {
    const archivos = Array.from(lista || []);
    if (archivos.length === 0) return;
    setItems((prev) => [...prev, ...archivos.map(nuevoItem)]);
  };

  const quitarItem = (id) => setItems((prev) => prev.filter((it) => it.id !== id));

  const actualizarItem = (id, cambios) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...cambios } : it)));

  // Sube el archivo, crea la factura ya con su obra asignada, e intenta
  // leerla sola. Si el lector falla (foto borrosa, no es una factura con
  // formato reconocible), no se detiene: queda lista para llenar a mano.
  const leerUno = async (it) => {
    actualizarItem(it.id, { estado: "leyendo", error: "" });
    try {
      const ext = (it.archivo.name.split(".").pop() || "jpg").toLowerCase();
      const hoy = new Date();
      const carpeta = `${hoy.getFullYear()}/${String(hoy.getMonth() + 1).padStart(2, "0")}`;
      const path = `${carpeta}/${crypto.randomUUID()}.${ext}`;

      const { error: errUp } = await supabase.storage.from("facturas")
        .upload(path, it.archivo, { contentType: it.archivo.type });
      if (errUp) throw new Error("No se pudo subir el archivo: " + errUp.message);

      const { data: nueva, error: errIns } = await supabase
        .from("facturas")
        .insert({ storage_path: path, archivo_url: path, centro_costo_id: centroId })
        .select("id").single();
      if (errIns) throw new Error("No se pudo crear el registro: " + errIns.message);

      let lectura = null;
      let fallaLectura = "";
      try {
        lectura = await llamarFuncionSesion("lector-facturas", { factura_id: nueva.id });
        if (!lectura?.ok) { fallaLectura = lectura?.error || "El lector no devolvió datos"; lectura = null; }
      } catch (eLect) {
        fallaLectura = eLect.message;
      }

      const { data: f } = await supabase
        .from("facturas").select("*, proveedores(nombre, nit)").eq("id", nueva.id).single();

      actualizarItem(it.id, {
        estado: "leida",
        facturaId: nueva.id,
        proveedor: f?.proveedores?.nombre || "",
        serie: f?.serie || "",
        numero: f?.numero || "",
        fecha: f?.fecha || "",
        monto: Number(f?.monto_total || 0),
        revisar: !lectura || !!lectura?.revisar || !Number(f?.monto_total),
        error: fallaLectura ? "No se leyó sola: " + fallaLectura + ". Completá los datos a mano abajo." : "",
      });
    } catch (e) {
      actualizarItem(it.id, { estado: "error_lectura", error: e.message });
    }
  };

  const leerTodas = async () => {
    setError("");
    setLeyendoTodas(true);
    // Una por una: el lector no responde bien si se le manda todo junto.
    for (const it of items) {
      if (it.estado === "pendiente" || it.estado === "error_lectura") {
        // eslint-disable-next-line no-await-in-loop
        await leerUno(it);
      }
    }
    setLeyendoTodas(false);
  };

  const registrarUno = async (it) => {
    actualizarItem(it.id, { estado: "registrando", error: "" });
    try {
      if (!(Number(it.monto) > 0)) throw new Error("Falta poner el monto.");
      const { error: errF } = await supabase.from("facturas").update({
        serie: it.serie || null,
        numero: it.numero || null,
        fecha: it.fecha || null,
        monto_total: Number(it.monto),
        centro_costo_id: centroId,
        estado_lectura: "confirmada",
      }).eq("id", it.facturaId);
      if (errF) throw new Error(errF.message);

      const { error: errR } = await supabase.rpc("registrar_egreso_factura", {
        p_factura_id: it.facturaId,
        p_bolsa_id: bolsaId,
      });
      if (errR) throw new Error(errR.message);

      actualizarItem(it.id, { estado: "registrada", error: "" });
    } catch (e) {
      actualizarItem(it.id, { estado: "error_registro", error: e.message });
    }
  };

  const registrarTodas = async () => {
    setError("");
    setRegistrandoTodas(true);
    const porRegistrar = items.filter((it) =>
      it.incluir && (it.estado === "leida" || it.estado === "error_registro"));
    for (const it of porRegistrar) {
      // eslint-disable-next-line no-await-in-loop
      await registrarUno(it);
    }
    setRegistrandoTodas(false);
    onRegistrada && onRegistrada();
  };

  const listas = items.filter((it) => it.estado === "leida" || it.estado === "error_registro");
  const registradas = items.filter((it) => it.estado === "registrada");
  const pendientesDeLeer = items.filter((it) => it.estado === "pendiente" || it.estado === "error_lectura");
  const totalIncluido = listas.filter((it) => it.incluir).reduce((a, it) => a + (Number(it.monto) || 0), 0);
  const hayAlgoQueRegistrar = listas.some((it) => it.incluir);

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#8A93A3]">
        Subí varias facturas o recibos de una sola vez. Todos salen de la misma
        bolsa y se cargan a la misma obra — si tenés de obras distintas, hacé
        una carga aparte para cada una.
      </p>

      {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-md p-2.5">{error}</div>}

      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4 space-y-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿En qué se invirtió? (obra)</span>
          <select value={centroId} onChange={(e) => setCentroId(e.target.value)}
            disabled={items.length > 0}
            className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227] disabled:opacity-50">
            <option value="">Elegí una obra</option>
            {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿De dónde sale el dinero? (bolsa)</span>
          <select value={bolsaId} onChange={(e) => setBolsaId(e.target.value)}
            disabled={items.length > 0}
            className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227] disabled:opacity-50">
            <option value="">Elegí una bolsa</option>
            {bolsas.map((b) => <option key={b.id} value={b.id}>{b.nombre} — {fmt(b.saldo_actual)}</option>)}
          </select>
        </label>
        {items.length > 0 && (
          <p className="text-[10px] text-[#6b7280]">
            Para cambiar la obra o la bolsa, quitá primero todos los archivos de abajo.
          </p>
        )}
      </div>

      <div>
        <label
          className={`flex flex-col items-center justify-center gap-2 border border-dashed rounded-lg py-7 ${
            puedeElegirArchivos ? "border-[#2A3547] cursor-pointer hover:border-[#C9A227]/50" : "border-[#2A3547]/50 opacity-50"
          }`}
          onDragOver={(e) => puedeElegirArchivos && e.preventDefault()}
          onDrop={(e) => { if (!puedeElegirArchivos) return; e.preventDefault(); agregarArchivos(e.dataTransfer.files); }}
        >
          <Upload size={22} className="text-[#8A93A3]" />
          <span className="text-sm text-[#8A93A3]">
            {puedeElegirArchivos ? "Tocá para elegir las facturas (podés elegir varias)" : "Primero elegí la obra y la bolsa"}
          </span>
          <span className="text-[11px] text-[#6b7280]">Fotos o PDF</span>
          <input type="file" accept="image/*,application/pdf" multiple className="hidden"
            disabled={!puedeElegirArchivos}
            onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ""; }} />
        </label>
      </div>

      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wide text-[#8A93A3]">
              {items.length} archivo{items.length === 1 ? "" : "s"}
              {registradas.length > 0 && <span className="text-emerald-400"> · {registradas.length} registrada{registradas.length === 1 ? "" : "s"}</span>}
            </div>
            {pendientesDeLeer.length > 0 && (
              <button onClick={leerTodas} disabled={leyendoTodas}
                className="text-xs bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5">
                <Sparkles size={13} />
                {leyendoTodas ? "Leyendo..." : `Leer ${pendientesDeLeer.length} factura${pendientesDeLeer.length === 1 ? "" : "s"}`}
              </button>
            )}
          </div>

          <div className="space-y-2.5">
            {items.map((it) => (
              <ItemFactura key={it.id} it={it}
                onQuitar={() => quitarItem(it.id)}
                onCambiar={(cambios) => actualizarItem(it.id, cambios)}
                onReintentarLectura={() => leerUno(it)}
                onReintentarRegistro={() => registrarUno(it)} />
            ))}
          </div>

          {listas.length > 0 && (
            <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4 flex items-center justify-between gap-3">
              <div className="text-xs text-[#8A93A3]">
                Se van a registrar {listas.filter((it) => it.incluir).length} gasto{listas.filter((it) => it.incluir).length === 1 ? "" : "s"},
                por un total de <span className="text-[#EDE7D9] font-medium">{fmt(totalIncluido)}</span>.
              </div>
              <button onClick={registrarTodas} disabled={!hayAlgoQueRegistrar || registrandoTodas}
                className="shrink-0 text-xs bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium px-4 py-2.5 rounded-md">
                {registrandoTodas ? "Registrando..." : "Registrar todas"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ItemFactura({ it, onQuitar, onCambiar, onReintentarLectura, onReintentarRegistro }) {
  const bloqueado = it.estado === "registrada";
  const procesando = it.estado === "leyendo" || it.estado === "registrando";

  return (
    <div className={`bg-[#161F2E] border rounded-lg p-3 ${
      it.estado === "registrada" ? "border-emerald-800" :
      it.estado === "error_lectura" || it.estado === "error_registro" ? "border-red-800" :
      "border-[#2A3547]"
    }`}>
      <div className="flex items-start gap-3">
        {it.preview ? (
          <img src={it.preview} alt="" className="w-14 h-14 object-cover rounded-md shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-md bg-[#0C121C] flex items-center justify-center shrink-0">
            <FileText size={18} className="text-[#8A93A3]" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs truncate">{it.archivo.name}</div>
            {!bloqueado && !procesando && (
              <button onClick={onQuitar} className="text-[#6b7280] hover:text-red-400 shrink-0"><X size={14} /></button>
            )}
          </div>

          {it.estado === "pendiente" && (
            <div className="text-[11px] text-[#6b7280] mt-0.5">Esperando a leerse</div>
          )}
          {it.estado === "leyendo" && (
            <div className="text-[11px] text-[#8A93A3] mt-0.5 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Leyendo...</div>
          )}
          {it.estado === "registrando" && (
            <div className="text-[11px] text-[#8A93A3] mt-0.5 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Registrando...</div>
          )}
          {it.estado === "error_lectura" && (
            <div className="text-[11px] text-red-400 mt-0.5 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1"><AlertTriangle size={11} /> {it.error}</span>
              <button onClick={onReintentarLectura} className="shrink-0 text-[#8A93A3] hover:text-[#EDE7D9] flex items-center gap-1">
                <RotateCcw size={11} /> Reintentar
              </button>
            </div>
          )}
          {it.estado === "registrada" && (
            <div className="text-[11px] text-emerald-400 mt-0.5 flex items-center gap-1"><CheckCircle2 size={11} /> Gasto registrado</div>
          )}

          {(it.estado === "leida" || it.estado === "error_registro") && (
            <div className="mt-2 space-y-2">
              {it.error && (
                <div className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-800 rounded-md p-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1"><AlertTriangle size={11} /> {it.error}</span>
                  {it.estado === "error_registro" && (
                    <button onClick={onReintentarRegistro} className="shrink-0 text-[#8A93A3] hover:text-[#EDE7D9] flex items-center gap-1">
                      <RotateCcw size={11} /> Reintentar
                    </button>
                  )}
                </div>
              )}
              {it.proveedor && <div className="text-xs text-[#8A93A3]">{it.proveedor}</div>}
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Fecha" type="date" value={it.fecha || ""} onChange={(e) => onCambiar({ fecha: e.target.value })} />
                <CampoMoneda label="Monto" value={it.monto} onChange={(n) => onCambiar({ monto: n })} />
              </div>
              <Campo label="Referencia (serie/número o concepto)" value={it.numero || ""}
                placeholder="Ej. A-00123, o 'Transferencia Banrural'"
                onChange={(e) => onCambiar({ numero: e.target.value })} />
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={it.incluir}
                  onChange={(e) => onCambiar({ incluir: e.target.checked })}
                  className="w-3.5 h-3.5 accent-[#C9A227]" />
                <span className="text-[11px] text-[#8A93A3]">Incluir en el registro</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const IconoFacturasLote = Layers;
export default SubirFacturasLote;

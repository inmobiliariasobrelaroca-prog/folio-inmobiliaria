// ============================================================
// tesoreria/Boletas.tsx — bandeja de boletas sueltas
//
// El problema que resuelve: las boletas llegan por WhatsApp y por Drive,
// y amarrarlas una por una a su cuota es lo que más tiempo consume.
//
// Acá se suben todas de golpe, un lector las lee con IA y saca monto,
// fecha, banco y concepto, y el sistema propone a qué cuota corresponde
// cada una. Quien revisa solo confirma.
//
// La propuesta nunca se aplica sola: dos casas con cuotas parecidas dan
// el mismo calce, y equivocar un pago de cliente es caro de deshacer.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Upload, FileText, X, Check, RefreshCw, AlertTriangle, Trash2 } from "lucide-react";
import { fmt, fmtDate, C_ORIGEN, C_BOLSA, C_GASTO } from "./comun";

export default function Boletas({ onCambio }) {
  const [boletas, setBoletas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(0);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");

  const cargar = async () => {
    const { data } = await supabase
      .from("boletas_sueltas")
      .select("*")
      .eq("estado", "sin_asignar")
      .order("created_at", { ascending: false });
    setBoletas(data || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  // Sube los archivos y manda a leer cada uno. La lectura va de a una
  // para no saturar; si una falla, las demás siguen.
  const subir = async (files) => {
    const lista = Array.from(files || []);
    if (lista.length === 0) return;
    setError(""); setAviso(""); setSubiendo(lista.length);

    let ok = 0;
    for (const file of lista) {
      try {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `sueltas/${crypto.randomUUID()}-${Date.now()}.${ext}`;
        const { error: e1 } = await supabase.storage
          .from("comprobantes").upload(path, file, { contentType: file.type });
        if (e1) throw new Error(e1.message);

        const { data: fila, error: e2 } = await supabase
          .from("boletas_sueltas")
          .insert({ storage_path: path, nombre_archivo: file.name })
          .select("id").single();
        if (e2) throw new Error(e2.message);

        // El lector puede tardar; no se espera a que termine para seguir
        // con la siguiente, pero sí se refresca al final.
        await supabase.functions.invoke("lector-boletas", {
          body: { boleta_id: fila.id },
        });
        ok++;
      } catch (e) {
        console.error("Boleta", file.name, e);
        setError(`No se pudo procesar ${file.name}: ${e.message}`);
      }
      setSubiendo((n) => n - 1);
    }
    setAviso(`${ok} de ${lista.length} boleta${lista.length === 1 ? "" : "s"} lista${lista.length === 1 ? "" : "s"}.`);
    cargar();
    onCambio && onCambio();
  };

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#8A93A3] leading-relaxed">
        Subí todas las boletas juntas. El lector saca monto, fecha y concepto,
        y propone a qué cuota corresponde cada una. Vos confirmás.
      </p>

      <label className="flex items-center justify-center gap-2 text-[11px] bg-[#2A3547] hover:bg-[#3a4864] py-3 rounded-md cursor-pointer">
        <Upload size={13} />
        {subiendo > 0 ? `Procesando... quedan ${subiendo}` : "Elegir boletas (podés marcar varias)"}
        <input type="file" accept="image/*,application/pdf" multiple className="hidden"
          disabled={subiendo > 0}
          onChange={(e) => { subir(e.target.files); e.target.value = ""; }} />
      </label>

      {aviso && <div className="text-[11px] text-emerald-400">{aviso}</div>}
      {error && <div className="text-[11px] text-red-400">{error}</div>}

      {boletas.length === 0 && subiendo === 0 && (
        <div className="text-[11px] text-[#8A93A3] py-3">
          No hay boletas sin asignar.
        </div>
      )}

      {boletas.map((b) => (
        <Boleta key={b.id} b={b} onCambio={() => { cargar(); onCambio && onCambio(); }} />
      ))}
    </div>
  );
}

// ---------- Una boleta y su calce ----------

function Boleta({ b, onCambio }) {
  const [calces, setCalces] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const buscar = async () => {
    setAbierto(true);
    if (calces) return;
    const { data } = await supabase.rpc("sugerir_cuota", {
      p_monto: b.monto, p_fecha: b.fecha,
    });
    setCalces(data || []);
  };

  const asignar = async (cuotaId) => {
    setError(""); setGuardando(true);
    try {
      const { error: e } = await supabase.rpc("asignar_boleta", {
        p_boleta: b.id, p_cuota: cuotaId, p_cubre_luz: true, p_nota: null,
      });
      if (e) throw new Error(e.message);
      onCambio();
    } catch (e) { setError(e.message); setGuardando(false); }
  };

  const releer = async () => {
    setGuardando(true);
    await supabase.functions.invoke("lector-boletas", { body: { boleta_id: b.id } });
    setGuardando(false); onCambio();
  };

  const descartar = async () => {
    await supabase.from("boletas_sueltas").update({ estado: "descartada" }).eq("id", b.id);
    onCambio();
  };

  const leida = b.estado_lectura === "leida";
  const dudosa = leida && Number(b.confianza || 0) < 0.85;

  return (
    <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
      <div className="flex items-start gap-2">
        <FileText size={14} className="text-[#8A93A3] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          {leida ? (
            <>
              <div className="text-sm">
                {b.monto != null ? fmt(b.monto) : "sin monto"}
                {b.fecha && <span className="text-[#8A93A3] text-[11px]"> · {fmtDate(b.fecha)}</span>}
              </div>
              <div className="text-[10px] text-[#8A93A3] truncate">
                {[b.banco, b.referencia && `ref ${b.referencia}`, b.ordenante]
                  .filter(Boolean).join(" · ")}
              </div>
              {b.concepto && (
                <div className="text-[10px] text-[#6b7280] truncate">{b.concepto}</div>
              )}
            </>
          ) : b.estado_lectura === "error" ? (
            <>
              <div className="text-[11px] text-red-400">No se pudo leer</div>
              <div className="text-[10px] text-[#8A93A3] truncate">{b.error_lectura}</div>
            </>
          ) : (
            <div className="text-[11px] text-[#8A93A3]">Leyendo {b.nombre_archivo}...</div>
          )}
        </div>
        <button onClick={descartar} title="Descartar"
          className="text-[#8A93A3] hover:text-red-400 shrink-0">
          <Trash2 size={13} />
        </button>
      </div>

      {dudosa && (
        <div className="text-[10px] text-amber-400 mt-1.5 flex items-start gap-1">
          <AlertTriangle size={10} className="shrink-0 mt-0.5" />
          El lector no quedó seguro. Verificá el monto y la fecha antes de asignarla.
        </div>
      )}

      {error && <div className="text-[11px] text-red-400 mt-1.5">{error}</div>}

      {leida && b.monto != null && !abierto && (
        <button onClick={buscar}
          className="w-full text-[11px] bg-[#C9A227] text-[#101826] font-medium py-1.5 rounded-md mt-2">
          Buscar a qué cuota corresponde
        </button>
      )}

      {b.estado_lectura === "error" && (
        <button onClick={releer} disabled={guardando}
          className="w-full flex items-center justify-center gap-1 text-[11px] bg-[#2A3547] disabled:opacity-40 py-1.5 rounded-md mt-2">
          <RefreshCw size={11} /> Intentar leerla otra vez
        </button>
      )}

      {abierto && (
        <div className="mt-2 space-y-1.5">
          {calces === null && <div className="text-[10px] text-[#8A93A3]">Buscando...</div>}
          {calces?.length === 0 && (
            <div className="text-[10px] text-[#8A93A3]">
              Ninguna cuota pendiente calza con ese monto y esa fecha. Puede ser
              un pago de mora, un abono a capital, o de una casa que no está
              cargada.
            </div>
          )}
          {calces?.map((c) => {
            const exacto = Math.abs(Number(c.diferencia)) < 1;
            return (
              <div key={c.cuota_id}
                className={`bg-[#0C121C] border rounded-md p-2 ${exacto ? "border-emerald-800" : "border-[#2A3547]"}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] truncate">
                      {c.folio} · cuota {c.numero}
                    </div>
                    <div className="text-[10px] text-[#8A93A3] truncate">{c.cliente}</div>
                    <div className="text-[10px] text-[#6b7280]">
                      Vence {fmtDate(c.vence)} · esperado {fmt(c.esperado)}
                      {Number(c.luz) > 0 && ` (incluye luz ${fmt(c.luz)})`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px]" style={{ color: exacto ? C_ORIGEN : C_BOLSA }}>
                      {exacto ? "calza exacto" : `dif ${fmt(c.diferencia)}`}
                    </div>
                    <div className="text-[10px] text-[#6b7280]">
                      {c.dias_de_la_fecha}d de la fecha
                    </div>
                  </div>
                </div>
                <button onClick={() => asignar(c.cuota_id)} disabled={guardando}
                  className="w-full flex items-center justify-center gap-1 text-[10px] bg-[#2A3547] hover:bg-[#3a4864] disabled:opacity-40 py-1.5 rounded mt-1.5">
                  <Check size={11} /> {guardando ? "Aplicando..." : "Es esta"}
                </button>
              </div>
            );
          })}
          <button onClick={() => setAbierto(false)}
            className="w-full text-[10px] text-[#8A93A3] py-1">Cerrar</button>
        </div>
      )}
    </div>
  );
}

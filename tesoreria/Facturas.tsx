// ============================================================
// tesoreria/Facturas.tsx — subir una factura y registrar el gasto
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Upload, FileText, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { fmt, Campo, CampoMoneda, llamarFuncionSesion } from "./comun";

export function SubirFacturaTesoreria({ bolsas, centros, onRegistrada }) {
  const [categorias, setCategorias] = useState([]);
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [paso, setPaso] = useState("inicio"); // inicio | leyendo | revision | listo
  const [error, setError] = useState("");

  const [factura, setFactura] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [lectura, setLectura] = useState(null);
  const [centroId, setCentroId] = useState("");
  const [bolsaId, setBolsaId] = useState("");
  const [registrando, setRegistrando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("categorias").select("id, nombre").eq("tipo", "egreso").order("nombre");
      setCategorias(data || []);
    })();
  }, []);

  const elegirArchivo = (f) => {
    if (!f) return;
    setError("");
    setArchivo(f);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };

  const subirYLeer = async () => {
    if (!archivo) return;
    setPaso("leyendo");
    setError("");
    try {
      const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase();
      const hoy = new Date();
      const carpeta = `${hoy.getFullYear()}/${String(hoy.getMonth() + 1).padStart(2, "0")}`;
      const path = `${carpeta}/${crypto.randomUUID()}.${ext}`;

      const { error: errUp } = await supabase.storage.from("facturas").upload(path, archivo, { contentType: archivo.type });
      if (errUp) throw new Error("No se pudo subir el archivo: " + errUp.message);

      const { data: nueva, error: errIns } = await supabase
        .from("facturas").insert({ storage_path: path, archivo_url: path }).select("id").single();
      if (errIns) throw new Error("No se pudo crear el registro: " + errIns.message);

      const res = await llamarFuncionSesion("lector-facturas", { factura_id: nueva.id });
      if (!res?.ok) throw new Error(res?.error || "El lector no devolvió datos");

      const { data: f } = await supabase
        .from("facturas").select("*, proveedores(nombre, nit)").eq("id", nueva.id).single();
      const { data: ls } = await supabase
        .from("factura_lineas").select("*").eq("factura_id", nueva.id).order("orden");

      setFactura(f);
      setLineas(ls || []);
      setLectura(res);
      setPaso("revision");
    } catch (e) {
      setError(e.message);
      setPaso("inicio");
    }
  };

  const editar = (campo, valor) => setFactura((f) => ({ ...f, [campo]: valor }));
  const editarLinea = (id, campo, valor) =>
    setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));

  const registrar = async () => {
    setError("");
    setRegistrando(true);
    try {
      await Promise.all(lineas.map((l) =>
        supabase.from("factura_lineas")
          .update({ categoria_id: l.categoria_id || null, total: Number(l.total) })
          .eq("id", l.id)
      ));

      const { error: errF } = await supabase.from("facturas").update({
        serie: factura.serie,
        numero: factura.numero,
        fecha: factura.fecha,
        monto_total: Number(factura.monto_total),
        centro_costo_id: centroId,
        estado_lectura: "confirmada",
      }).eq("id", factura.id);
      if (errF) throw new Error(errF.message);

      const { error: errR } = await supabase.rpc("registrar_egreso_factura", {
        p_factura_id: factura.id,
        p_bolsa_id: bolsaId,
      });
      if (errR) throw new Error(errR.message);

      setPaso("listo");
      onRegistrada && onRegistrada();
    } catch (e) {
      setError(e.message);
    } finally {
      setRegistrando(false);
    }
  };

  const reiniciar = () => {
    setArchivo(null); setPreview(null); setFactura(null); setLineas([]);
    setLectura(null); setCentroId(""); setBolsaId(""); setError(""); setPaso("inicio");
  };

  const sumaLineas = lineas.reduce((a, l) => a + Number(l.total || 0), 0);
  const descuadre = lineas.length > 0 && Math.abs(sumaLineas - Number(factura?.monto_total || 0)) > 1;
  const puedeRegistrar = centroId && bolsaId && Number(factura?.monto_total) > 0;

  if (paso === "listo") {
    return (
      <div className="bg-[#161F2E] border border-emerald-800 rounded-lg p-5 text-center">
        <CheckCircle2 size={22} className="text-emerald-400 mx-auto mb-2" />
        <div className="font-serif text-lg">Gasto registrado</div>
        <div className="text-xs text-[#8A93A3] mt-1">
          Se descontaron {fmt(factura.monto_total)} de la bolsa que elegiste.
        </div>
        <button onClick={reiniciar} className="mt-4 bg-[#C9A227] text-[#101826] font-medium px-4 py-2 rounded-md text-sm">
          Subir otra factura
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-md p-2.5">{error}</div>}

      {paso !== "revision" && (
        <div>
          <p className="text-xs text-[#8A93A3] mb-3">
            Subí la foto o el PDF de la factura. Los datos se leen solos y los revisás antes de descontar el dinero.
          </p>
          <label
            className="flex flex-col items-center justify-center gap-2 border border-dashed border-[#2A3547] rounded-lg py-8 cursor-pointer hover:border-[#C9A227]/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); elegirArchivo(e.dataTransfer.files && e.dataTransfer.files[0]); }}
          >
            {preview ? (
              <img src={preview} alt="" className="max-h-56 rounded-md" />
            ) : archivo ? (
              <>
                <FileText size={22} className="text-[#C9A227]" />
                <span className="text-sm">{archivo.name}</span>
              </>
            ) : (
              <>
                <Upload size={22} className="text-[#8A93A3]" />
                <span className="text-sm text-[#8A93A3]">Tocá para elegir la factura</span>
                <span className="text-[11px] text-[#6b7280]">Foto o PDF</span>
              </>
            )}
            <input type="file" accept="image/*,application/pdf" className="hidden"
              disabled={paso === "leyendo"} onChange={(e) => elegirArchivo(e.target.files && e.target.files[0])} />
          </label>

          <button onClick={subirYLeer} disabled={!archivo || paso === "leyendo"}
            className="w-full mt-3 bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2.5 rounded-md text-sm flex items-center justify-center gap-1.5">
            <Sparkles size={15} /> {paso === "leyendo" ? "Leyendo la factura..." : "Leer factura"}
          </button>
        </div>
      )}

      {paso === "revision" && factura && (
        <div className="space-y-4">
          <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="font-serif text-lg truncate">
                  {factura.proveedores?.nombre || "Proveedor no identificado"}
                </div>
                {factura.proveedores?.nit && (
                  <div className="text-[11px] text-[#8A93A3]">NIT {factura.proveedores.nit}</div>
                )}
              </div>
              {lectura?.revisar && (
                <span className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-amber-700 text-amber-400 uppercase tracking-wide">
                  <AlertTriangle size={11} /> Revisar
                </span>
              )}
            </div>

            {lectura?.observaciones && (
              <div className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-800 rounded-md p-2.5 mb-3">
                {lectura.observaciones}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Serie" value={factura.serie || ""} onChange={(e) => editar("serie", e.target.value)} />
              <Campo label="Número" value={factura.numero || ""} onChange={(e) => editar("numero", e.target.value)} />
              <Campo label="Fecha" type="date" value={factura.fecha || ""} onChange={(e) => editar("fecha", e.target.value)} />
              <CampoMoneda label="Total" value={factura.monto_total} onChange={(n) => editar("monto_total", n)} />
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#8A93A3] mb-2">Renglones</div>
            {lineas.length === 0 ? (
              <div className="text-xs text-[#8A93A3] bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
                El lector no encontró renglones. Se registra el total directamente.
              </div>
            ) : (
              <div className="space-y-1.5">
                {lineas.map((l) => (
                  <div key={l.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
                    <div className="text-sm mb-2">{l.descripcion}</div>
                    <div className="flex gap-2">
                      <input type="number" value={l.total}
                        onChange={(e) => editarLinea(l.id, "total", e.target.value)}
                        className="w-28 bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs text-right focus:outline-none focus:border-[#C9A227]" />
                      <select value={l.categoria_id || ""}
                        onChange={(e) => editarLinea(l.id, "categoria_id", e.target.value)}
                        className="flex-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#C9A227]">
                        <option value="">Sin categoría</option>
                        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {descuadre && (
              <div className="text-[11px] text-amber-400 mt-2">
                Los renglones suman {fmt(sumaLineas)} y el total dice {fmt(factura.monto_total)}. Revisá cuál está mal.
              </div>
            )}
          </div>

          <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4 space-y-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿A qué obra pertenece?</span>
              <select value={centroId} onChange={(e) => setCentroId(e.target.value)}
                className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]">
                <option value="">Elegí una obra</option>
                {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿De qué bolsa sale el dinero?</span>
              <select value={bolsaId} onChange={(e) => setBolsaId(e.target.value)}
                className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]">
                <option value="">Elegí una bolsa</option>
                {bolsas.map((b) => (
                  <option key={b.id} value={b.id}>{b.nombre} — {fmt(b.saldo_actual)}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={reiniciar} className="flex-1 text-xs bg-[#2A3547] py-2.5 rounded-md">Descartar</button>
            <button onClick={registrar} disabled={!puedeRegistrar || registrando}
              className="flex-1 text-xs bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2.5 rounded-md">
              {registrando ? "Registrando..." : "Registrar gasto"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SubirFacturaTesoreria;

// ============================================================
// ModuloTesoreria.tsx — Grupo Sobre la Roca
//
// Archivo autónomo. Para actualizarlo, reemplazá este archivo
// completo: no hay que tocar App.tsx nunca más.
//
// Se instaló una sola vez con dos líneas en App.tsx:
//   1) arriba, junto a los demás imports:
//        import ModuloTesoreria from "./ModuloTesoreria";
//   2) dentro de AppInterno, junto a <AvisoCodigoPendiente />:
//        <ModuloTesoreria perfil={perfil} />
//
// Colores del mapa:
//   verde  = de dónde vino el dinero
//   dorado = dónde está asignado (bolsas)
//   rojo   = en qué se convirtió (obras y gastos)
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import {
  Calculator, Zap, Upload, FileText, X,
  CheckCircle2, AlertTriangle, Sparkles,
} from "lucide-react";

// ---------- Helpers locales ----------
// Duplicados a propósito de los de App.tsx: este archivo no depende
// de nada exportado desde allá, así se puede reemplazar solo.

const LOCALE_TES = "es-GT";

const fmt = (n) =>
  (isFinite(Number(n)) ? Number(n) : 0).toLocaleString(LOCALE_TES, {
    style: "currency", currency: "GTQ", maximumFractionDigits: 2,
  });

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString(LOCALE_TES, { day: "2-digit", month: "short", year: "numeric" });
};

async function llamarFuncionSesion(nombreFuncion, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const base = import.meta.env.VITE_SUPABASE_URL || "https://knquysqjhprnyztkgmwb.supabase.co";
  const res = await fetch(`${base}/functions/v1/${nombreFuncion}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Error en el servidor");
  return json;
}

function Campo({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">{label}</span>
      <input {...props} className="w-full mt-1 bg-[#161F2E] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]" />
    </label>
  );
}

function CampoMoneda({ label, value, onChange, placeholder, disabled }) {
  const formatear = (n) => (n || n === 0) && n !== "" ? Number(n).toLocaleString(LOCALE_TES, { maximumFractionDigits: 2 }) : "";
  const [texto, setTexto] = useState(formatear(value));

  const manejarCambio = (e) => {
    let crudo = e.target.value.replace(/[^0-9.]/g, "");
    const partes = crudo.split(".");
    if (partes.length > 2) crudo = partes[0] + "." + partes.slice(1).join("");
    let [enteroStr, decimalStr] = crudo.split(".");
    if (decimalStr !== undefined) decimalStr = decimalStr.slice(0, 2);
    const numero = crudo === "" || crudo === "." ? 0 : parseFloat(crudo.endsWith(".") ? crudo.slice(0, -1) : crudo) || 0;
    const enteroFormateado = enteroStr === "" ? "" : parseInt(enteroStr || "0", 10).toLocaleString(LOCALE_TES);
    setTexto(decimalStr !== undefined ? `${enteroFormateado}.${decimalStr}` : crudo.endsWith(".") ? `${enteroFormateado}.` : enteroFormateado);
    onChange(numero);
  };

  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">{label}</span>
      <div className="relative mt-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A93A3] text-sm">Q</span>
        <input type="text" inputMode="decimal" value={texto} onChange={manejarCambio}
          placeholder={placeholder} disabled={disabled}
          className="w-full bg-[#161F2E] border border-[#2A3547] rounded-md pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-[#C9A227] disabled:opacity-40" />
      </div>
    </label>
  );
}

// Paleta del mapa
const C_ORIGEN = "#2E9E6B";
const C_BOLSA  = "#C9A227";
const C_GASTO  = "#C0392B";

export default function ModuloTesoreria({ perfil }) {
  const [abierto, setAbierto] = useState(false);

  // Mismo criterio que la función es_admin_financiero() de la base:
  // administrador general, o permiso explícito gestionar_finanzas.
  const rol = perfil?.usuario?.roles;
  const puedeVer = perfil?.tipo === "staff" && (!!rol?.es_administrador || !!rol?.permisos?.gestionar_finanzas);
  if (!puedeVer) return null;

  return (
    <>
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          title="Tesorería"
          className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-[#C9A227] text-[#101826] shadow-lg flex items-center justify-center hover:brightness-110"
        >
          <Calculator size={20} />
        </button>
      )}
      {abierto && <PanelTesoreria onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function PanelTesoreria({ onCerrar }) {
  const [tab, setTab] = useState("mapa");
  const [bolsas, setBolsas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [cuotas, setCuotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = async () => {
    setCargando(true);
    setError("");
    const [{ data: bs, error: e1 }, { data: cc }, { data: cu }] = await Promise.all([
      supabase.from("v_saldos_bolsas").select("*").order("saldo_actual", { ascending: false }),
      supabase.from("centros_costo").select("*").eq("estado", "activo").order("nombre"),
      supabase.from("v_cuotas_proximas").select("*").limit(6),
    ]);
    if (e1) setError("No se pudo cargar la tesorería: " + e1.message);
    setBolsas(bs || []);
    setCentros(cc || []);
    setCuotas(cu || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const total = bolsas.reduce((s, b) => s + Number(b.saldo_actual || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-[#101826] text-[#EDE7D9] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#0C121C] border-b border-[#2A3547] px-5 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#8A93A3]">Interno</div>
            <div className="font-serif text-xl leading-tight">Tesorería</div>
          </div>
          <button onClick={onCerrar} className="text-[#8A93A3] hover:text-[#EDE7D9] p-1.5"><X size={20} /></button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-5 pb-24">
        <div className="flex gap-1 mb-4 border-b border-[#2A3547] overflow-x-auto">
          {[
            ["mapa", "Mapa", Zap],
            ["resumen", "Resumen", Calculator],
            ["facturas", "Subir factura", Upload],
            ["pendientes", "Documentar", AlertTriangle],
            ["movimientos", "Movimientos", FileText],
          ].map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 -mb-px whitespace-nowrap ${tab === id ? "border-[#C9A227] text-[#EDE7D9]" : "border-transparent text-[#8A93A3]"}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-md p-2.5 mb-4">{error}</div>}

        {cargando ? (
          <div className="text-sm text-[#8A93A3]">Cargando...</div>
        ) : tab === "mapa" ? (
          <MapaFlujo bolsas={bolsas} total={total} />
        ) : tab === "resumen" ? (
          <ResumenTesoreria total={total} bolsas={bolsas} centros={centros} cuotas={cuotas} />
        ) : tab === "facturas" ? (
          <SubirFacturaTesoreria bolsas={bolsas} centros={centros} onRegistrada={cargar} />
        ) : tab === "pendientes" ? (
          <DocumentarGastos onCambio={cargar} />
        ) : (
          <MovimientosTesoreria />
        )}
      </div>
    </div>
  );
}

function ResumenTesoreria({ total, bolsas, centros, cuotas }) {
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

function SubirFacturaTesoreria({ bolsas, centros, onRegistrada }) {
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

function MovimientosTesoreria() {
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

// ---------- Adjuntar documentos a gastos ya pagados ----------

function DocumentarGastos({ onCambio }) {
  const [gastos, setGastos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase.from("v_gastos_documentacion").select("*").limit(40);
    setGastos(data || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;
  if (gastos.length === 0) return <div className="text-sm text-[#8A93A3]">Todavía no hay gastos registrados.</div>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-[#8A93A3] mb-1">
        Cada gasto puede llevar varios papeles: el voucher del banco y después la factura del
        proveedor. Solo las facturas cierran el pendiente.
      </p>
      {gastos.map((g) => {
        const faltaFactura = Number(g.en_facturas) < Number(g.pagado) - 1;
        return (
          <div key={g.movimiento_id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">{g.descripcion || "Sin descripción"}</div>
                <div className="text-[11px] text-[#8A93A3] truncate">
                  {fmtDate(g.fecha)} · {g.centro_costo || "Sin obra"} · {g.bolsa}
                </div>
              </div>
              <div className="font-mono text-sm shrink-0">{fmt(g.pagado)}</div>
            </div>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {faltaFactura ? (
                <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-amber-700 text-amber-400 uppercase tracking-wide">
                  <AlertTriangle size={10} /> Falta factura por {fmt(Number(g.pagado) - Number(g.en_facturas))}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-emerald-700 text-emerald-400 uppercase tracking-wide">
                  <CheckCircle2 size={10} /> Documentado
                </span>
              )}
              {Number(g.en_vouchers) > 0 && (
                <span className="text-[10px] text-[#8A93A3]">Voucher {fmt(g.en_vouchers)}</span>
              )}
              <button
                onClick={() => setAbierto(abierto === g.movimiento_id ? null : g.movimiento_id)}
                className="ml-auto text-[11px] bg-[#2A3547] hover:bg-[#3a4864] px-2.5 py-1 rounded-md"
              >
                {abierto === g.movimiento_id ? "Cerrar" : `Documentos (${g.documentos})`}
              </button>
            </div>

            {abierto === g.movimiento_id && (
              <DocumentosDelGasto
                gasto={g}
                onCambio={() => { cargar(); onCambio && onCambio(); }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DocumentosDelGasto({ gasto, onCambio }) {
  const [docs, setDocs] = useState([]);
  const [tipo, setTipo] = useState("factura");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  const cargar = async () => {
    const { data } = await supabase
      .from("facturas")
      .select("id, tipo_documento, serie, numero, fecha, monto_total, confianza, proveedores(nombre)")
      .eq("movimiento_id", gasto.movimiento_id)
      .order("created_at");
    setDocs(data || []);
  };
  useEffect(() => { cargar(); }, [gasto.movimiento_id]);

  const subir = async (archivo) => {
    if (!archivo) return;
    setSubiendo(true);
    setError("");
    try {
      const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase();
      const hoy = new Date();
      const carpeta = `${hoy.getFullYear()}/${String(hoy.getMonth() + 1).padStart(2, "0")}`;
      const path = `${carpeta}/${crypto.randomUUID()}.${ext}`;

      const { error: errUp } = await supabase.storage
        .from("facturas").upload(path, archivo, { contentType: archivo.type });
      if (errUp) throw new Error("No se pudo subir: " + errUp.message);

      const { data: nueva, error: errIns } = await supabase
        .from("facturas")
        .insert({ storage_path: path, archivo_url: path, tipo_documento: tipo })
        .select("id").single();
      if (errIns) throw new Error(errIns.message);

      const res = await llamarFuncionSesion("lector-facturas", { factura_id: nueva.id });
      if (!res?.ok) throw new Error(res?.error || "El lector no devolvió datos");

      const { error: errLink } = await supabase.rpc("vincular_factura", {
        p_movimiento_id: gasto.movimiento_id,
        p_factura_id: nueva.id,
      });
      if (errLink) throw new Error(errLink.message);

      await cargar();
      onCambio && onCambio();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubiendo(false);
    }
  };

  const etiqueta = { factura: "Factura", voucher: "Voucher", recibo: "Recibo", nota_credito: "Nota de crédito", otro: "Otro" };

  return (
    <div className="mt-3 pt-3 border-t border-[#2A3547] space-y-2">
      {error && <div className="text-[11px] text-red-400 bg-red-950/30 border border-red-800 rounded-md p-2">{error}</div>}

      {docs.length > 0 && (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <div key={d.id} className="bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs truncate">
                  <span className="text-[#C9A227]">{etiqueta[d.tipo_documento] || d.tipo_documento}</span>
                  {d.proveedores?.nombre ? ` · ${d.proveedores.nombre}` : ""}
                </div>
                <div className="text-[10px] text-[#8A93A3] truncate">
                  {[d.serie, d.numero].filter(Boolean).join("-")}
                  {d.fecha ? ` · ${fmtDate(d.fecha)}` : ""}
                </div>
              </div>
              <div className="font-mono text-xs shrink-0">{fmt(d.monto_total)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        {["factura", "voucher", "recibo"].map((t) => (
          <button key={t} type="button" onClick={() => setTipo(t)}
            className={`flex-1 text-[11px] py-1.5 rounded-md border ${tipo === t ? "bg-[#C9A227] text-[#101826] border-[#C9A227] font-medium" : "border-[#2A3547] text-[#EDE7D9]"}`}>
            {etiqueta[t]}
          </button>
        ))}
      </div>

      <label className="flex items-center justify-center gap-1.5 text-[11px] bg-[#2A3547] hover:bg-[#3a4864] py-2 rounded-md cursor-pointer">
        <Upload size={12} /> {subiendo ? "Leyendo..." : `Adjuntar ${etiqueta[tipo].toLowerCase()}`}
        <input type="file" accept="image/*,application/pdf" className="hidden" disabled={subiendo}
          onChange={(e) => subir(e.target.files && e.target.files[0])} />
      </label>
    </div>
  );
}

// ---------- Mapa de flujo del dinero ----------
//
// Tres anillos concéntricos, cada uno con su color:
//   verde  (interior) — de dónde vino el dinero
//   dorado (medio)    — las bolsas donde está asignado
//   rojo   (exterior) — las obras donde se convirtió en gasto
//
// Todo en SVG, sin librerías externas.

function MapaFlujo({ bolsas, total }) {
  const [origenes, setOrigenes] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [desglose, setDesglose] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState(null); // { tipo, id, nombre, monto }

  useEffect(() => {
    (async () => {
      const [{ data: o }, { data: g }, { data: d }] = await Promise.all([
        supabase.from("v_flujo_origen_bolsa").select("*"),
        supabase.from("v_flujo_bolsa_centro").select("*"),
        supabase.from("v_flujo_centro_categoria").select("*"),
      ]);
      setOrigenes(o || []);
      setGastos(g || []);
      setDesglose(d || []);
      setCargando(false);
    })();
  }, []);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Armando el mapa...</div>;

  const CX = 180, CY = 200, R_ORI = 64, R_BOL = 122, R_GAS = 176;

  const enCirculo = (i, n, r, giro) => {
    const ang = ((giro || -90) + (i * 360) / Math.max(1, n)) * (Math.PI / 180);
    return { ang, x: CX + r * Math.cos(ang), y: CY + r * Math.sin(ang) };
  };

  // --- Nodos de origen (agrupados por nombre de origen) ---
  const porOrigen = {};
  origenes.forEach((o) => {
    porOrigen[o.origen] = (porOrigen[o.origen] || 0) + Number(o.total);
  });
  const listaOrigen = Object.entries(porOrigen).map(([nombre, monto]) => ({ nombre, monto }));
  const maxOri = Math.max(1, ...listaOrigen.map((o) => o.monto));
  const nodosOrigen = listaOrigen.map((o, i) => ({
    ...o, ...enCirculo(i, listaOrigen.length, R_ORI, -90),
    r: 6 + 7 * Math.sqrt(o.monto / maxOri),
  }));

  // --- Nodos de bolsa ---
  const visibles = bolsas.filter((b) =>
    Number(b.saldo_actual) > 0 ||
    gastos.some((g) => g.bolsa_id === b.id) ||
    origenes.some((o) => o.bolsa_id === b.id));
  const maxBol = Math.max(1, ...visibles.map((b) => Math.abs(Number(b.saldo_actual)) || 0));
  const nodosBolsa = visibles.map((b, i) => ({
    ...b, ...enCirculo(i, visibles.length, R_BOL, -90),
    r: 9 + 11 * Math.sqrt(Math.max(0, Number(b.saldo_actual)) / maxBol),
  }));

  // --- Nodos de gasto (obras) ---
  const porCentro = {};
  gastos.forEach((g) => {
    const k = g.centro_id || "sin";
    if (!porCentro[k]) porCentro[k] = { id: g.centro_id, nombre: g.centro, monto: 0 };
    porCentro[k].monto += Number(g.total);
  });
  const listaCentro = Object.values(porCentro);
  const maxGas = Math.max(1, ...listaCentro.map((c) => c.monto));
  const nodosGasto = listaCentro.map((c, i) => ({
    ...c, ...enCirculo(i, listaCentro.length, R_GAS, -60),
    r: 7 + 10 * Math.sqrt(c.monto / maxGas),
  }));

  const buscaBolsa = (id) => nodosBolsa.find((b) => b.id === id);
  const buscaOrigen = (n) => nodosOrigen.find((o) => o.nombre === n);
  const buscaGasto = (id) => nodosGasto.find((g) => g.id === id);

  const curva = (x1, y1, x2, y2) => {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    return `M ${x1} ${y1} Q ${mx + (my - CY) * 0.2} ${my - (mx - CX) * 0.2} ${x2} ${y2}`;
  };

  const corto = (t, n) => (t && t.length > n ? t.slice(0, n - 1) + "…" : t || "");

  // ¿Qué está resaltado?
  const activo = (tipo, id) => {
    if (!sel) return true;
    if (sel.tipo === "bolsa") {
      if (tipo === "bolsa") return id === sel.id;
      if (tipo === "origen") return origenes.some((o) => o.bolsa_id === sel.id && o.origen === id);
      if (tipo === "gasto") return gastos.some((g) => g.bolsa_id === sel.id && g.centro_id === id);
    }
    if (sel.tipo === "origen") {
      if (tipo === "origen") return id === sel.id;
      if (tipo === "bolsa") return origenes.some((o) => o.origen === sel.id && o.bolsa_id === id);
      return false;
    }
    if (sel.tipo === "gasto") {
      if (tipo === "gasto") return id === sel.id;
      if (tipo === "bolsa") return gastos.some((g) => g.centro_id === sel.id && g.bolsa_id === id);
      return false;
    }
    return true;
  };

  const op = (tipo, id) => (activo(tipo, id) ? 1 : 0.18);

  const catsSel = sel?.tipo === "gasto"
    ? desglose.filter((d) => d.centro_id === sel.id).sort((a, b) => Number(b.total) - Number(a.total))
    : [];

  return (
    <div>
      <div className="flex justify-center gap-4 mb-1 text-[10px]">
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: C_ORIGEN }} /> Vino de</span>
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: C_BOLSA }} /> Asignado en</span>
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: C_GASTO }} /> Se gastó en</span>
      </div>

      <svg viewBox="0 0 360 400" className="w-full" style={{ maxHeight: "60vh" }}>
        {/* Enlaces origen → bolsa */}
        {origenes.map((o, i) => {
          const a = buscaOrigen(o.origen), b = buscaBolsa(o.bolsa_id);
          if (!a || !b) return null;
          const vivo = activo("origen", o.origen) && activo("bolsa", o.bolsa_id);
          return <path key={`ob-${i}`} d={curva(a.x, a.y, b.x, b.y)} fill="none"
            stroke={C_ORIGEN} strokeWidth={vivo ? 1.8 : 1} opacity={vivo ? 0.75 : 0.12} />;
        })}

        {/* Enlaces bolsa → gasto */}
        {gastos.map((g, i) => {
          const b = buscaBolsa(g.bolsa_id), c = buscaGasto(g.centro_id);
          if (!b || !c) return null;
          const vivo = activo("bolsa", g.bolsa_id) && activo("gasto", g.centro_id);
          return <path key={`bg-${i}`} d={curva(b.x, b.y, c.x, c.y)} fill="none"
            stroke={C_GASTO} strokeWidth={vivo ? 1.8 : 1} opacity={vivo ? 0.75 : 0.12} />;
        })}

        {/* Gastos */}
        {nodosGasto.map((n, i) => (
          <g key={`g-${i}`} opacity={op("gasto", n.id)} style={{ cursor: "pointer" }}
            onClick={() => setSel(sel?.tipo === "gasto" && sel.id === n.id ? null : { tipo: "gasto", id: n.id, nombre: n.nombre, monto: n.monto })}>
            <circle cx={n.x} cy={n.y} r={n.r} fill="#2A1614" stroke={C_GASTO} strokeWidth="2" />
            <text x={n.x} y={n.y + n.r + 9} textAnchor="middle" fontSize="7.5" fill={C_GASTO}>{corto(n.nombre, 15)}</text>
            <text x={n.x} y={n.y + n.r + 17} textAnchor="middle" fontSize="7" fill="#8A93A3">{fmt(n.monto)}</text>
          </g>
        ))}

        {/* Bolsas */}
        {nodosBolsa.map((n) => (
          <g key={n.id} opacity={op("bolsa", n.id)} style={{ cursor: "pointer" }}
            onClick={() => setSel(sel?.tipo === "bolsa" && sel.id === n.id ? null : { tipo: "bolsa", id: n.id, nombre: n.nombre, monto: n.saldo_actual })}>
            <circle cx={n.x} cy={n.y} r={n.r} fill="#161F2E" stroke={C_BOLSA} strokeWidth="2.5" />
            <text x={n.x} y={n.y + n.r + 9} textAnchor="middle" fontSize="8" fill="#EDE7D9">
              {corto(n.nombre.split("—")[0].trim(), 13)}
            </text>
            <text x={n.x} y={n.y + n.r + 17} textAnchor="middle" fontSize="7" fill={C_BOLSA}>{fmt(n.saldo_actual)}</text>
          </g>
        ))}

        {/* Orígenes */}
        {nodosOrigen.map((n, i) => (
          <g key={`o-${i}`} opacity={op("origen", n.nombre)} style={{ cursor: "pointer" }}
            onClick={() => setSel(sel?.tipo === "origen" && sel.id === n.nombre ? null : { tipo: "origen", id: n.nombre, nombre: n.nombre, monto: n.monto })}>
            <circle cx={n.x} cy={n.y} r={n.r} fill="#0F2A1E" stroke={C_ORIGEN} strokeWidth="2" />
            <text x={n.x} y={n.y - n.r - 4} textAnchor="middle" fontSize="7" fill={C_ORIGEN}>{corto(n.nombre, 14)}</text>
          </g>
        ))}

        {/* Centro */}
        <g onClick={() => setSel(null)} style={{ cursor: "pointer" }}>
          <circle cx={CX} cy={CY} r="27" fill="#0C121C" stroke="#2A3547" strokeWidth="1.5" />
          <text x={CX} y={CY - 2} textAnchor="middle" fontSize="7.5" fill="#8A93A3">Disponible</text>
          <text x={CX} y={CY + 9} textAnchor="middle" fontSize="9" fill={C_BOLSA} fontWeight="600">{fmt(total)}</text>
        </g>
      </svg>

      {/* Detalle */}
      {!sel ? (
        <p className="text-[11px] text-[#8A93A3] text-center px-4">
          Tocá cualquier círculo para seguir el rastro del dinero. Tocá el centro para ver todo otra vez.
        </p>
      ) : (
        <div className="bg-[#161F2E] border rounded-lg p-4"
          style={{ borderColor: sel.tipo === "origen" ? C_ORIGEN : sel.tipo === "bolsa" ? C_BOLSA : C_GASTO }}>
          <div className="text-[10px] uppercase tracking-wide text-[#8A93A3]">
            {sel.tipo === "origen" ? "Vino de" : sel.tipo === "bolsa" ? "Asignado en" : "Se gastó en"}
          </div>
          <div className="font-serif text-lg">{sel.nombre}</div>
          <div className="font-mono text-sm mt-0.5"
            style={{ color: sel.tipo === "origen" ? C_ORIGEN : sel.tipo === "bolsa" ? C_BOLSA : C_GASTO }}>
            {fmt(sel.monto)}
          </div>

          {sel.tipo === "bolsa" && (
            <div className="mt-3 space-y-3">
              {origenes.filter((o) => o.bolsa_id === sel.id).length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[#8A93A3] mb-1.5">De dónde vino</div>
                  {origenes.filter((o) => o.bolsa_id === sel.id).map((o, i) => (
                    <div key={i} className="flex justify-between text-xs bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 mb-1">
                      <span className="truncate">{o.origen}</span>
                      <span className="font-mono ml-2 shrink-0" style={{ color: C_ORIGEN }}>{fmt(o.total)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[#8A93A3] mb-1.5">A dónde se fue</div>
                {gastos.filter((g) => g.bolsa_id === sel.id).length === 0 ? (
                  <div className="text-xs text-[#8A93A3]">Todavía no ha salido nada de esta bolsa.</div>
                ) : gastos.filter((g) => g.bolsa_id === sel.id).map((g, i) => (
                  <button key={i} onClick={() => setSel({ tipo: "gasto", id: g.centro_id, nombre: g.centro, monto: g.total })}
                    className="w-full flex justify-between text-xs bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 mb-1 hover:border-[#C0392B]/60">
                    <span className="truncate">{g.centro}</span>
                    <span className="font-mono ml-2 shrink-0" style={{ color: C_GASTO }}>{fmt(g.total)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {sel.tipo === "origen" && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wide text-[#8A93A3] mb-1.5">Entró a estas bolsas</div>
              {origenes.filter((o) => o.origen === sel.id).map((o, i) => (
                <button key={i} onClick={() => setSel({ tipo: "bolsa", id: o.bolsa_id, nombre: o.bolsa, monto: bolsas.find((b) => b.id === o.bolsa_id)?.saldo_actual })}
                  className="w-full flex justify-between text-xs bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 mb-1 hover:border-[#C9A227]/60">
                  <span className="truncate">{o.bolsa}</span>
                  <span className="font-mono ml-2 shrink-0">{fmt(o.total)}</span>
                </button>
              ))}
            </div>
          )}

          {sel.tipo === "gasto" && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wide text-[#8A93A3] mb-1.5">En qué se gastó</div>
              {catsSel.length === 0 ? (
                <div className="text-xs text-[#8A93A3]">Sin desglose todavía.</div>
              ) : catsSel.map((c, i) => (
                <div key={i} className="flex justify-between text-xs bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 mb-1">
                  <span className="truncate">{c.categoria}<span className="text-[#8A93A3]"> · {c.movimientos} mov.</span></span>
                  <span className="font-mono ml-2 shrink-0" style={{ color: C_GASTO }}>{fmt(c.total)}</span>
                </div>
              ))}
              <div className="text-[10px] uppercase tracking-wide text-[#8A93A3] mt-3 mb-1.5">Financiado por</div>
              {gastos.filter((g) => g.centro_id === sel.id).map((g, i) => (
                <button key={i} onClick={() => setSel({ tipo: "bolsa", id: g.bolsa_id, nombre: g.bolsa, monto: bolsas.find((b) => b.id === g.bolsa_id)?.saldo_actual })}
                  className="w-full flex justify-between text-xs bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 mb-1 hover:border-[#C9A227]/60">
                  <span className="truncate">{g.bolsa}</span>
                  <span className="font-mono ml-2 shrink-0" style={{ color: C_BOLSA }}>{fmt(g.total)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

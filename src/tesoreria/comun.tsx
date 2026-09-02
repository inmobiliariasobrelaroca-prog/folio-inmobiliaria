// ============================================================
// tesoreria/comun.tsx
// Piezas compartidas por las pantallas del módulo: formato de
// moneda y fechas, campos de formulario, colores del mapa y los
// selectores que se reutilizan en varios lugares.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

// Duplicados a propósito de los de App.tsx: este archivo no depende
// de nada exportado desde allá, así se puede reemplazar solo.

export const LOCALE_TES = "es-GT";

export const fmt = (n) =>
  (isFinite(Number(n)) ? Number(n) : 0).toLocaleString(LOCALE_TES, {
    style: "currency", currency: "GTQ", maximumFractionDigits: 2,
  });

export const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString(LOCALE_TES, { day: "2-digit", month: "short", year: "numeric" });
};

export async function llamarFuncionSesion(nombreFuncion, body) {
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

export function Campo({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">{label}</span>
      <input {...props} className="w-full mt-1 bg-[#161F2E] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]" />
    </label>
  );
}

export function CampoMoneda({ label, value, onChange, placeholder, disabled }) {
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

// Paleta del mapa: de dónde vino, dónde está, en qué se convirtió.
export const C_ORIGEN = "#2E9E6B";
export const C_BOLSA  = "#C9A227";
export const C_GASTO  = "#C0392B";

// ---------- Selectores reutilizables ----------

export function SelectorCategoria({ tipo, valor, onChange }) {
  const [cats, setCats] = useState([]);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [padre, setPadre] = useState("");
  const [error, setError] = useState("");

  const cargar = async () => {
    const { data } = await supabase.from("categorias").select("id, nombre, padre_id").eq("tipo", tipo).order("nombre");
    setCats(data || []);
  };
  useEffect(() => { cargar(); }, [tipo]);

  const padres = cats.filter((c) => !c.padre_id);
  const hijosDe = (id) => cats.filter((c) => c.padre_id === id);
  const sueltas = padres.filter((p) => hijosDe(p.id).length === 0);
  const conHijos = padres.filter((p) => hijosDe(p.id).length > 0);

  const crear = async () => {
    if (!nombre.trim()) return;
    setError("");
    const { data, error: e } = await supabase
      .from("categorias")
      .insert({ nombre: nombre.trim(), tipo, padre_id: padre || null })
      .select("id").single();
    if (e) { setError(e.message); return; }
    await cargar();
    onChange(data.id);
    setNombre(""); setPadre(""); setCreando(false);
  };

  return (
    <div>
      <div className="flex items-end gap-2">
        <label className="block flex-1">
          <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">Categoría</span>
          <select value={valor} onChange={(e) => onChange(e.target.value)}
            className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]">
            <option value="">Elegí una categoría</option>
            {conHijos.map((p) => (
              <optgroup key={p.id} label={p.nombre}>
                <option value={p.id}>{p.nombre} (general)</option>
                {hijosDe(p.id).map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
              </optgroup>
            ))}
            {sueltas.length > 0 && (
              <optgroup label="Otras">
                {sueltas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        <button type="button" onClick={() => setCreando(!creando)}
          className="mb-0.5 text-[11px] bg-[#2A3547] px-2.5 py-2 rounded-md shrink-0">
          {creando ? "Cancelar" : "+ Nueva"}
        </button>
      </div>

      {creando && (
        <div className="mt-2 bg-[#0C121C] border border-[#2A3547] rounded-md p-2.5 space-y-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la categoría"
            className="w-full bg-[#161F2E] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs" />
          <select value={padre} onChange={(e) => setPadre(e.target.value)}
            className="w-full bg-[#161F2E] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs">
            <option value="">Sin categoría padre</option>
            {padres.map((p) => <option key={p.id} value={p.id}>Dentro de {p.nombre}</option>)}
          </select>
          {error && <div className="text-[11px] text-red-400">{error}</div>}
          <button type="button" onClick={crear} disabled={!nombre.trim()}
            className="w-full text-[11px] bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-1.5 rounded-md">
            Crear categoría
          </button>
        </div>
      )}
    </div>
  );
}

export function CrearObra({ onCreada, onCancelar }) {
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [presupuesto, setPresupuesto] = useState(0);
  const [error, setError] = useState("");

  const crear = async () => {
    setError("");
    const { data, error: e } = await supabase.from("centros_costo")
      .insert({ nombre: nombre.trim(), ubicacion: ubicacion.trim() || null,
                presupuesto: Number(presupuesto) > 0 ? Number(presupuesto) : null })
      .select("id, nombre").single();
    if (e) { setError(e.message); return; }
    onCreada(data);
  };

  return (
    <div className="mt-2 bg-[#0C121C] border border-[#2A3547] rounded-md p-2.5 space-y-2">
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la obra"
        className="w-full bg-[#161F2E] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs" />
      <input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Ubicación (opcional)"
        className="w-full bg-[#161F2E] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs" />
      <CampoMoneda label="Inversión declarada (opcional)" value={presupuesto} onChange={setPresupuesto} />
      {error && <div className="text-[11px] text-red-400">{error}</div>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className="flex-1 text-[11px] bg-[#2A3547] py-1.5 rounded-md">Cancelar</button>
        <button type="button" onClick={crear} disabled={!nombre.trim()}
          className="flex-1 text-[11px] bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-1.5 rounded-md">Crear obra</button>
      </div>
    </div>
  );
}

export function CrearBolsa({ onCreada, onCancelar }) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("operativa");
  const [banco, setBanco] = useState("");
  const [titular, setTitular] = useState("");
  const [delegadaA, setDelegadaA] = useState("");
  const [disponible, setDisponible] = useState(true);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState("");

  // Roles a los que se le puede delegar el manejo de una bolsa.
  // El de administrador no aparece: ese ya ve y maneja todo.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("roles").select("id, nombre")
        .eq("es_administrador", false).order("nombre");
      setRoles(data || []);
    })();
  }, []);

  const crear = async () => {
    setError("");
    const { data, error: e } = await supabase.from("bolsas")
      .insert({
        nombre: nombre.trim(),
        tipo,
        banco: banco.trim() || null,
        titular: titular.trim() || null,
        delegada_a_rol_id: delegadaA || null,
        disponible_para_gasto: disponible,
      })
      .select("id, nombre").single();
    if (e) { setError(e.message); return; }
    onCreada(data);
  };

  return (
    <div className="mt-2 bg-[#0C121C] border border-[#2A3547] rounded-md p-2.5 space-y-2">
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la bolsa"
        className="w-full bg-[#161F2E] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs" />
      <select value={tipo} onChange={(e) => setTipo(e.target.value)}
        className="w-full bg-[#161F2E] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs">
        <option value="operativa">Operativa</option>
        <option value="prestamo">Préstamo</option>
        <option value="renta">Rentas</option>
        <option value="abono_casa">Abonos de casas</option>
        <option value="venta">Ventas</option>
        <option value="reserva">Reserva</option>
        <option value="otro">Otra</option>
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Banco"
          className="bg-[#161F2E] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs" />
        <input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Titular"
          className="bg-[#161F2E] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs" />
      </div>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-[#8A93A3]">¿Quién la maneja?</span>
        <select value={delegadaA} onChange={(e) => setDelegadaA(e.target.value)}
          className="w-full mt-1 bg-[#161F2E] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs">
          <option value="">La administración (vos)</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </label>
      {delegadaA ? (
        <p className="text-[10px] text-[#6b7280]">
          Para quien tenga ese rol el dinero es propio; a vos te va a aparecer
          como delegado, separado de lo que manejás directamente. Acordate de
          darle esta bolsa en su alcance, en la pestaña Permisos.
        </p>
      ) : null}

      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={!disponible}
          onChange={(e) => setDisponible(!e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-[#C9A227] shrink-0" />
        <span>
          <span className="text-xs">Es dinero apartado</span>
          <span className="block text-[10px] text-[#6b7280]">
            Para fondos retenidos por el banco o reservas ya comprometidas.
            No cuentan en el total disponible.
          </span>
        </span>
      </label>

      {error && <div className="text-[11px] text-red-400">{error}</div>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className="flex-1 text-[11px] bg-[#2A3547] py-1.5 rounded-md">Cancelar</button>
        <button type="button" onClick={crear} disabled={!nombre.trim()}
          className="flex-1 text-[11px] bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-1.5 rounded-md">Crear bolsa</button>
      </div>
    </div>
  );
}

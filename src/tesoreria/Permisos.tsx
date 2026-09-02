// ============================================================
// tesoreria/Permisos.tsx — quién ve qué
//
// Solo la ve el super usuario. Los permisos se guardan en el rol,
// no en la persona, así que lo que se configure acá aplica a todos
// los que tengan ese rol.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { CheckCircle2 } from "lucide-react";
import { fmt, C_BOLSA, C_GASTO } from "./comun";

export default function Permisos() {
  const [roles, setRoles] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);

  const cargar = async () => {
    setCargando(true);
    const [{ data: r }, { data: u }, { data: c }] = await Promise.all([
      supabase.from("v_alcance_roles").select("*").order("es_administrador", { ascending: false }).order("nombre"),
      supabase.from("usuarios").select("id, nombre, activo, rol_id"),
      supabase.from("permisos_finanzas").select("*").order("orden"),
    ]);
    setRoles(r || []);
    setUsuarios(u || []);
    setCatalogo(c || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#8A93A3]">
        Los permisos viven en el rol. Cambiar uno afecta a todas las personas que lo tengan.
        Los saldos siempre son los reales; el alcance solo limita qué movimientos se ven.
      </p>

      {roles.map((r) => {
        const gente = usuarios.filter((u) => u.rol_id === r.id);
        const entra = r.es_administrador || !!r.permisos?.gestionar_finanzas;
        return (
          <div key={r.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">{r.nombre}</div>
                <div className="text-[11px] text-[#8A93A3] truncate">
                  {gente.length === 0
                    ? "Sin personas asignadas"
                    : gente.map((g) => g.nombre + (g.activo === false ? " (inactivo)" : "")).join(", ")}
                </div>
              </div>
              <div className="text-right shrink-0">
                {r.es_administrador ? (
                  <span className="text-[10px] px-2 py-1 rounded-full border" style={{ borderColor: C_BOLSA, color: C_BOLSA }}>
                    Ve todo
                  </span>
                ) : entra ? (
                  <span className="text-[10px] text-[#8A93A3]">
                    {r.ambito_restringido_finanzas
                      ? `${r.bolsas_asignadas} bolsas · ${r.obras_asignadas} obras`
                      : "Sin límite de alcance"}
                  </span>
                ) : (
                  <span className="text-[10px] text-[#6b7280]">No entra a tesorería</span>
                )}
              </div>
            </div>

            {!r.es_administrador && (
              <button
                onClick={() => setAbierto(abierto === r.id ? null : r.id)}
                className="mt-2 w-full text-[11px] bg-[#2A3547] py-2 rounded-md"
              >
                {abierto === r.id ? "Cerrar" : "Configurar"}
              </button>
            )}

            {abierto === r.id && (
              <EditorRol rol={r} catalogo={catalogo} onGuardado={cargar} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function EditorRol({ rol, catalogo, onGuardado }) {
  const [permisos, setPermisos] = useState(rol.permisos || {});
  const [limitado, setLimitado] = useState(rol.ambito_restringido_finanzas !== false);
  const [bolsas, setBolsas] = useState([]);
  const [arbol, setArbol] = useState([]);
  const [bolsasSel, setBolsasSel] = useState([]);
  const [centrosSel, setCentrosSel] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: b }, { data: a }, { data: rb }, { data: rc }] = await Promise.all([
        supabase.from("v_saldos_bolsas").select("id, nombre, saldo_actual").order("nombre"),
        supabase.from("v_centros_arbol").select("*").eq("estado", "activo").order("camino"),
        supabase.from("roles_bolsas").select("bolsa_id").eq("rol_id", rol.id),
        supabase.from("roles_centros_costo").select("centro_costo_id").eq("rol_id", rol.id),
      ]);
      setBolsas(b || []);
      setArbol(a || []);
      setBolsasSel((rb || []).map((x) => x.bolsa_id));
      setCentrosSel((rc || []).map((x) => x.centro_costo_id));
    })();
  }, [rol.id]);

  const alternar = (lista, set, id) =>
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  const guardar = async () => {
    setError(""); setOk(false); setGuardando(true);
    try {
      const { error: e1 } = await supabase.from("roles")
        .update({ permisos, ambito_restringido_finanzas: limitado })
        .eq("id", rol.id);
      if (e1) throw new Error(e1.message);

      await supabase.from("roles_bolsas").delete().eq("rol_id", rol.id);
      await supabase.from("roles_centros_costo").delete().eq("rol_id", rol.id);

      if (limitado) {
        if (bolsasSel.length) {
          const { error: e2 } = await supabase.from("roles_bolsas")
            .insert(bolsasSel.map((bolsa_id) => ({ rol_id: rol.id, bolsa_id })));
          if (e2) throw new Error(e2.message);
        }
        if (centrosSel.length) {
          const { error: e3 } = await supabase.from("roles_centros_costo")
            .insert(centrosSel.map((centro_costo_id) => ({ rol_id: rol.id, centro_costo_id })));
          if (e3) throw new Error(e3.message);
        }
      }
      setOk(true);
      onGuardado && onGuardado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const entra = !!permisos.gestionar_finanzas;

  return (
    <div className="mt-3 pt-3 border-t border-[#2A3547] space-y-4">
      {/* Qué puede hacer */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-[#8A93A3] mb-2">Qué puede hacer</div>
        <div className="space-y-2">
          {catalogo.map((p) => (
            <label key={p.clave} className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={!!permisos[p.clave]}
                onChange={(e) => setPermisos({ ...permisos, [p.clave]: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-[#C9A227] shrink-0"
              />
              <span className="min-w-0">
                <span className="text-xs">{p.etiqueta}</span>
                {p.descripcion && (
                  <span className="block text-[10px] text-[#6b7280]">{p.descripcion}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>

      {!entra && (
        <div className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-800 rounded-md p-2.5">
          Sin "Entrar a tesorería" no va a ver el módulo, aunque le asignes bolsas y obras.
        </div>
      )}

      {/* Hasta dónde ve */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-[#8A93A3] mb-2">Hasta dónde ve</div>
        <label className="flex items-start gap-2.5 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={limitado}
            onChange={(e) => setLimitado(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#C9A227] shrink-0"
          />
          <span>
            <span className="text-xs">Limitar a lo que se marque abajo</span>
            <span className="block text-[10px] text-[#6b7280]">
              Si lo apagás, ve el detalle de todas las bolsas y todas las obras.
            </span>
          </span>
        </label>

        {limitado && (
          <div className="space-y-3 bg-[#0C121C] border border-[#2A3547] rounded-md p-2.5">
            <div>
              <div className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: C_BOLSA }}>
                Bolsas
              </div>
              {bolsas.map((b) => (
                <label key={b.id} className="flex items-center justify-between gap-2 text-xs cursor-pointer py-1">
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={bolsasSel.includes(b.id)}
                      onChange={() => alternar(bolsasSel, setBolsasSel, b.id)}
                      className="w-4 h-4 accent-[#C9A227] shrink-0"
                    />
                    <span className="truncate">{b.nombre}</span>
                  </span>
                  <span className="font-mono text-[10px] text-[#8A93A3] shrink-0">{fmt(b.saldo_actual)}</span>
                </label>
              ))}
            </div>

            <div className="pt-2 border-t border-[#2A3547]">
              <div className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: C_GASTO }}>
                Obras
              </div>
              <p className="text-[10px] text-[#6b7280] mb-1.5">
                Marcar una obra padre incluye todo lo que cuelgue de ella, hoy y en el futuro.
              </p>
              {arbol.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer py-1"
                  style={{ paddingLeft: `${(c.nivel || 0) * 14}px` }}>
                  <input
                    type="checkbox"
                    checked={centrosSel.includes(c.id)}
                    onChange={() => alternar(centrosSel, setCentrosSel, c.id)}
                    className="w-4 h-4 accent-[#C9A227] shrink-0"
                  />
                  <span className="truncate">
                    {c.nivel > 0 && <span className="text-[#3a4864]">└ </span>}
                    {c.nombre}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <div className="text-[11px] text-red-400">{error}</div>}
      {ok && (
        <div className="text-[11px] text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 size={12} /> Guardado. Le aplica la próxima vez que abra la app.
        </div>
      )}

      <button
        onClick={guardar}
        disabled={guardando}
        className="w-full text-xs bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2.5 rounded-md"
      >
        {guardando ? "Guardando..." : "Guardar permisos"}
      </button>
    </div>
  );
}

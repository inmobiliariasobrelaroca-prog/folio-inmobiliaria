// ============================================================
// tesoreria/Fuentes.tsx
//
// No todas las casas aportan al fondo común. Acá se elige cuáles sí.
//
// Apagar una casa no cambia nada del lado del cliente: su cuota se cobra
// igual, su estado de cuenta se ve igual. Lo único que cambia es que ese
// dinero no aparece en tesorería.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Check, X } from "lucide-react";
import { fmt, C_ORIGEN } from "./comun";

export default function Fuentes({ onCambio }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState("");

  const cargar = async () => {
    const { data } = await supabase
      .from("v_fuentes_tesoreria")
      .select("*")
      .order("proyecto")
      .order("folio");
    setFilas(data || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const cambiar = async (propiedadId, valor) => {
    setError(""); setGuardando(propiedadId);
    try {
      const { error: e } = await supabase.rpc("fijar_ingreso_tesoreria", {
        p_propiedad: propiedadId, p_valor: valor,
      });
      if (e) throw new Error(e.message);
      await cargar();
      onCambio && onCambio();
    } catch (e) { setError(e.message); }
    finally { setGuardando(null); }
  };

  const cambiarProyecto = async (proyectoId, valor) => {
    const objetivo = filas.filter(
      (f) => f.proyecto_id === proyectoId && f.entra_a_tesoreria !== valor);
    setError(""); setGuardando(proyectoId);
    try {
      for (const f of objetivo) {
        const { error: e } = await supabase.rpc("fijar_ingreso_tesoreria", {
          p_propiedad: f.propiedad_id, p_valor: valor,
        });
        if (e) throw new Error(e.message);
      }
      await cargar();
      onCambio && onCambio();
    } catch (e) { setError(e.message); }
    finally { setGuardando(null); }
  };

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;

  const proyectos = [...new Set(filas.map((f) => f.proyecto))];
  const dentro = filas.filter((f) => f.entra_a_tesoreria);
  const porCobrarDentro = dentro.reduce((a, f) => a + Number(f.por_cobrar || 0), 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#8A93A3] leading-relaxed">
        Apagar una casa no cambia nada para el cliente: su cuota se cobra igual y
        su estado de cuenta se ve igual. Solo deja de aparecer en tesorería.
      </p>

      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 flex gap-6">
        <div>
          <div className="text-[10px] uppercase text-[#8A93A3]">Casas que aportan</div>
          <div className="font-mono text-lg">{dentro.length} de {filas.length}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-[#8A93A3]">Por cobrar de esas casas</div>
          <div className="font-mono text-lg" style={{ color: C_ORIGEN }}>{fmt(porCobrarDentro)}</div>
        </div>
      </div>

      {error && <div className="text-[11px] text-red-400">{error}</div>}

      {proyectos.map((nombre) => {
        const dele = filas.filter((f) => f.proyecto === nombre);
        const pid = dele[0].proyecto_id;
        const todas = dele.every((f) => f.entra_a_tesoreria);
        const ninguna = dele.every((f) => !f.entra_a_tesoreria);
        return (
          <div key={nombre} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-sm truncate">{nombre}</div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => cambiarProyecto(pid, true)}
                  disabled={todas || guardando === pid}
                  className="text-[10px] bg-[#2A3547] disabled:opacity-30 px-2 py-1 rounded">
                  Todas
                </button>
                <button onClick={() => cambiarProyecto(pid, false)}
                  disabled={ninguna || guardando === pid}
                  className="text-[10px] bg-[#2A3547] disabled:opacity-30 px-2 py-1 rounded">
                  Ninguna
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              {dele.map((f) => (
                <div key={f.propiedad_id}
                  className="bg-[#0C121C] border border-[#2A3547] rounded-md p-2 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] truncate">
                      {f.folio}
                      {f.es_renta && <span className="text-[#8A93A3]"> · alquiler</span>}
                    </div>
                    <div className="text-[10px] text-[#8A93A3] truncate">
                      {f.cliente_nombre}
                      {Number(f.cuotas_por_cobrar) > 0
                        ? ` · ${f.cuotas_por_cobrar} cuotas por cobrar, ${fmt(f.por_cobrar)}`
                        : " · sin cuotas por cobrar"}
                    </div>
                    {f.entra_a_tesoreria && f.bolsa_destino && (
                      <div className="text-[10px] text-[#6b7280] truncate">
                        Cae en {f.bolsa_destino}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => cambiar(f.propiedad_id, !f.entra_a_tesoreria)}
                    disabled={guardando === f.propiedad_id}
                    className={`shrink-0 flex items-center gap-1 text-[10px] px-2 py-1.5 rounded disabled:opacity-40 ${
                      f.entra_a_tesoreria
                        ? "bg-emerald-950/60 border border-emerald-800 text-emerald-400"
                        : "bg-[#2A3547] text-[#8A93A3]"}`}>
                    {f.entra_a_tesoreria ? <Check size={11} /> : <X size={11} />}
                    {f.entra_a_tesoreria ? "Aporta" : "No aporta"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

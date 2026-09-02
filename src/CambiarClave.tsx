// ============================================================
// CambiarClave.tsx — Grupo Sobre la Roca
//
// Cierra el hueco del flujo de "olvidé mi contraseña": el correo de
// recuperación deja al usuario dentro de la app, pero sin ninguna
// pantalla para fijar la contraseña nueva. Este componente la abre
// solo cuando detecta esa sesión de recuperación.
//
// Instalación: una línea en App.tsx, dentro de AppInterno, junto a
// <AvisoCodigoPendiente />:
//
//     <CambiarClave />
//
// También sirve para cualquiera del equipo que quiera cambiarla:
// se le puede pasar la prop abierto={true} desde donde se necesite.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { KeyRound, X } from "lucide-react";

export default function CambiarClave({ abierto: abiertoInicial = false, onCerrar }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [recuperacion, setRecuperacion] = useState(false);
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  // Supabase avisa con PASSWORD_RECOVERY cuando la sesión viene del
  // enlace del correo. Ahí es cuando hay que pedir la contraseña nueva.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "PASSWORD_RECOVERY") {
        setRecuperacion(true);
        setAbierto(true);
      }
    });
    // Si la página se cargó directo desde el enlace, el evento ya pasó:
    // se revisa el fragmento de la URL por si acaso.
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setRecuperacion(true);
      setAbierto(true);
    }
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { setAbierto(abiertoInicial); }, [abiertoInicial]);

  if (!abierto) return null;

  const cerrar = () => {
    setAbierto(false);
    setClave(""); setClave2(""); setError(""); setListo(false);
    onCerrar && onCerrar();
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    if (clave.length < 8) { setError("Usá al menos 8 caracteres."); return; }
    if (clave !== clave2) { setError("Las dos contraseñas no coinciden."); return; }

    setGuardando(true);
    const { error: e1 } = await supabase.auth.updateUser({ password: clave });
    setGuardando(false);

    if (e1) {
      setError(
        e1.message.includes("same as the old")
          ? "Esa es la contraseña que ya tenías. Elegí una distinta."
          : e1.message
      );
      return;
    }
    setListo(true);
  };

  if (listo) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-6">
        <div className="bg-[#161F2E] border border-emerald-800 rounded-lg p-5 w-full max-w-sm text-center space-y-3">
          <KeyRound size={22} className="text-emerald-400 mx-auto" />
          <div className="font-serif text-lg">Contraseña actualizada</div>
          <p className="text-xs text-[#8A93A3]">
            Usala la próxima vez que entres con tu correo. Guardala en un lugar seguro.
          </p>
          <button
            onClick={() => { cerrar(); if (recuperacion) window.location.replace(window.location.pathname); }}
            className="w-full bg-[#C9A227] text-[#101826] font-medium py-2.5 rounded-md text-sm"
          >
            Continuar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-6">
      <form onSubmit={guardar} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-5 w-full max-w-sm space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <KeyRound size={20} className="text-[#C9A227] mb-2" />
            <div className="font-serif text-lg leading-tight">
              {recuperacion ? "Elegí tu contraseña" : "Cambiar contraseña"}
            </div>
            <div className="text-[11px] text-[#8A93A3] mt-0.5">
              {recuperacion
                ? "Entraste desde el enlace del correo. Definila ahora."
                : "La vas a usar para entrar con tu correo."}
            </div>
          </div>
          {!recuperacion && (
            <button type="button" onClick={cerrar} className="text-[#8A93A3] hover:text-[#EDE7D9] p-1">
              <X size={18} />
            </button>
          )}
        </div>

        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">Contraseña nueva</span>
          <input
            type={ver ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]"
          />
        </label>

        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">Confirmala</span>
          <input
            type={ver ? "text" : "password"}
            required
            autoComplete="new-password"
            value={clave2}
            onChange={(e) => setClave2(e.target.value)}
            className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]"
          />
        </label>

        <label className="flex items-center gap-2 text-[11px] text-[#8A93A3] cursor-pointer">
          <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} className="accent-[#C9A227]" />
          Mostrar lo que escribo
        </label>

        <p className="text-[11px] text-[#6b7280]">
          Mínimo 8 caracteres. Nadie más la puede ver, ni siquiera el administrador:
          queda cifrada en el servidor.
        </p>

        {error && <div className="text-xs text-red-400">{error}</div>}

        <button
          type="submit"
          disabled={guardando || !clave || !clave2}
          className="w-full bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2.5 rounded-md text-sm"
        >
          {guardando ? "Guardando..." : "Guardar contraseña"}
        </button>
      </form>
    </div>
  );
}

// ============================================================
// GuardiaSesion.tsx — Grupo Sobre la Roca
//
// Cuando el token vence, Supabase devuelve 401 y el navegador
// muestra "TypeError: Failed to fetch", que no le dice nada a nadie
// y parece un error del sistema. Este componente distingue tres
// casos y los explica: sin conexión, sesión vencida, o un fallo
// puntual de red.
//
// Instalación: dos líneas en App.tsx, dentro de AppInterno, junto a
// <AvisoCodigoPendiente />:
//
//     import GuardiaSesion from "./GuardiaSesion";
//     <GuardiaSesion />
//
// No interfiere con el manejo de errores que ya existe: observa las
// peticiones pero las deja pasar tal cual, con su error incluido.
// ============================================================

import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { LogOut, WifiOff } from "lucide-react";

export default function GuardiaSesion() {
  const [estado, setEstado] = useState(null); // null | "vencida" | "sinRed"
  const revisando = useRef(false);

  // Pregunta si la sesión sigue siendo válida. Solo afirma que venció
  // cuando hay conexión: sin red no se puede saber, y acusar en falso
  // haría que alguien cierre sesión sin necesidad.
  const revisarSesion = async () => {
    if (revisando.current) return;
    revisando.current = true;
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setEstado("sinRed");
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      const s = data?.session;
      const vencida =
        !!error ||
        !s ||
        (s.expires_at && s.expires_at * 1000 < Date.now());
      setEstado(vencida ? "vencida" : null);
    } catch {
      // Si ni siquiera se pudo preguntar, es problema de red.
      setEstado("sinRed");
    } finally {
      revisando.current = false;
    }
  };

  // Supabase avisa cuando cierra la sesión por su cuenta, que es lo
  // que pasa si falla la renovación del token.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (evento === "SIGNED_OUT" && !sesion) revisarSesion();
      if (evento === "TOKEN_REFRESHED") setEstado(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Observa las peticiones a Supabase. Un 401, o un fallo de red,
  // dispara la revisión. La respuesta y los errores siguen su curso
  // normal para que nada de lo que ya existe cambie.
  useEffect(() => {
    const original = window.fetch;
    if (original.__slrGuardia) return;

    const esDeSupabase = (entrada) => {
      const url =
        typeof entrada === "string" ? entrada : entrada?.url || String(entrada || "");
      return url.includes(".supabase.co");
    };

    const envuelto = async (...args) => {
      try {
        const res = await original(...args);
        if (res.status === 401 && esDeSupabase(args[0])) revisarSesion();
        return res;
      } catch (e) {
        if (esDeSupabase(args[0])) revisarSesion();
        throw e;
      }
    };
    envuelto.__slrGuardia = true;
    window.fetch = envuelto;

    return () => { window.fetch = original; };
  }, []);

  // Al volver a la app después de un rato, se revisa antes de que la
  // persona intente guardar algo y se lleve el error.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") revisarSesion();
    };
    const alConectar = () => revisarSesion();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alConectar);
    window.addEventListener("offline", () => setEstado("sinRed"));
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alConectar);
    };
  }, []);

  if (!estado) return null;

  const volverAEntrar = async () => {
    try { await supabase.auth.signOut(); } catch { /* da igual: igual recargamos */ }
    window.location.replace(window.location.pathname);
  };

  if (estado === "sinRed") {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[90] p-3">
        <div className="mx-auto max-w-sm bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 flex items-center gap-2.5 shadow-lg">
          <WifiOff size={16} className="text-[#C9A227] shrink-0" />
          <span className="text-xs">
            Sin conexión. Lo que guardes ahora no se va a registrar.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-6">
      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-5 w-full max-w-sm text-center space-y-3">
        <LogOut size={22} className="text-[#C9A227] mx-auto" />
        <div className="font-serif text-lg">Tu sesión venció</div>
        <p className="text-xs text-[#8A93A3] leading-relaxed">
          Por seguridad la sesión caduca cada cierto tiempo. Nada de lo que
          hiciste antes se perdió, pero lo último que intentaste guardar no
          quedó registrado. Volvé a entrar y repetilo.
        </p>
        <button
          onClick={volverAEntrar}
          className="w-full bg-[#C9A227] text-[#101826] font-medium py-2.5 rounded-md text-sm"
        >
          Volver a entrar
        </button>
      </div>
    </div>
  );
}

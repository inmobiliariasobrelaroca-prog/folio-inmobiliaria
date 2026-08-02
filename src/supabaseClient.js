import { createClient } from "@supabase/supabase-js";

// En producción (Vercel), estas dos llaves vienen de las Environment Variables del proyecto.
// En StackBlitz, si no están configuradas, usa estos valores de respaldo para seguir probando.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://knquysqjhprnyztkgmwb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_lUjd1hMqkWqnQ4Q8qun5FA_WU-1UOIf";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Guarda la sesión en sessionStorage en vez de localStorage: así sobrevive a que
    // refresques la página, pero se borra sola en cuanto cierras la pestaña o el
    // navegador — nadie queda con la sesión abierta sin querer.
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
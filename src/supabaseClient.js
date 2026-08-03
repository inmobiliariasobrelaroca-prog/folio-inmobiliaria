import { createClient } from "@supabase/supabase-js";

// En producción (Vercel), estas dos llaves vienen de las Environment Variables del proyecto.
// En StackBlitz, si no están configuradas, usa estos valores de respaldo para seguir probando.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://knquysqjhprnyztkgmwb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtucXV5c3FqaHBybnl6dGtnbXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MDQ4MTAsImV4cCI6MjA5OTQ4MDgxMH0.lbGr2k7_NIiqAYhKRDP0aGZ8-MJsA-ySEFqTemhbexs";

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

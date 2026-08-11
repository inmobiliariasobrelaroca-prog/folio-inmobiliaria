// Edge Function: validar-codigo-acceso
//
// Paso previo obligatorio al login de "Inmobiliaria" (staff) y "Asesor" con
// código de 8 dígitos. El navegador NUNCA decide si un código es válido:
// esta función valida contra la base con la llave de servicio, cuenta
// intentos fallidos por IP y bloquea tras 5 intentos en 15 minutos.
//
// Si el código es válido y el usuario está activo, responde con el correo
// sintético (`u<codigo>@equipo.folio`) para que el navegador complete el
// login con supabase.auth.signInWithPassword({ email, password: codigo }) —
// la contraseña real ya es el código mismo (mismo patrón que usa el login
// de clientes), así que esta función no maneja sesiones directamente.
//
// Deploy: supabase functions deploy validar-codigo-acceso
// Requiere las env vars estándar de Supabase Edge Functions
// (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) — ya están disponibles por
// defecto en el entorno de Edge Functions, no hace falta configurarlas a mano.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_INTENTOS = 5;
const VENTANA_MINUTOS = 15;
const DOMINIO_EQUIPO = "equipo.folio";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // IP del llamador. Supabase Edge Functions corren detrás de un proxy que
  // agrega x-forwarded-for; si algún día se mueve de plataforma, revisa que
  // este header siga siendo confiable en el nuevo entorno.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocida";

  let codigo = "";
  try {
    const body = await req.json();
    codigo = String(body?.codigo || "").trim();
  } catch {
    return json({ error: "Solicitud inválida" }, 400);
  }

  if (!/^[0-9]{8}$/.test(codigo)) {
    return json({ error: "Código incorrecto." }, 401);
  }

  // 1. ¿Esta IP ya se pasó de intentos fallidos en la ventana de tiempo?
  const desde = new Date(Date.now() - VENTANA_MINUTOS * 60 * 1000).toISOString();
  const { count: fallidos } = await admin
    .from("intentos_login")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("exito", false)
    .gte("creado_en", desde);

  if ((fallidos ?? 0) >= MAX_INTENTOS) {
    return json({ error: `Demasiados intentos. Espera ${VENTANA_MINUTOS} minutos e intenta de nuevo.` }, 429);
  }

  // 2. ¿El código corresponde a un usuario activo?
  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, activo, tipo")
    .eq("codigo", codigo)
    .maybeSingle();

  const valido = !!usuario && usuario.activo === true;

  // 3. Registra el intento (éxito o fallo) sin importar el resultado.
  await admin.from("intentos_login").insert({
    codigo_intentado: codigo,
    ip,
    exito: valido,
  });

  if (!valido) {
    // Mensaje genérico a propósito: no revela si el código no existe o si
    // el usuario está desactivado, para no ayudar a alguien a adivinar cuáles
    // códigos existen.
    return json({ error: "Código incorrecto." }, 401);
  }

  return json({ ok: true, email: `u${codigo}@${DOMINIO_EQUIPO}` });
});

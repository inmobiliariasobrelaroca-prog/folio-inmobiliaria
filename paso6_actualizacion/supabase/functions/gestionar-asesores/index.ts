// Edge Function: gestionar-asesores
//
// Solo la usa un administrador desde la pantalla Equipo → Usuarios. Crea y
// desactiva cuentas de asesor (y de staff-por-código el día que se migre),
// generando el código de 8 dígitos EN EL SERVIDOR — nunca en el navegador —
// y creando la cuenta de Supabase Auth correspondiente con el mismo patrón
// que ya usa el login de clientes: la contraseña real de la cuenta ES el
// código, con un correo sintético `u<codigo>@equipo.folio`.
//
// Acciones (body: { accion, ...datos }):
//   - crear_asesor      { nombre, tipo: 'asesor_interno'|'asesor_externo', rol_id }
//                        → devuelve { usuario_id, codigo } una sola vez.
//   - regenerar_codigo  { usuario_id } → nuevo código, reactiva la cuenta.
//                        → devuelve { codigo } una sola vez.
//   - cambiar_activo    { usuario_id, activo: boolean }
//
// Deploy: supabase functions deploy gestionar-asesores
//
// Nota: este repo no tenía carpeta supabase/functions versionada antes de
// este cambio (gestionar-usuarios y cliente-cambiar-codigo, que ya existen en
// producción, se administran aparte). Si en algún momento se decide fusionar
// esta función con gestionar-usuarios, la lógica de aquí se puede mover tal
// cual como una acción más de esa función.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DOMINIO_EQUIPO = "equipo.folio";
const TIPOS_VALIDOS = ["asesor_interno", "asesor_externo"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function generarCodigo8() {
  // Evita empezar en 0 para que siempre se vea/escriba como 8 dígitos.
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Autenticación del llamador: debe traer su propio token de sesión
  // (mismo patrón que llamarFuncionSesion en src/App.tsx).
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "No autenticado" }, 401);

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Sesión inválida" }, 401);

  // Verifica que quien llama sea administrador activo.
  const { data: llamador } = await admin
    .from("usuarios")
    .select("id, activo, roles(es_administrador)")
    .eq("id", userData.user.id)
    .maybeSingle();

  const esAdmin = !!llamador?.activo && !!(llamador as any)?.roles?.es_administrador;
  if (!esAdmin) return json({ error: "Solo un administrador puede gestionar asesores." }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Solicitud inválida" }, 400);
  }

  const accion = body?.accion;

  // -------------------------------------------------------------------
  if (accion === "crear_asesor") {
    const nombre = String(body?.nombre || "").trim();
    const tipo = String(body?.tipo || "");
    const rolId = body?.rol_id;
    if (!nombre || !TIPOS_VALIDOS.includes(tipo) || !rolId) {
      return json({ error: "Faltan datos: nombre, tipo y rol_id son obligatorios." }, 400);
    }

    let codigo = "";
    let authUserId = "";
    let emailAuth = "";
    // Reintenta unas pocas veces si el código generado ya existe (choque de unicidad).
    for (let intento = 0; intento < 5; intento++) {
      codigo = generarCodigo8();
      const email = `u${codigo}@${DOMINIO_EQUIPO}`;
      const { data: nuevoAuth, error: authError } = await admin.auth.admin.createUser({
        email,
        password: codigo,
        email_confirm: true,
      });
      if (!authError && nuevoAuth?.user) {
        authUserId = nuevoAuth.user.id;
        emailAuth = email;
        break;
      }
      // Si el correo ya existe (código repetido), reintenta con otro código.
      if (authError && !/already been registered|already exists/i.test(authError.message || "")) {
        return json({ error: authError.message }, 400);
      }
    }
    if (!authUserId) return json({ error: "No se pudo generar un código único, intenta de nuevo." }, 500);

    const { error: insertError } = await admin.from("usuarios").insert({
      id: authUserId,
      nombre,
      tipo,
      rol_id: rolId,
      codigo,
      email: emailAuth,
      activo: true,
    });
    if (insertError) {
      // Deshace la cuenta de Auth huérfana si la fila de usuarios falló.
      await admin.auth.admin.deleteUser(authUserId);
      return json({ error: insertError.message }, 400);
    }

    return json({ usuario_id: authUserId, codigo });
  }

  // -------------------------------------------------------------------
  if (accion === "regenerar_codigo") {
    const usuarioId = body?.usuario_id;
    if (!usuarioId) return json({ error: "Falta usuario_id" }, 400);

    const { data: usuario } = await admin.from("usuarios").select("id, tipo").eq("id", usuarioId).maybeSingle();
    if (!usuario) return json({ error: "Usuario no encontrado" }, 404);

    let codigo = "";
    for (let intento = 0; intento < 5; intento++) {
      const candidato = generarCodigo8();
      const { data: choque } = await admin.from("usuarios").select("id").eq("codigo", candidato).maybeSingle();
      if (!choque) { codigo = candidato; break; }
    }
    if (!codigo) return json({ error: "No se pudo generar un código único, intenta de nuevo." }, 500);

    const email = `u${codigo}@${DOMINIO_EQUIPO}`;
    const { error: authError } = await admin.auth.admin.updateUserById(usuarioId, {
      email,
      password: codigo,
      email_confirm: true,
      ban_duration: "none",
    });
    if (authError) return json({ error: authError.message }, 400);

    const { error: updateError } = await admin
      .from("usuarios")
      .update({ codigo, email, activo: true })
      .eq("id", usuarioId);
    if (updateError) return json({ error: updateError.message }, 400);

    return json({ codigo });
  }

  // -------------------------------------------------------------------
  if (accion === "cambiar_activo") {
    const usuarioId = body?.usuario_id;
    const activo = !!body?.activo;
    if (!usuarioId) return json({ error: "Falta usuario_id" }, 400);

    const { error: updateError } = await admin.from("usuarios").update({ activo }).eq("id", usuarioId);
    if (updateError) return json({ error: updateError.message }, 400);

    if (!activo) {
      // Defensa en profundidad para cerrar la sesión activa (requisito de la
      // especificación): banea al usuario a nivel de Auth y le rota la
      // contraseña, para que el código ya no sirva aunque alguien lo reuse.
      // GoTrue no expone un "matar sesión ya" instantáneo por user id; el
      // ban bloquea intentos nuevos de inmediato, y los tokens de acceso ya
      // emitidos expiran solos en poco tiempo (revisa la duración configurada
      // en tu proyecto). La app también revisa `activo` cada vez que refresca
      // la sesión, así que la ventana real es corta en la práctica.
      await admin.auth.admin.updateUserById(usuarioId, {
        password: crypto.randomUUID(),
        ban_duration: "876000h", // ~100 años: bloqueo indefinido hasta reactivar
      });
    }

    return json({ ok: true });
  }

  return json({ error: `Acción desconocida: ${accion}` }, 400);
});

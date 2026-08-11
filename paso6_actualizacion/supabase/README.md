# Supabase · paso 6, asesores con código y permisos

Esta carpeta es nueva en el repo — antes las Edge Functions (`gestionar-usuarios`,
`cliente-cambiar-codigo`) se administraban fuera de git. Aquí solo viven las
piezas nuevas de `design_handoff_app_movil/paso6_asesores/ESPECIFICACION.md`.

## Estado: ya desplegado en producción (2026-08-11)

La migración `20260811000000_asesores_codigo_permisos.sql` ya se aplicó
contra el proyecto real (`knquysqjhprnyztkgmwb`) y las dos Edge Functions
(`validar-codigo-acceso`, `gestionar-asesores`) ya están desplegadas y
activas. Esto se hizo con acceso directo y en vivo al esquema, así que las
tres dudas que originalmente quedaban abiertas (tipos `bigint` vs `uuid`,
nombre de `usuarios.rol_id`, policies con `using (true)`) ya se verificaron
contra la base real, no son suposiciones:

- Las llaves primarias de `roles`, `proyectos_venta`, `propiedades_venta` y
  `usuarios` son `uuid` — la migración ya usa ese tipo en todas las tablas
  nuevas.
- `usuarios.rol_id` sí es el nombre real de la columna que referencia a
  `roles.id`.
- **Se encontró y corrigió un problema real** (sección 8 de la migración):
  varias policies existentes en `clientes`, `cargos_luz`, `documentos`,
  `notificaciones`, `comprobantes` (insert) y `cuotas` (insert/delete) usaban
  `exists (select 1 from usuarios where usuarios.id = auth.uid())` — es
  decir, cualquier fila en `usuarios`, sin mirar el rol. Un asesor recién
  creado habría entrado ahí igual que cualquier empleado real. Peor aún, la
  policy de lectura de `usuarios` era `auth.uid() is not null`, así que
  cualquier cliente autenticado podía leer la columna `codigo` (la
  contraseña del equipo) de todo el mundo. La sección 8 redefine
  `usuario_es_staff()` para exigir `tipo = 'staff'` y reemplaza esas
  policies puntuales — no cambia nada para el equipo real, solo excluye a
  los asesores de accesos que nunca debieron tener. Ver el encabezado del
  archivo de migración para el detalle completo.

Si necesitas volver a aplicar esto en otro entorno (por ejemplo una rama de
desarrollo nueva), sigue las instrucciones de abajo — el archivo de
migración es idempotente (usa `if not exists` / `on conflict do nothing` en
casi todo, con la excepción de las policies de la sección 8, que se
recrean con `drop policy if exists` + `create policy`).

## Antes de correr nada (si vuelves a aplicar esto en otro proyecto)

1. **Prueba primero contra una rama de desarrollo de Supabase**, no contra el
   proyecto de producción (`main` sirve a clientes reales). Si no tienes una
   rama de desarrollo, al menos revisa cada paso en Supabase Studio antes de
   confirmarlo.
2. Verifica en tu propio proyecto los mismos tres puntos que se verificaron
   aquí: tipos de llave primaria (`uuid` vs `bigint`), el nombre real de la
   columna que conecta `usuarios` con `roles`, y si alguna policy existente
   en `cuotas`, `comprobantes` o `clientes` dice `to authenticated using
   (true)` o el equivalente "cualquier fila en usuarios" — la sección 8 de
   este script asume los nombres de policy exactos que existían en
   `knquysqjhprnyztkgmwb`; en otro proyecto puede que tengan otro nombre y
   haya que ajustar los `drop policy if exists`.

## Qué agrega la migración (resumen)

- `usuarios`: columnas `codigo`, `activo`, `tipo`.
- `propiedades_venta_condiciones`: tabla **nueva y separada** de
  `propiedades_venta` para `precio_minimo` y la tasa de financiamiento
  sugerida. `propiedades_venta.precio` ya existía en producción (columna
  pública, controlada por `mostrar_precio`) — no se duplica; el cotizador
  del asesor lo lee directo de ahí. Va aparte a propósito: `propiedades_venta`
  tiene una policy pública (la usa el sitio web de ventas), y el precio
  mínimo de negociación no puede vivir ahí sin filtrarse al público.
- `roles_proyectos_venta` / `roles_propiedades_venta`: alcance del catálogo
  de venta por rol, espejo de `roles_proyectos` / `roles_propiedades` que ya
  existen pero apuntan a la cartera (`propiedades`/`proyectos`), no al
  catálogo. Ver el punto 3 del script para la explicación completa de por
  qué no se reutilizaron las tablas existentes tal cual lo sugería
  `ESPECIFICACION.md`.
- `intentos_login`: control de intentos fallidos por IP.
- Roles `Asesor externo` y `Asesor interno` con los permisos base.
- RLS: lectura de `propiedades_venta_condiciones` y `propiedades_venta` para
  asesores dentro de su alcance; nada de esto toca la policy pública
  existente.

## Cómo ejecutar la migración

*(Ya se hizo en producción — ver "Estado" arriba. Deja esto como referencia
para el próximo entorno.)*

**Opción A — Supabase Studio (más simple, sin instalar nada):**
Abre el proyecto → SQL Editor → pega el contenido del archivo de migración →
Run.

**Opción B — Supabase CLI:**

```bash
supabase login
supabase link --project-ref knquysqjhprnyztkgmwb
supabase db push
```

## Cómo desplegar las Edge Functions

*(También ya desplegadas en producción, ambas ACTIVE con verificación de JWT
activada por defecto — la app ya manda el token correcto en ambos casos, así
que no hizo falta `--no-verify-jwt`.)*

```bash
supabase functions deploy validar-codigo-acceso
supabase functions deploy gestionar-asesores
```

Ambas usan `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, que ya están
disponibles automáticamente en el entorno de Edge Functions — no hace falta
configurar nada extra con `supabase secrets set`.

`validar-codigo-acceso` debe quedar invocable **sin sesión** (la llama el
login, antes de autenticar). El deploy por defecto de Supabase ya acepta la
llave `anon` como autenticación válida — que es justo lo que
`supabase.functions.invoke(...)` manda automáticamente desde el navegador
cuando no hay sesión — así que no debería hacer falta `--no-verify-jwt`.
Pruébala manualmente después de desplegar (con un código inválido, para no
gastar intentos reales):

```bash
curl -i -X POST \
  'https://knquysqjhprnyztkgmwb.supabase.co/functions/v1/validar-codigo-acceso' \
  -H "apikey: TU_LLAVE_ANON" \
  -H "Authorization: Bearer TU_LLAVE_ANON" \
  -H "Content-Type: application/json" \
  -d '{"codigo":"00000000"}'
```

Debe responder `401` con `{"error":"Código incorrecto."}` — si responde
`401` de "Missing authorization header" o similar, la función está exigiendo
un JWT de usuario real y hay que desplegarla con `--no-verify-jwt`.

## Cómo probar el flujo completo

La migración y las funciones ya están desplegadas — falta el checklist
manual, que no se puede automatizar desde aquí:

1. Entra a la app como administrador → Equipo → Usuarios → "Nuevo usuario" →
   elige "Asesor ext." → crea uno de prueba. Anota el código que te muestra
   (solo se ve una vez).
2. En Equipo → Roles, edita el rol "Asesor externo" (o clónalo con otro
   nombre) y asígnale, en "Catálogo de venta", una propiedad de prueba que
   ya tenga fotos en `propiedades_venta`.
3. En esa misma propiedad (Catálogo de ventas → la propiedad → carga un
   Precio y activa "Mostrar precio" arriba, y en la sección "Condiciones
   privadas de venta" al final del formulario, carga un precio mínimo de
   prueba).
4. Cierra sesión, entra por la pestaña "Asesor" con el código del paso 1.
   Deberías ver esa propiedad, su precio, y poder cotizar y enviar por
   WhatsApp.
5. Verifica que ese mismo asesor **no** pueda leer `cuotas`, `comprobantes`
   ni `clientes` (pruébalo directo contra la API de Supabase con su sesión,
   no solo desde la app — la app simplemente no pide esas tablas, pero eso
   no prueba que RLS las bloquee).

## Pendiente (fuera del alcance de esta entrega)

- **Migrar al equipo interno de correo/contraseña a código** — la
  especificación pide dejarlo para el final, con aviso previo. No se tocó el
  login de "Inmobiliaria".
- **Barra de pestañas y flujos móviles reales (Paso 3B)** — no es parte de
  esta especificación (paso 6); sigue pendiente por separado.

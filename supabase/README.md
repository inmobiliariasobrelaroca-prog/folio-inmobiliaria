# Supabase · paso 6, asesores con código y permisos

Esta carpeta es nueva en el repo — antes las Edge Functions (`gestionar-usuarios`,
`cliente-cambiar-codigo`) se administraban fuera de git. Aquí solo viven las
piezas nuevas de `design_handoff_app_movil/paso6_asesores/ESPECIFICACION.md`.

## Antes de correr nada

1. **Prueba primero contra una rama de desarrollo de Supabase**, no contra el
   proyecto de producción (`main` sirve a clientes reales). Si no tienes una
   rama de desarrollo, al menos revisa cada paso en Supabase Studio antes de
   confirmarlo.
2. Abre `migrations/20260811000000_asesores_codigo_permisos.sql` y lee los
   comentarios del encabezado — hay **tres cosas que escribí sin poder ver tu
   esquema real** y que debes verificar en Table editor antes de ejecutar:
   - El tipo de las llaves primarias de `roles`, `proyectos_venta` y
     `propiedades_venta` (asumí `bigint`, que es el default actual de
     Supabase; si tus tablas usan `uuid`, ajusta las columnas marcadas
     `[VERIFICAR TIPO]`).
   - Que `usuarios.rol_id` sea efectivamente el nombre de la columna que
     referencia a `roles.id` (lo infiero de cómo `src/App.tsx` llama a la
     Edge Function `gestionar-usuarios` con `rol_id`, pero no tengo el código
     de esa función para confirmarlo).
   - Que ninguna policy existente en `cuotas`, `comprobantes` o `clientes`
     diga simplemente `to authenticated using (true)` — si alguna lo dice, un
     asesor recién creado entraría ahí igual que cualquier otro usuario
     autenticado. La migración no puede detectar esto sin leer tus policies
     reales; el punto 7 del script te lo recuerda de nuevo.

## Qué agrega la migración (resumen)

- `usuarios`: columnas `codigo`, `activo`, `tipo`.
- `propiedades_venta_condiciones`: tabla **nueva y separada** de
  `propiedades_venta` para `precio` y `precio_minimo`. Va aparte a propósito:
  `propiedades_venta` tiene una policy pública (la usa el sitio web de
  ventas), y el precio mínimo de negociación no puede vivir ahí sin
  filtrarse al público.
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

**Opción A — Supabase Studio (más simple, sin instalar nada):**
Abre el proyecto → SQL Editor → pega el contenido del archivo de migración →
Run. Revisa los `[VERIFICAR TIPO]` antes.

**Opción B — Supabase CLI:**

```bash
supabase login
supabase link --project-ref knquysqjhprnyztkgmwb
supabase db push
```

## Cómo desplegar las Edge Functions

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

## Cómo probar el flujo completo (antes de tocar producción)

1. Corre la migración.
2. Despliega las dos funciones.
3. Entra a la app como administrador → Equipo → Usuarios → "Nuevo usuario" →
   elige "Asesor ext." → crea uno de prueba. Anota el código que te muestra
   (solo se ve una vez).
4. En Equipo → Roles, edita el rol "Asesor externo" (o clónalo con otro
   nombre) y asígnale, en "Catálogo de venta", una propiedad de prueba que
   ya tenga fotos en `propiedades_venta`.
5. En esa misma propiedad (Catálogo de ventas → la propiedad → sección
   "Condiciones privadas de venta", al final del formulario), carga un
   precio de prueba.
6. Cierra sesión, entra por la pestaña "Asesor" con el código del paso 3.
   Deberías ver esa propiedad, su precio, y poder cotizar y enviar por
   WhatsApp.
7. Verifica que ese mismo asesor **no** pueda leer `cuotas`, `comprobantes`
   ni `clientes` (pruébalo directo contra la API de Supabase con su sesión,
   no solo desde la app — la app simplemente no pide esas tablas, pero eso
   no prueba que RLS las bloquee).

## Pendiente (fuera del alcance de esta entrega)

- **Migrar al equipo interno de correo/contraseña a código** — la
  especificación pide dejarlo para el final, con aviso previo. No se tocó el
  login de "Inmobiliaria".
- **Barra de pestañas y flujos móviles reales (Paso 3B)** — no es parte de
  esta especificación (paso 6); sigue pendiente por separado.

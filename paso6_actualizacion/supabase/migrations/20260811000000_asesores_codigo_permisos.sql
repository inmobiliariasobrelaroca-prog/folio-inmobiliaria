-- ============================================================================
-- Asesores con código y permisos por propiedad
-- Rama: pwa-movil · ver design_handoff_app_movil/paso6_asesores/ESPECIFICACION.md
--
-- Esta versión fue verificada contra el esquema real del proyecto Supabase
-- (knquysqjhprnyztkgmwb) — tipos de columna, constraints y policies existentes
-- se leyeron en vivo, ya no son suposiciones.
-- ============================================================================
--
-- HALLAZGO IMPORTANTE al verificar contra el esquema real (sección 8 abajo):
--
-- Varias policies YA EXISTENTES (no creadas por esta migración) dan acceso
-- completo a `clientes`, `cargos_luz`, `documentos`, `notificaciones`,
-- inserción/borrado de `cuotas` e inserción de `comprobantes` a **cualquier
-- fila en `usuarios`**, sin mirar el rol — literalmente
-- `exists (select 1 from usuarios where usuarios.id = auth.uid())`. Un asesor
-- es "un usuario con un rol restringido" (así lo dice la propia especificación),
-- así que en cuanto se crea la primera cuenta de asesor, esa cuenta pasaría
-- esa condición igual que cualquier empleado real — viendo saldos, pagos y
-- quién compró, justo lo que la especificación prohíbe explícitamente.
--
-- Más grave todavía: la policy de lectura de `usuarios` es
-- `to authenticated using (auth.uid() is not null)` — CUALQUIER sesión
-- autenticada, incluyendo clientes, puede leer la tabla completa. Con la
-- columna `codigo` nueva (que es, en la práctica, la contraseña del equipo),
-- eso expondría el código de acceso de todo el equipo a cualquier cliente.
--
-- La sección 8 corrige esto: redefine `usuario_es_staff()` para exigir
-- `tipo = 'staff'`, y reemplaza esas policies puntuales para usar esa función
-- en vez del chequeo plano. No cambia nada para el equipo real (que ya tiene
-- `tipo = 'staff'` por el default de la columna nueva) — solo excluye a los
-- asesores de accesos que nunca debieron tener.
--
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Código de acceso y estado para todo el equipo (incluye asesores).
--    `usuarios.activo` YA EXISTE (boolean, nullable, default true) — el
--    IF NOT EXISTS de abajo no la toca. `usuarios.email` es NOT NULL, así que
--    las cuentas de asesor también guardan su correo sintético ahí (ver la
--    Edge Function gestionar-asesores).
-- ----------------------------------------------------------------------------

alter table usuarios
  add column if not exists codigo text unique,
  add column if not exists activo boolean not null default true,
  add column if not exists tipo text not null default 'staff';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'usuarios_tipo_check'
  ) then
    alter table usuarios
      add constraint usuarios_tipo_check
      check (tipo in ('staff', 'asesor_interno', 'asesor_externo'));
  end if;
end $$;

comment on column usuarios.codigo is 'Código numérico de 8 dígitos para entrar (equipo y asesores). Se genera en el servidor, nunca en el navegador.';
comment on column usuarios.activo is 'Si es false, se rechaza el acceso aunque el código sea correcto. Se desactiva a mano, sin fecha de vencimiento.';
comment on column usuarios.tipo is 'staff (equipo interno) | asesor_interno | asesor_externo. Ver CLAUDE.md: no confundir con la tabla asesores (catálogo público, foto/teléfono). Todo usuario existente antes de esta migración queda como staff por el default.';

create index if not exists usuarios_codigo_idx on usuarios (codigo) where activo;

-- ----------------------------------------------------------------------------
-- 1b. Funciones auxiliares de acceso (movidas aquí, antes de que la sección 3
--    las use en policies — Postgres exige que la función ya exista al crear
--    una policy que la referencia). El contenido completo del porqué de estas
--    dos funciones está documentado más abajo, donde se aplican a las policies
--    existentes que tenían el chequeo plano (antes sección 8, ahora 8c-8j).
-- ----------------------------------------------------------------------------

-- usuario_es_staff() pasa a exigir tipo = 'staff' (antes solo miraba si la fila
-- existía en usuarios, sin importar el rol — ver el hallazgo al inicio del
-- archivo). La usan directamente las policies de proyectos (crear/editar/
-- borrar); usuario_puede_ver_propiedad/usuario_puede_ver_proyecto ya filtran
-- por rol y no dependen de esta función.
create or replace function public.usuario_es_staff()
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from usuarios
    where usuarios.id = auth.uid()
      and usuarios.activo is not false
      and usuarios.tipo = 'staff'
  );
$function$;

-- Nueva función auxiliar: "está en usuarios y activo", staff O asesor. La
-- usan las policies nuevas de alcance de catálogo (sección 3) y la propia
-- pantalla del asesor para leer su fila / su rol — nunca para cartera.
create or replace function public.usuario_es_staff_o_asesor()
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from usuarios
    where usuarios.id = auth.uid()
      and usuarios.activo is not false
  );
$function$;

-- ----------------------------------------------------------------------------
-- 2. Condiciones privadas de venta: SOLO precio_minimo y la tasa sugerida.
--    `propiedades_venta.precio` YA EXISTE (numeric, columna pública real,
--    controlada en el sitio web por `mostrar_precio`) — no se duplica aquí,
--    el cotizador del asesor lo lee directo de propiedades_venta.precio.
--    precio_minimo es lo único genuinamente nuevo y privado: por eso va en
--    tabla aparte, sin ninguna policy pública, para que nunca quede alcanzable
--    por la policy abierta de propiedades_venta.
-- ----------------------------------------------------------------------------

create table if not exists propiedades_venta_condiciones (
  id uuid primary key default gen_random_uuid(),
  propiedad_venta_id uuid not null unique references propiedades_venta(id) on delete cascade,
  precio_minimo numeric,
  financiamiento_tasa_anual numeric, -- tasa sugerida para precargar el cotizador del asesor
  actualizado_en timestamptz not null default now()
);

comment on table propiedades_venta_condiciones is 'Precio mínimo de negociación por propiedad del catálogo de venta (y tasa sugerida para el cotizador). Deliberadamente separada de propiedades_venta (que tiene policy pública) para que el precio mínimo nunca sea legible por el sitio web público. Solo equipo/asesores con permiso.';

alter table propiedades_venta_condiciones enable row level security;

-- ----------------------------------------------------------------------------
-- 3. Alcance del catálogo de venta por rol (espejo de roles_propiedades /
--    roles_proyectos, pero apuntando a proyectos_venta / propiedades_venta,
--    que son un conjunto de tablas distinto de la cartera — ver la nota en
--    el commit/PR de esta migración para el porqué completo).
-- ----------------------------------------------------------------------------

alter table roles
  add column if not exists ambito_restringido_venta boolean not null default true;

comment on column roles.ambito_restringido_venta is 'Si es true, este rol solo ve las propiedades/proyectos de venta listados en roles_propiedades_venta / roles_proyectos_venta. Default true a propósito: un rol nuevo de asesor no debe ver todo el catálogo hasta que un admin se lo asigne explícitamente.';

create table if not exists roles_proyectos_venta (
  rol_id uuid not null references roles(id) on delete cascade,
  proyecto_venta_id uuid not null references proyectos_venta(id) on delete cascade,
  primary key (rol_id, proyecto_venta_id)
);

create table if not exists roles_propiedades_venta (
  rol_id uuid not null references roles(id) on delete cascade,
  propiedad_venta_id uuid not null references propiedades_venta(id) on delete cascade,
  primary key (rol_id, propiedad_venta_id)
);

alter table roles_proyectos_venta enable row level security;
alter table roles_propiedades_venta enable row level security;

create policy "admins_gestionan_roles_proyectos_venta"
  on roles_proyectos_venta for all
  to authenticated
  using (es_admin())
  with check (es_admin());

create policy "admins_gestionan_roles_propiedades_venta"
  on roles_propiedades_venta for all
  to authenticated
  using (es_admin())
  with check (es_admin());

-- Cualquier miembro de usuarios puede leer su propio alcance (lo necesita la
-- pantalla del asesor); no puede modificarlo.
create policy "equipo_lee_roles_proyectos_venta"
  on roles_proyectos_venta for select
  to authenticated
  using (usuario_es_staff_o_asesor());

create policy "equipo_lee_roles_propiedades_venta"
  on roles_propiedades_venta for select
  to authenticated
  using (usuario_es_staff_o_asesor());

-- ----------------------------------------------------------------------------
-- 4. Control de intentos fallidos de código (equipo/asesores).
-- ----------------------------------------------------------------------------

create table if not exists intentos_login (
  id bigserial primary key,
  codigo_intentado text,
  ip text,
  exito boolean not null default false,
  creado_en timestamptz not null default now()
);

create index if not exists intentos_login_idx on intentos_login (ip, creado_en desc);

comment on table intentos_login is 'Registro de intentos de login por código (equipo/asesores), usado por la Edge Function validar-codigo-acceso para bloquear tras 5 intentos fallidos en 15 minutos desde la misma IP.';

alter table intentos_login enable row level security;
-- Sin policies: solo la Edge Function (con la llave de servicio, que ignora RLS)
-- lee y escribe aquí. Nadie más, ni siquiera el equipo autenticado.

-- ----------------------------------------------------------------------------
-- 5. Rol de asesor externo / interno (permisos base; el alcance de cada
--    asesor real se define clonando este rol con SelectorAlcance en la
--    pantalla Equipo → Roles, igual que ya se hace hoy con roles de staff).
-- ----------------------------------------------------------------------------

insert into roles (nombre, es_administrador, permisos, ambito_restringido, ambito_restringido_venta)
values (
  'Asesor externo', false,
  '{"ver_propiedades_asignadas": true, "ver_precio_lista": true, "ver_precio_minimo": true, "cotizar": true, "enviar_cotizacion": true}'::jsonb,
  true, true
)
on conflict (nombre) do nothing;

insert into roles (nombre, es_administrador, permisos, ambito_restringido, ambito_restringido_venta)
values (
  'Asesor interno', false,
  '{"ver_propiedades_asignadas": true, "ver_precio_lista": true, "ver_precio_minimo": true, "cotizar": true, "enviar_cotizacion": true}'::jsonb,
  true, true
)
on conflict (nombre) do nothing;

-- ----------------------------------------------------------------------------
-- 6. RLS de propiedades_venta_condiciones: equipo interno (admin o con
--    ver_precio_lista/ver_precio_minimo) y asesores dentro de su alcance.
--    Nunca el rol anon/público — esta tabla no tiene policy para anon.
-- ----------------------------------------------------------------------------

create policy "equipo_y_asesores_leen_condiciones_en_su_alcance"
  on propiedades_venta_condiciones for select
  to authenticated
  using (
    exists (
      select 1
      from usuarios u
      join roles r on r.id = u.rol_id
      where u.id = auth.uid()
        and u.activo is not false
        and (
          r.es_administrador
          or (r.permisos ->> 'ver_precio_lista')::boolean is true
          or (r.permisos ->> 'ver_precio_minimo')::boolean is true
        )
        and (
          r.es_administrador
          or not r.ambito_restringido_venta
          or exists (
            select 1 from roles_propiedades_venta rpv
            where rpv.rol_id = r.id and rpv.propiedad_venta_id = propiedades_venta_condiciones.propiedad_venta_id
          )
          or exists (
            select 1 from roles_proyectos_venta rpjv
            join propiedades_venta pv on pv.proyecto_venta_id = rpjv.proyecto_venta_id
            where rpjv.rol_id = r.id and pv.id = propiedades_venta_condiciones.propiedad_venta_id
          )
        )
    )
  );

create policy "admins_escriben_condiciones"
  on propiedades_venta_condiciones for all
  to authenticated
  using (es_admin())
  with check (es_admin());

-- ----------------------------------------------------------------------------
-- 7. RLS de propiedades_venta: agrega lectura para asesores dentro de su
--    alcance. La policy pública existente ("Lectura pública de propiedades en
--    venta") NO se toca. La policy de escritura ("Staff administra propiedades
--    en venta") SÍ se corrige en la sección 8 — hoy es "cualquier fila en
--    usuarios", lo que dejaría a un asesor borrar/editar el catálogo entero.
-- ----------------------------------------------------------------------------

create policy "asesores_leen_propiedades_venta_en_su_alcance"
  on propiedades_venta for select
  to authenticated
  using (
    exists (
      select 1
      from usuarios u
      join roles r on r.id = u.rol_id
      where u.id = auth.uid()
        and u.activo is not false
        and (r.permisos ->> 'ver_propiedades_asignadas')::boolean is true
        and (
          r.es_administrador
          or not r.ambito_restringido_venta
          or exists (
            select 1 from roles_propiedades_venta rpv
            where rpv.rol_id = r.id and rpv.propiedad_venta_id = propiedades_venta.id
          )
          or exists (
            select 1 from roles_proyectos_venta rpjv
            where rpjv.rol_id = r.id and rpjv.proyecto_venta_id = propiedades_venta.proyecto_venta_id
          )
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 8. ENDURECER ACCESO: cerrar las policies existentes que hoy dan acceso a
--    "cualquier fila en usuarios" sin mirar el rol. Ver el hallazgo al inicio
--    del archivo. Nada de esto cambia el comportamiento para el equipo real
--    (tipo='staff' por default) — solo excluye a los nuevos asesores.
--    Las funciones usuario_es_staff() / usuario_es_staff_o_asesor() que usa
--    esta sección ya se crearon arriba, en 1b (antes de que la sección 3 las
--    necesitara).
-- ----------------------------------------------------------------------------

-- 8c. usuarios: nadie más que el propio equipo (tipo='staff') puede listar a
-- todo el mundo; cualquier fila de usuarios puede seguir leyendo SU PROPIA
-- fila (lo necesita el login para resolver perfil.usuario). Antes decía
-- "auth.uid() is not null" — cualquier cliente autenticado podía leer la
-- tabla completa, columna `codigo` incluida.
drop policy if exists "Staff puede ver usuarios" on usuarios;
create policy "Staff puede ver usuarios"
  on usuarios for select
  to authenticated
  using (usuario_es_staff() or id = auth.uid());

-- 8d. clientes: antes "cualquier fila en usuarios". Ahora solo staff real.
drop policy if exists "Staff administra clientes" on clientes;
create policy "Staff administra clientes"
  on clientes for all
  to authenticated
  using (usuario_es_staff())
  with check (usuario_es_staff());

-- 8e. cargos_luz: mismo cambio, preservando el acceso propio del cliente
-- (las otras dos condiciones del OR no se tocan).
drop policy if exists "Acceso a cargos de luz por propiedad" on cargos_luz;
create policy "Acceso a cargos de luz por propiedad"
  on cargos_luz for all
  to authenticated
  using (
    usuario_es_staff()
    or exists (select 1 from propiedades where propiedades.id = cargos_luz.propiedad_id and propiedades.cliente_user_id = auth.uid())
    or exists (select 1 from propiedades_clientes pc join clientes c on c.id = pc.cliente_id where pc.propiedad_id = cargos_luz.propiedad_id and c.cliente_user_id = auth.uid())
  );

-- 8f. documentos: mismo patrón que cargos_luz.
drop policy if exists "Acceso a documentos por propiedad" on documentos;
create policy "Acceso a documentos por propiedad"
  on documentos for all
  to authenticated
  using (
    usuario_es_staff()
    or exists (select 1 from propiedades where propiedades.id = documentos.propiedad_id and propiedades.cliente_user_id = auth.uid())
    or exists (select 1 from propiedades_clientes pc join clientes c on c.id = pc.cliente_id where pc.propiedad_id = documentos.propiedad_id and c.cliente_user_id = auth.uid())
  );

-- 8g. notificaciones: mismo patrón.
drop policy if exists "Acceso a notificaciones por propiedad" on notificaciones;
create policy "Acceso a notificaciones por propiedad"
  on notificaciones for all
  to authenticated
  using (
    usuario_es_staff()
    or exists (select 1 from propiedades where propiedades.id = notificaciones.propiedad_id and propiedades.cliente_user_id = auth.uid())
    or exists (select 1 from propiedades_clientes pc join clientes c on c.id = pc.cliente_id where pc.propiedad_id = notificaciones.propiedad_id and c.cliente_user_id = auth.uid())
  );

-- 8h. comprobantes: solo la inserción por parte de staff usaba el chequeo
-- plano (la lectura y la aprobación ya usan usuario_puede_ver_propiedad, que
-- sí filtra por rol correctamente — no se tocan).
drop policy if exists "Staff puede insertar comprobantes" on comprobantes;
create policy "Staff puede insertar comprobantes"
  on comprobantes for insert
  to authenticated
  with check (usuario_es_staff());

-- 8i. cuotas: insertar y borrar usaban el chequeo plano (ver/actualizar ya
-- usan usuario_puede_ver_propiedad correctamente).
drop policy if exists "Staff puede insertar cuotas" on cuotas;
create policy "Staff puede insertar cuotas"
  on cuotas for insert
  to authenticated
  with check (usuario_es_staff());

drop policy if exists "Staff puede borrar cuotas" on cuotas;
create policy "Staff puede borrar cuotas"
  on cuotas for delete
  to authenticated
  using (usuario_es_staff());

-- 8j. propiedades_venta / fotos_propiedad_venta: un asesor solo debe VER su
-- catálogo asignado (sección 7), nunca editar o borrar el catálogo completo.
drop policy if exists "Staff administra propiedades en venta" on propiedades_venta;
create policy "Staff administra propiedades en venta"
  on propiedades_venta for all
  to authenticated
  using (usuario_es_staff())
  with check (usuario_es_staff());

drop policy if exists "Staff administra fotos de venta" on fotos_propiedad_venta;
create policy "Staff administra fotos de venta"
  on fotos_propiedad_venta for all
  to authenticated
  using (usuario_es_staff())
  with check (usuario_es_staff());

commit;

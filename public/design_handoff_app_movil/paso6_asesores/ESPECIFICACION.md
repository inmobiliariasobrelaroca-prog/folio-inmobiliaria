# Asesores con código y permisos por propiedad

Especificación para implementar en `inmobiliariasobrelaroca-prog/folio-inmobiliaria`,
rama `pwa-movil`. Escrita a partir del código real (`src/App.tsx`) y del esquema
existente en Supabase.

## Decisiones tomadas por el dueño

- **Todos entran con código**, incluidos administradores. No con correo y contraseña.
- Un asesor externo puede: ver las propiedades que le asignaron, ver el precio de lista,
  ver el precio mínimo de negociación, cotizar sobre esas propiedades y enviar la
  cotización por WhatsApp.
- Un asesor externo **no** ve saldos ni pagos de clientes, ni quién compró.
- La diferencia entre asesor interno y externo es solo de permisos; el interno tendrá
  más opciones y se le irán agregando funciones con el tiempo.
- Los códigos se desactivan a mano, sin fecha de vencimiento.
- Entre 5 y 20 asesores externos.

## No reinventar lo que ya existe

El repositorio YA tiene el sistema de permisos completo. Úsalo, no crees uno paralelo.

| Tabla | Para qué sirve ya |
| --- | --- |
| `usuarios` | Personas del equipo. Se lee en `src/App.tsx:1014` con `select("*, roles(*)")` |
| `roles` | Lleva `nombre`, `es_administrador` y `permisos` (JSON de claves) |
| `roles_proyectos` | Limita un rol a ciertos proyectos |
| `roles_propiedades` | Limita un rol a ciertas propiedades |

Cómo se consultan hoy los permisos (`src/App.tsx:1092-1093`):

    const esAdmin = perfil.tipo === "staff" && !!perfil.usuario?.roles?.es_administrador;
    const puede = (clave) => esAdmin || !!perfil.usuario?.roles?.permisos?.[clave];

Un asesor externo es simplemente **un usuario con un rol restringido**. Nada más.

**Ojo con la palabra "asesor".** La tabla `asesores` es otra cosa: guarda foto, teléfono
y datos para el catálogo público de ventas. No es una tabla de acceso. Si un asesor
necesita ambas cosas, enlaza `usuarios.asesor_id → asesores.id`, pero no las fusiones.

## Cambios de base de datos

Verifica los nombres de columna reales antes de ejecutar; esto se escribió leyendo
el uso en el código, no el esquema directamente.

    -- 1. Código de acceso para el equipo
    alter table usuarios
      add column if not exists codigo text unique,
      add column if not exists activo boolean not null default true,
      add column if not exists tipo text not null default 'staff';
      -- tipo: 'staff' | 'asesor_interno' | 'asesor_externo'

    create index if not exists usuarios_codigo_idx on usuarios (codigo) where activo;

    -- 2. Precio mínimo de negociación (no existe hoy)
    alter table propiedades_venta
      add column if not exists precio_minimo numeric;

    -- 3. Control de intentos fallidos
    create table if not exists intentos_login (
      id bigserial primary key,
      codigo_intentado text,
      ip text,
      exito boolean not null default false,
      creado_en timestamptz not null default now()
    );
    create index if not exists intentos_login_idx on intentos_login (ip, creado_en desc);

    -- 4. Rol de asesor externo
    insert into roles (nombre, es_administrador, permisos)
    values (
      'Asesor externo',
      false,
      '{
        "ver_propiedades_asignadas": true,
        "ver_precio_lista": true,
        "ver_precio_minimo": true,
        "cotizar": true,
        "enviar_cotizacion": true
      }'::jsonb
    )
    on conflict do nothing;

Después, en la app, asigna el alcance con `roles_propiedades` o `roles_proyectos`
usando la pantalla que ya existe (`SelectorAlcance`, `src/App.tsx:1680`).

**Rol de asesor interno**: mismo procedimiento, con las claves que se decidan.
Empieza copiando las del externo y agrega según haga falta.

## Longitud de los códigos

- Clientes: **6 dígitos** (como hoy).
- Equipo y asesores: **8 dígitos**. Un código de 6 dígitos para alguien que registra
  pagos y asigna roles es adivinable: un millón de combinaciones.

Genera los códigos en el servidor, nunca en el navegador. Ya existe el patrón:
la función `cliente-cambiar-codigo` se invoca desde `llamarFuncionSesion`
(`src/App.tsx:853` y `src/App.tsx:346`).

## Autenticación

El login de cliente ya convierte el código en un correo sintético
(`src/App.tsx:909-918`):

    const emailSintetico = \`cliente\${codigoLimpio}@cliente.folio\`;

Replica el mismo mecanismo para el equipo con su propio dominio, por ejemplo
`u<codigo>@equipo.folio`, para que no colisionen con los de cliente.

Requisitos:

1. La validación del código y el conteo de intentos van en una **Edge Function**,
   no en el cliente. Bloquea tras 5 intentos fallidos desde la misma IP en 15 minutos.
2. Si `usuarios.activo` es false, se rechaza el acceso aunque el código sea correcto.
3. Al desactivar un usuario, cierra también su sesión activa en Supabase Auth.
4. El código nunca debe viajar en la URL ni quedar en el historial del navegador.

## Cambios de interfaz

### Login (`src/App.tsx:891`, componente `Login`)

Tres opciones en vez de dos: **Cliente · Inmobiliaria · Asesor**.
Si "Soy inmobiliaria" no cabe en pantallas angostas, acorta las tres etiquetas
a "Cliente", "Inmobiliaria" y "Asesor".

Las tres piden código. Cambian el largo del campo (6 u 8 dígitos) y el dominio
del correo sintético.

### Pantalla del asesor

Al entrar, el asesor ve solo:

1. **Sus propiedades asignadas** — las que le permitan `roles_propiedades` /
   `roles_proyectos`. Con foto, nombre, precio de lista y precio mínimo.
2. **Cotizador** — precargado con la propiedad elegida: precio, enganche sugerido,
   tasa y plazo vienen de la propiedad, no se escriben a mano.
3. **Enviar por WhatsApp** y **PDF** — ya implementados en `public/cotizador.html`;
   esa página es la referencia de diseño y de cálculo.

No ve: cartera, cobros, saldos, comprobantes, roles ni la pantalla de equipo.

### Reglas del cálculo (ya resueltas, respétalas)

- Sistemas: `nivelada` y `saldos`, con las fórmulas de `pagoMensual` y
  `generarTabla` (`src/App.tsx:43-90`).
- La mora es un **monto fijo por día** con días de gracia, no un porcentaje.
- El cargo de luz mensual va **siempre separado** de la cuota del crédito:
  cuota, luz y total mensual como tres líneas distintas. Nunca sumar la luz
  dentro de la cuota en un lugar y fuera en otro.
- Montos con separador de miles y dos decimales, locale `es-GT`.
- La cotización impresa muestra los primeros 24 meses aunque el plazo sea mayor.

## RLS

Las 19 tablas ya tienen RLS activado y ninguna política abierta sobre datos
sensibles (auditado el 2026-08-10). Al agregar el rol de asesor, revisa que las
políticas de `propiedades_venta` y `fotos_propiedad_venta` sigan permitiendo
lectura pública del catálogo, y que `cuotas`, `comprobantes` y `clientes`
**no** se abran al nuevo rol.

Añade una política para que un asesor solo lea las propiedades dentro de su alcance,
resolviendo contra `roles_propiedades` y `roles_proyectos` a partir de `auth.uid()`.

## Orden sugerido

1. Migración de base de datos y rol de asesor externo.
2. Edge Function de validación de código con límite de intentos.
3. Login de tres opciones.
4. Pantalla del asesor con sus propiedades.
5. Cotizador integrado, precargado desde la propiedad.
6. Migrar al equipo de contraseña a código, al final y con aviso previo,
   para no dejar a nadie fuera durante la transición.

## Contexto del proyecto

- Rama de trabajo: `pwa-movil`. `main` sirve a clientes reales; no tocar sin aviso.
- Ya instalado en esa rama: PWA (`public/manifest.webmanifest`, `public/sw.js`,
  `public/icons/`), `src/pwa.ts`, `src/movil.css` y `public/cotizador.html`.
- `src/App.tsx` son 255 KB en un solo archivo. Si vas a partirlo en módulos,
  hazlo en un commit aparte del cambio funcional.

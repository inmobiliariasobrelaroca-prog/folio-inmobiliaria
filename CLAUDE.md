# Sobre la Roca · folio-inmobiliaria

App de ventas y pagos de una inmobiliaria en Guatemala. Vite + React 17 +
TypeScript + Supabase. En proceso de convertirse en PWA móvil.

## Ramas

- `main` — **producción, con clientes reales usándola.** No tocar sin aviso explícito.
- `pwa-movil` — rama de trabajo. Todo lo nuevo va aquí.

## Estructura

`src/App.tsx` son 255 KB en un solo archivo (~5,000 líneas): login, proyectos,
propiedades, cuotas, cobros, roles, catálogo de ventas y generación de PDF.
Si lo partes en módulos, hazlo en un commit aparte del cambio funcional.

Otros archivos: `src/supabaseClient.js`, `src/pwa.ts` (service worker),
`src/movil.css` (ajustes para pantallas <640px), `public/cotizador.html`
(cotizador independiente), `public/sw.js`, `public/manifest.webmanifest`.

## Reglas de negocio

- Amortización: `nivelada` (cuota fija) y `saldos` (capital fijo, cuota decreciente).
  Fórmulas en `pagoMensual` y `generarTabla`, `src/App.tsx:43-90`. No las reescribas.
- **La mora es un monto fijo por día**, con días de gracia. Por defecto Q100 y 3 días.
  No es un porcentaje.
- Algunas propiedades llevan un **cargo de luz mensual** aparte de la cuota
  (`aplica_luz`, `monto_luz_mensual`, con su propia mora y días de gracia).
- La luz va **siempre separada** de la cuota del crédito: cuota, luz y total mensual
  como tres líneas distintas. En pantalla, en WhatsApp y en el PDF. Nunca sumarla
  dentro de la cuota en un lugar y fuera en otro.
- Montos con separador de miles y dos decimales, locale `es-GT`.
- Las cotizaciones impresas muestran los primeros 24 meses aunque el plazo sea mayor.

## Acceso

- **Clientes**: código numérico de 6 dígitos. Se convierte en correo sintético
  `cliente<codigo>@cliente.folio` y por debajo usa Supabase Auth (`src/App.tsx:909`).
- **Equipo**: hoy correo y contraseña. Se va a migrar a código de 8 dígitos.
- **Asesores**: pendiente. Ver la especificación de asesores.
- Permisos: `usuarios` → `roles` (`permisos` JSON + `es_administrador`),
  con alcance en `roles_proyectos` y `roles_propiedades`.
  Se consultan con `perfil.usuario?.roles?.permisos?.[clave]` (`src/App.tsx:1093`).
- Los códigos se generan y validan **en el servidor**, nunca en el navegador.
  Ya existe el patrón: Edge Function `cliente-cambiar-codigo`.

## Cuidado con la palabra "asesor"

La tabla `asesores` guarda foto y teléfono para el **catálogo público**.
No es una tabla de acceso. Quien entra a la app va en `usuarios` con su rol.
Si alguien necesita ambas cosas, enlázalas; no las fusiones.

## Seguridad

- Las 19 tablas tienen RLS activado (auditado 2026-08-10). Ninguna política abierta
  sobre datos sensibles. Las únicas permisivas son las del catálogo público
  (`proyectos_venta`, `propiedades_venta`, `fotos_propiedad_venta`, `asesores`)
  y los dos formularios de contacto.
- El repo es público y la llave `anon` está en `src/supabaseClient.js`.
  Es aceptable — esa llave es pública por diseño — pero nunca pongas ahí una
  llave de servicio.

## Estilo

Azul noche `#101826`, panel `#0C121C`, tarjeta `#161F2E`, oro `#C9A227`,
borde `#2A3547`, texto `#EDE7D9`, texto suave `#8A93A3`.
Tailwind, `font-serif` en titulares y cifras, `font-mono` en montos.
En móvil: 44px mínimo de altura táctil, 16px en campos de texto.

## Service worker

`public/sw.js` cachea el shell pero **nunca** las llamadas a Supabase.
Al modificarlo, sube el número de `VERSION` o los teléfonos se quedan con
la versión anterior.

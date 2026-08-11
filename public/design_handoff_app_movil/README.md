# Sobre la Roca · app móvil — paquete de entrega

Todo lo hecho hasta ahora y lo que falta, para continuar con Claude Code sobre
`inmobiliariasobrelaroca-prog/folio-inmobiliaria`, rama **`pwa-movil`**.

## Empieza aquí

1. Pon `CLAUDE_repo.md` en la raíz del repositorio, renombrado a `CLAUDE.md`.
   Le da a Claude Code el contexto permanente del proyecto.
2. Lee `paso6_asesores/ESPECIFICACION.md`. Es el trabajo pendiente.
3. Los prototipos de `diseño/` son **referencias visuales**, no código para copiar.

## Estado

| | Qué es | Estado |
| --- | --- | --- |
| Paso 1 | PWA instalable en iOS y Android | Hecho, en `pwa-movil` |
| Paso 2 | Despliegue por rama en Vercel | Hecho |
| Paso 3A | Capa de estilos móvil | Hecho, en `pwa-movil` |
| Paso 4 | Auditoría de RLS | Hecho, sin hallazgos |
| Paso 5 | Cotizador (`/cotizador.html`) | Hecho, en `pwa-movil` |
| Paso 6 | Asesores con código y permisos | **Pendiente** |
| Paso 3B | Barra de pestañas y flujos móviles reales | Pendiente |

**`main` sirve a clientes reales.** Nada de lo anterior se ha publicado a producción;
todo vive en `pwa-movil`. Publicar es cambiar la rama de producción en Vercel, y es
decisión del dueño.

## Qué hay en cada carpeta

| Carpeta | Contenido |
| --- | --- |
| `paso6_asesores/` | **La especificación del trabajo pendiente.** SQL, permisos, autenticación, pantallas |
| `paso5_cotizador/` | `cotizador.html` ya funcionando. Referencia de cálculo y diseño |
| `paso3_movil/` | `movil.css` y el `sw.js` corregido (v2) |
| `paso1_pwa/` | Manifest, service worker, iconos, `pwa.ts` |
| `diseño/` | Prototipos en HTML de la app completa (cliente y equipo) |
| `github.md` | Modelo de datos de Supabase y mapa de pantallas |
| `GUIA_PWA.md` | Cómo se hizo la conversión a PWA. Histórico |

## Fidelidad de los prototipos

**Alta.** Colores, tipografías y medidas son finales y están documentados abajo.
Los marcadores de foto (rayas diagonales a 135°) sí son provisionales: ahí van las
fotos reales de `propiedades_venta` y `fotos_propiedad_venta`.

Los prototipos usan un runtime propio (`support.js`, `<x-dc>`, `<sc-for>`).
No lo lleves al repositorio: ábrelos en el navegador para ver el comportamiento
buscado y reconstrúyelo en React con los patrones que ya usa `App.tsx`.

Nota: los prototipos se hicieron antes de leer el código real, así que traen datos
de ejemplo que no coinciden con la realidad ("La Esperanza", login con correo para
clientes). Los proyectos reales son **Diagonal Lucas T Cojulum · La Esperanza**,
**Las Luces** y **Los Eucaliptos**, y los clientes entran con código de 6 dígitos.
Manda el código real, no el prototipo.

## Design tokens

Los que ya usa la app en producción, extraídos de `App.tsx`.

| Token | Valor | Uso |
| --- | --- | --- |
| Fondo | `#101826` | Fondo general |
| Fondo panel | `#0C121C` | Cabecera, campos |
| Tarjeta | `#161F2E` | Formularios y tarjetas |
| Texto | `#EDE7D9` | Texto principal |
| Texto suave | `#8A93A3` | Etiquetas, secundario |
| Acento | `#C9A227` | Botones primarios, cifras, activo |
| Texto sobre acento | `#101826` | Encima del oro |
| Borde | `#2A3547` | Bordes y separadores, 1px |
| Alerta | rojo 400/800 de Tailwind | Mora y vencidos |

Tipografía: `font-serif` para titulares y cifras grandes, `font-sans` para el cuerpo,
`font-mono` para montos. Radio de esquina 4-8px (`rounded-md`, `rounded-lg`);
los segmentados usan `rounded-full`.

Mínimos en móvil: 44px de alto para cualquier cosa que se toque, 16px en los campos
de texto (menos de eso hace que el teléfono acerque la pantalla).

## Reglas de negocio que no se negocian

- Sistemas de amortización: `nivelada` y `saldos`. Fórmulas en `src/App.tsx:43-90`.
- La mora es un **monto fijo por día** con días de gracia. No es un porcentaje.
- El cargo de luz mensual va **siempre aparte** de la cuota: cuota, luz y total mensual
  como tres líneas distintas, en pantalla, en WhatsApp y en el PDF.
- Montos con separador de miles y dos decimales, locale `es-GT`.
- La cotización impresa muestra los primeros 24 meses aunque el plazo sea mayor.

## Advertencias

- `src/App.tsx` son 255 KB en un solo archivo. Si lo partes en módulos, hazlo en un
  commit separado del cambio funcional.
- Las llaves de Supabase están escritas como valor por defecto en
  `src/supabaseClient.js` y el repo es público. Es aceptable porque la llave `anon`
  es pública por diseño y RLS está activo en las 19 tablas, pero no agregues ahí
  ninguna llave de servicio.
- El service worker cachea el shell pero **nunca** las llamadas a Supabase.
  Al cambiar `public/sw.js`, sube el número de `VERSION` o los teléfonos se
  quedan con la versión vieja.

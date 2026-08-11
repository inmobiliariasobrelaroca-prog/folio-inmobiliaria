repo: inmobiliariasobrelaroca-prog/folio-inmobiliaria
branch: main
path: src

## Last sync

date: 2026-08-10T18:43:06Z

### Updated in this project

- Conectado el repo de pagos (folio-inmobiliaria): leído el modelo de datos de Supabase y el motor de amortización.
- El cotizador ahora usa el mismo cálculo que la app (`pagoMensual`) y los dos sistemas reales: nivelada y sobre saldos.
- Añadidos al cotizador los campos que sí existen en la base: días de gracia, mora diaria en quetzales y luz mensual.
- La app móvil quedó en la variante 1b (azul noche y oro); acceso del equipo por código de vendedor.

## Otros repos

- `inmobiliariasobrelaroca-prog/sobrelaroca-ventas` (rama main) — sitio público de ventas; de ahí salieron el logo y las fotos de asesores en `fotos/`.

## Modelo de datos (Supabase)

Proyecto `knquysqjhprnyztkgmwb`. Tablas leídas en `src/App.tsx`:

| Tabla | Uso en la app móvil |
| --- | --- |
| `proyectos`, `propiedades` | Inicio, Propiedad, Cartera |
| `cuotas` | Mi casa, Pagos, tabla de amortización |
| `comprobantes` (+ storage `comprobantes`) | Pagos, Cobrar |
| `cargos_luz` | Cargo mensual de luz |
| `clientes`, `propiedades_clientes` | Cartera, titular del contrato |
| `asesores`, `contactos_asesor` | Pantalla Asesor |
| `proyectos_venta`, `propiedades_venta`, `fotos_propiedad_venta` | Fotos reales de propiedades |
| `usuarios`, `roles`, `roles_proyectos`, `roles_propiedades` | Permisos del equipo |
| `notificaciones`, `documentos` | Pendientes de diseñar |

Campos de condiciones en `propiedades`: `precio`, `enganche`, `tasa_anual`, `plazo_anios`,
`sistema_amortizacion` (`nivelada` | `saldos`), `dias_gracia`, `mora_diaria`,
`aplica_luz`, `monto_luz_mensual`, `dias_gracia_luz`, `mora_diaria_luz`.
La mora es un monto fijo por día (por defecto Q100), no un porcentaje.

## Screen map

| Pantalla | Archivos del repo |
| --- | --- |
| Cotizador | src/App.tsx — `generarTabla`, `pagoMensual` (líneas 43-90) |
| Cotización PDF | src/App.tsx — resumen de condiciones (líneas 376-382) |
| Mi casa · Pagos | src/App.tsx — `cuotas`, `comprobantes` (líneas 540-600, 1147-1175) |
| Cartera | src/App.tsx — `clientes`, `propiedades_clientes` (líneas 4219-4246) |
| Asesor | sobrelaroca-ventas · index.html + tabla `asesores` |
| Inicio · Propiedad | sobrelaroca-ventas · index.html + `propiedades_venta` |

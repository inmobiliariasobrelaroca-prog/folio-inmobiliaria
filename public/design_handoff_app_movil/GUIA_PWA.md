# Guía: convertir folio-inmobiliaria en PWA instalable

Repositorio: `inmobiliariasobrelaroca-prog/folio-inmobiliaria` (Vite + React + TS + Supabase).
Tiempo estimado: 1 a 2 semanas de trabajo. Costo: cero.

## Paso 1 — Instalar el plugin de PWA

```bash
npm install -D vite-plugin-pwa
```

En `vite.config.ts`, añade el plugin con `registerType: 'autoUpdate'` y el manifest:

- `name`: Sobre la Roca
- `short_name`: Sobre la Roca
- `theme_color` y `background_color`: `#101826`
- `display`: `standalone`
- `orientation`: `portrait`
- `lang`: `es-GT`
- `icons`: 192×192, 512×512 y una versión `maskable`

## Paso 2 — Iconos y meta tags

Genera los iconos desde el logo (fondo `#101826`, logo centrado con 20% de margen).
En `index.html` añade `<meta name="theme-color" content="#101826">` y
`<meta name="apple-mobile-web-app-capable" content="yes">`.

## Paso 3 — Adaptar la interfaz a móvil

Aquí entra el diseño de este paquete. Lo importante:

- Todo el layout a una sola columna, ancho máximo 402px centrado en pantallas grandes.
- Barra de pestañas inferior fija, respetando `env(safe-area-inset-bottom)` en iOS.
- Cabecera fija respetando `env(safe-area-inset-top)`.
- Nada por debajo de 44px de altura táctil.
- Aplica los tokens del README (azul noche + oro, Cormorant + Work Sans).

## Paso 4 — Autoalojar las fuentes

Descarga Cormorant Garamond y Work Sans a `public/fonts/` y declara `@font-face` con
`font-display: swap`. Una PWA offline no puede depender de Google Fonts.

## Paso 5 — Login por código de vendedor

El código de 4 dígitos se valida **en el servidor**, no en el cliente. Opciones:
una Edge Function de Supabase que reciba el código y devuelva un JWT, o una tabla `usuarios`
con el código hasheado y RLS. Nunca dejes el mapa de códigos en el bundle.

## Paso 6 — Cámara para comprobantes

`<input type="file" accept="image/*" capture="environment">` funciona en iOS y Android sin
plugins. Comprime la imagen en el cliente antes de subirla al storage `comprobantes`.

## Paso 7 — Notificaciones de vencimiento

1. Genera claves VAPID.
2. En el Service Worker, maneja `push` y `notificationclick`.
3. Guarda las suscripciones en una tabla nueva de Supabase.
4. Una Edge Function programada revisa `cuotas` cada día y envía el aviso N días antes del vencimiento.

**Importante en iOS**: las notificaciones solo llegan si el usuario instaló la PWA desde
"Agregar a pantalla de inicio". Desde Safari sin instalar, no funcionan. Añade en la app un
aviso que explique cómo instalarla.

## Paso 8 — Publicar y enseñar a instalar

Despliega en Vercel o Netlify (HTTPS obligatorio). Después:

- **Android/Chrome**: aparece solo el aviso "Instalar aplicación".
- **iOS/Safari**: Compartir → "Agregar a pantalla de inicio". No hay aviso automático.

Haz una tarjeta de instrucciones con capturas y mándala por WhatsApp a clientes y vendedores.
Es el paso que más se cae en la práctica.

## Si después quieres estar en las tiendas

```bash
npm install @capacitor/core @capacitor/cli
npx cap init && npx cap add ios && npx cap add android
```

Capacitor envuelve el mismo código web. Necesitas cuenta de Apple (USD 99/año),
cuenta de Google Play (USD 25 una vez) y una Mac para compilar iOS.
El diseño y el código no cambian.

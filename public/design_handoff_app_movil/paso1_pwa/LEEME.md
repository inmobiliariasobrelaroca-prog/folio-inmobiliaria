# Paso 1 — Hacer la app instalable

Sin instalar dependencias. Tu repo usa Vite 2 y React 17, asi que el plugin moderno de PWA
no sirve; estos cuatro archivos hacen lo mismo a mano.

Rama de trabajo, antes de empezar:

    git checkout -b pwa-movil

## Que copiar y donde

| Archivo de esta carpeta | Va en el repo |
| --- | --- |
| `public/manifest.webmanifest` | `public/manifest.webmanifest` (nuevo) |
| `public/sw.js` | `public/sw.js` (nuevo) |
| `public/icons/` (5 imagenes) | `public/icons/` (nueva carpeta) |
| `src/pwa.ts` | `src/pwa.ts` (nuevo) |
| `index.html` | **reemplaza** el `index.html` de la raiz |
| `src/main.tsx` | **reemplaza** el `src/main.tsx` |

Si tu repo no tiene carpeta `public/` en la raiz, creala. Vite 2 sirve su contenido
directamente desde `/`.

## Que cambia en cada archivo que se reemplaza

**index.html** — se le agrega el manifest, el color de tema `#101826`, los iconos,
los meta tags de iOS, `lang="es-GT"`, el titulo real y `viewport-fit=cover`
(necesario para respetar el notch del iPhone). El `<div id="root">` y el script
no se tocan.

**src/main.tsx** — solo dos lineas nuevas: el import de `./pwa` y la llamada
`registrarSW()` al final. Nada mas.

## Probar

    npm run build
    npm run preview

El Service Worker solo se registra en produccion, asi que en `npm run dev` no veras nada.
Con `preview` corriendo, abre Chrome → F12 → pestaña Application:

- **Manifest**: debe mostrar "Sobre la Roca" y los tres iconos sin errores.
- **Service Workers**: debe decir "activated and is running".

En la barra de direcciones de Chrome aparecera el icono de instalar.

## Probar en el telefono

`localhost` no sirve; el telefono necesita HTTPS. Despliega la rama en Vercel o Netlify
(los dos leen el repo de GitHub y dan una URL de prueba gratis por rama) y abrela en el telefono.

- **Android/Chrome**: sale el aviso "Instalar aplicacion".
- **iPhone/Safari**: Compartir → "Agregar a pantalla de inicio". No hay aviso automatico.

Al abrirla desde la pantalla de inicio no debe verse la barra del navegador. Si se ve,
el manifest no cargo.

## Ojo

- Los iconos se generaron desde `fotos/logo.png` sobre el fondo `#101826`. El maskable
  lleva el logo al 60% para que Android pueda recortarlo en circulo sin cortar la luna.
- El Service Worker **no cachea las llamadas a Supabase**. El saldo y los pagos siempre
  se piden a la red. Eso es a proposito: mostrar un saldo viejo seria peor que no mostrar nada.
- Cuando cambies el Service Worker en el futuro, sube el numero de `VERSION` en `sw.js`.
  Si no, los telefonos siguen con el viejo.

## Cuando esto funcione

Paso 2: adaptar la interfaz a una columna con la barra de pestañas inferior,
los tokens de marca y las areas seguras del iPhone. Ahi entra el diseño de `../diseño/`.

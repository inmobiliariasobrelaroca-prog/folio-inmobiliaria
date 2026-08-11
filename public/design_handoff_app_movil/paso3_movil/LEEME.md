# Paso 3A — Capa de estilos movil

Un archivo nuevo. No se toca `App.tsx`.

## Que arregla

1. La cabecera dejaba de caber: el titulo partia en tres lineas, el icono de recargar
   se encimaba con la palabra "Roca" y los iconos de la derecha se salian de la pantalla.
   Ahora el logo es mas chico, el subtitulo "CONTROL FINANCIERO" se oculta en telefono
   y los iconos bajan a un segundo renglon.
2. `GTQ 996,712.61` se salia de su tarjeta y tocaba la de al lado. Las rejillas de
   tres tarjetas pasan a una sola columna.
3. Los nombres de proyecto se cortaban ("Diagonal Lucas ..."). Ahora se parten en dos lineas.
4. Los campos de texto ya no hacen zoom al tocarlos.
5. Los botones con texto miden al menos 44px de alto.

## Que NO hace

No agrega la barra de pestañas inferior, no separa el flujo de cliente del de vendedor
y no reordena pantallas. Eso es el Paso 3B, con Claude Code.

## Como instalarlo

**1. Sube el archivo**

En github.com, rama `pwa-movil`, entra a la carpeta `src` →
`Add file` → `Upload files` → arrastra `movil.css` → Commit.

**2. Conectalo**

Abre `src/main.tsx`, icono de lapiz, y agrega **una linea** debajo del import de index.css:

    import './index.css';
    import './movil.css';      <-- esta

Queda asi:

    import React from 'react';
    import ReactDOM from 'react-dom';
    import App from './App';
    import './index.css';
    import './movil.css';
    import { registrarSW } from './pwa';

    ReactDOM.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
      document.getElementById('root')
    );

    registrarSW();

Commit. Vercel reconstruye solo en un par de minutos.

**3. Pruebalo**

Abre la app en el telefono y **recarga a fondo**: el Service Worker guarda la version
anterior, asi que si no ves cambios, cierra la app por completo y vuelve a abrirla,
o desinstalala y reinstalala.

## Si algo se ve mal

El cambio mas agresivo es el numero 4 (nombres completos). Si en alguna pantalla eso
descuadra algo, borra ese bloque del archivo y sube el resto. Cada bloque es independiente.

Y si algo sale muy mal: la rama `main` no se toco. Tus clientes siguen viendo la version
de siempre.

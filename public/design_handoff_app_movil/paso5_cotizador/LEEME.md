# Paso 5 — Cotizador para vendedores

Pagina independiente. **No toca `App.tsx`.**

## Que hace

- Precio, enganche, tasa, plazo, dias de gracia, mora diaria y luz mensual.
- Los dos sistemas reales: cuota nivelada y sobre saldos.
- Usa las mismas formulas que `src/App.tsx` (`pagoMensual`, `generarTabla`).
- **Enviar por WhatsApp**: arma el mensaje con el resumen y abre el chat del cliente.
  Si el numero trae 8 digitos le pone el 502 solo.
- **Imprimir o guardar PDF**: hoja con el logo, las condiciones y la tabla de
  amortizacion de los primeros 24 meses.
- Guarda lo ultimo que escribiste, asi que si cierras la pagina no pierdes la cotizacion.
- Funciona sin conexion una vez cargada.

## Como instalarlo

En github.com, rama `pwa-movil`, entra a la carpeta `public` →
`Add file` → `Upload files` → arrastra `cotizador.html` → Commit.

Nada mas. No hay que editar ningun otro archivo.

## Como se usa

Queda en:

    tu-url.vercel.app/cotizador.html

Manda ese link a los vendedores por WhatsApp. Que lo abran en Chrome y lo agreguen
a su pantalla de inicio: les queda como un acceso directo al cotizador.

## Lo que debes saber

- La pagina **no pide contraseña**. Cualquiera con el link puede cotizar.
  No expone datos de clientes ni toca la base: solo hace cuentas con lo que
  el vendedor escribe. Si quieres que quede detras del login, eso ya requiere
  meterla dentro de `App.tsx` (Paso 3B, con Claude Code).
- La propiedad se escribe a mano. Para elegirla de una lista habria que
  consultar la base, lo que implica autenticacion.
- Las cotizaciones **no se guardan** en Supabase. Cada vendedor conserva
  la ultima en su propio telefono.

## Siguiente

Cuando esto se integre a la app de verdad, gana tres cosas: elegir la propiedad
de la lista real, guardar la cotizacion en la base y ver las cotizaciones enviadas.

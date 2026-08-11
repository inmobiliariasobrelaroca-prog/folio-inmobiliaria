// Registra el Service Worker. Solo en produccion.
export function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('No se pudo registrar el service worker', err);
    });
  });
}

// Detecta si la app ya esta instalada en la pantalla de inicio.
export function estaInstalada(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
}

// Detecta iOS, para mostrar las instrucciones correctas de instalacion.
export function esIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

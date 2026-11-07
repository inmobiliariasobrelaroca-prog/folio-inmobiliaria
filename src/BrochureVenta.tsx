// ============================================================
// Brochure para redes — arma la imagen y el texto de un post a partir de
// la propiedad que ya está cargada en el sistema.
//
// Dos decisiones que vale la pena dejar escritas:
//
// 1. La imagen se dibuja en un <canvas> con la FOTO REAL de la casa. No se
//    genera ninguna imagen artificial: en bienes raíces una foto inventada
//    se nota cuando el cliente llega, y eso cuesta la venta y la confianza.
//
// 2. El precio sale únicamente si la propiedad tiene "Mostrar precio"
//    encendido, el mismo interruptor que manda en el sitio público. No hay
//    un segundo switch aquí a propósito: dos lugares para decidir lo mismo
//    terminan contradiciéndose, y el que se equivoca sale publicado.
//
// Los textos se arman con plantillas sobre los datos reales. Son fijas y
// gratis, y nunca inventan una característica que la casa no tiene.
// ============================================================
import React, { useState, useEffect, useRef } from "react";
import { X, Download, Share2, Copy, Check, Image as IconoImagen } from "lucide-react";
import logoEmblema from "./assets/emblema_sr.png";

const NAVY = "#101826";
const GOLD = "#C9A227";
const CREMA = "#EDE7D9";
const GRISC = "#A9B1C0";

// Los tres tamaños que piden las redes. Todos de 1080 de ancho, así que las
// medidas del diseño son las mismas y solo cambia el alto.
const FORMATOS = {
  vertical: { w: 1080, h: 1350, etiqueta: "Vertical", nota: "Instagram y Facebook" },
  cuadrado: { w: 1080, h: 1080, etiqueta: "Cuadrado", nota: "Feed clásico" },
  historia: { w: 1080, h: 1920, etiqueta: "Historia", nota: "Stories y TikTok" },
};

const fmtQ = (n) =>
  n == null || n === "" ? null : "Q" + Number(n).toLocaleString("es-GT", { maximumFractionDigits: 0 });

// Trae la imagen como data URL. Importa que sea data URL y no una <img> con
// src remoto: una imagen de otro dominio "mancha" el canvas y el navegador
// se niega a exportarlo. Así el brochure siempre se puede descargar.
async function comoDataUrl(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((ok, mal) => {
      const l = new FileReader();
      l.onload = () => ok(l.result);
      l.onerror = () => mal(new Error("no se pudo leer"));
      l.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function cargarImagen(src) {
  return new Promise((ok) => {
    if (!src) return ok(null);
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

// Dibuja la foto llenando todo el lienzo sin deformarla, recortando lo que sobra.
function dibujarCubriendo(ctx, img, W, H) {
  const escala = Math.max(W / img.width, H / img.height);
  const a = img.width * escala;
  const b = img.height * escala;
  ctx.drawImage(img, (W - a) / 2, (H - b) / 2, a, b);
}

// El canvas no sabe de letter-spacing y los antetítulos lo necesitan.
function textoEspaciado(ctx, texto, x, y, espacio) {
  let px = x;
  for (const c of texto) {
    ctx.fillText(c, px, y);
    px += ctx.measureText(c).width + espacio;
  }
  return px - x;
}

function anchoEspaciado(ctx, texto, espacio) {
  let a = 0;
  for (const c of texto) a += ctx.measureText(c).width + espacio;
  return a - espacio;
}

// Rectángulo redondeado a mano. ctx.roundRect() es reciente y en un teléfono
// con navegador viejo revienta el dibujo entero; esto funciona en todos.
function rectRedondo(ctx, x, y, ancho, alto, r) {
  const radio = Math.min(r, ancho / 2, alto / 2);
  ctx.beginPath();
  ctx.moveTo(x + radio, y);
  ctx.arcTo(x + ancho, y, x + ancho, y + alto, radio);
  ctx.arcTo(x + ancho, y + alto, x, y + alto, radio);
  ctx.arcTo(x, y + alto, x, y, radio);
  ctx.arcTo(x, y, x + ancho, y, radio);
  ctx.closePath();
}

function partirEnLineas(ctx, texto, maxAncho) {
  const palabras = String(texto || "").split(/\s+/).filter(Boolean);
  const lineas = [];
  let linea = "";
  for (const p of palabras) {
    const prueba = linea ? linea + " " + p : p;
    if (ctx.measureText(prueba).width > maxAncho && linea) {
      lineas.push(linea);
      linea = p;
    } else {
      linea = prueba;
    }
  }
  if (linea) lineas.push(linea);
  return lineas;
}

// ---------- Los datos que se van a pintar y a escribir ----------
function resumen(p, proyecto) {
  const partes = [];
  if (p.habitaciones) partes.push(`${p.habitaciones} habitaciones`);
  if (p.banos) partes.push(`${p.banos} baños`);
  if (p.niveles) partes.push(`${p.niveles} niveles`);
  if (p.parqueos) partes.push(`parqueo para ${p.parqueos}`);

  const medidas = [];
  if (p.metros_terreno) medidas.push(`${Number(p.metros_terreno)} m² de terreno`);
  if (p.metros_construccion) medidas.push(`${Number(p.metros_construccion)} m² de construcción`);

  const precio = p.mostrar_precio ? fmtQ(p.precio) : null;
  const enganche = fmtQ(p.financiamiento_enganche_desde);
  const anios = p.financiamiento_plazo_max_anios;
  const financiamiento =
    p.financiamiento_propio && (enganche || anios)
      ? `enganche desde ${enganche || "—"}${anios ? ` y hasta ${anios} años de plazo` : ""}`
      : null;

  const lugar = proyecto?.ubicacion || proyecto?.nombre || "";
  const ciudad = /retalhuleu/i.test(lugar) ? "Retalhuleu"
    : /quetzaltenango|xela/i.test(lugar) ? "Quetzaltenango"
    : null;

  return {
    ficha: partes.join(" · "),
    medidas: medidas.join(" · "),
    precio,
    financiamiento,
    lugar,
    ciudad,
    vendida: p.estado === "vendida",
    antetitulo: [proyecto?.nombre, proyecto?.ubicacion].filter(Boolean).join("  ·  ").toUpperCase(),
  };
}

// ---------- Los tres textos ----------
function construirTextos(p, proyecto, asesor) {
  const d = resumen(p, proyecto);
  // El equipo guarda el número en "telefono" y los asesores del sitio en
  // "whatsapp"; el brochure lo usa indistinto y, si no hay, no inventa uno.
  const crudo = asesor?.whatsapp || asesor?.telefono || null;
  const wa = crudo ? `+${String(crudo).replace(/\D/g, "")}` : null;
  const firma = wa
    ? `Escríbenos al ${wa} y agenda tu visita.`
    : "Escríbenos por WhatsApp y agenda tu visita.";

  const etiquetas = [
    "#SobreLaRoca",
    "#CasasEnVenta",
    d.ciudad ? `#${d.ciudad.replace(/\s/g, "")}` : null,
    "#Guatemala",
    "#CasaPropia",
    p.financiamiento_propio ? "#FinanciamientoPropio" : null,
    "#BienesRaices",
  ].filter(Boolean).join(" ");

  // La primera frase de la descripción es el gancho que ya está escrito y
  // revisado; se reaprovecha en vez de inventar otro.
  const primeraFrase = String(p.descripcion || "").split(".")[0].trim();
  const top = (p.caracteristicas || []).slice(0, 4);

  const directo = [
    `🏡 ${p.nombre}${proyecto?.nombre ? ` — ${proyecto.nombre}` : ""}`,
    d.lugar ? `📍 ${d.lugar}` : null,
    "",
    d.ficha || null,
    d.medidas || null,
    d.precio ? `\n💵 ${d.precio}` : null,
    d.financiamiento ? `✅ Financiamiento propio: ${d.financiamiento}.` : null,
    "",
    firma,
    "",
    etiquetas,
  ].filter((l) => l !== null).join("\n");

  const estilo = [
    primeraFrase ? `${primeraFrase}.` : `${p.nombre}, lista para entrar a vivir.`,
    "",
    top.length ? top.map((c) => `• ${c}`).join("\n") : d.ficha,
    "",
    d.lugar ? `📍 ${d.lugar}` : null,
    d.precio ? `💵 ${d.precio}` : null,
    "",
    "¿Te gustaría conocerla en persona?",
    firma,
    "",
    etiquetas,
  ].filter((l) => l !== null).join("\n");

  const finanzas = d.financiamiento
    ? [
        "💰 FINANCIAMIENTO PROPIO — sin banco de por medio",
        "",
        `${p.nombre}${proyecto?.nombre ? `, ${proyecto.nombre}` : ""}`,
        d.lugar ? `📍 ${d.lugar}` : null,
        "",
        `Con ${d.financiamiento}.`,
        "Abonos a capital cuando quieras, sin penalización.",
        "",
        d.ficha || null,
        d.precio ? `\n💵 ${d.precio}` : null,
        "",
        `Te calculamos tu cuota en el momento. ${firma}`,
        "",
        etiquetas,
      ].filter((l) => l !== null).join("\n")
    : [
        `${p.nombre}${proyecto?.nombre ? ` — ${proyecto.nombre}` : ""}`,
        d.lugar ? `📍 ${d.lugar}` : null,
        "",
        d.ficha || null,
        "",
        "Agenda una visita y conócela sin compromiso.",
        firma,
        "",
        etiquetas,
      ].filter((l) => l !== null).join("\n");

  const celebra = [
    `🎉 ¡VENDIDA! ${p.nombre}${proyecto?.nombre ? ` — ${proyecto.nombre}` : ""}`,
    "",
    "Gracias por confiarnos el lugar donde va a vivir tu familia.",
    "Seguimos construyendo, y todavía quedan casas disponibles.",
    "",
    firma,
    "",
    etiquetas,
  ].join("\n");

  return d.vendida
    ? [
        { titulo: "Celebrar la venta", texto: celebra },
        { titulo: "Directo", texto: directo },
        { titulo: "Estilo de vida", texto: estilo },
      ]
    : [
        { titulo: "Directo", texto: directo },
        { titulo: "Estilo de vida", texto: estilo },
        { titulo: p.financiamiento_propio ? "Financiamiento" : "Invitación", texto: finanzas },
      ];
}

// ---------- El dibujo ----------
function pintar(canvas, { foto, logo, p, proyecto, formato }) {
  const { w: W, h: H } = FORMATOS[formato];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const d = resumen(p, proyecto);
  const M = 72;
  const sans = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const serif = "Georgia, 'Times New Roman', serif";

  // Fondo
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);
  if (foto) dibujarCubriendo(ctx, foto, W, H);

  // ----- Se mide el bloque de texto ANTES de oscurecer -----
  // El degradado solo tiene que cubrir lo que hay debajo del texto. Si se
  // tira a ojo sobre toda la imagen, la casa queda apagada y la foto es lo
  // que vende.
  const anchoUtil = W - M * 2;
  ctx.font = `700 78px ${serif}`;
  const lineasNombre = partirEnLineas(ctx, p.nombre || "", anchoUtil);

  const filas = [];
  if (d.antetitulo) filas.push({ tipo: "antetitulo", alto: 40 });
  lineasNombre.forEach((l) => filas.push({ tipo: "nombre", texto: l, alto: 88 }));
  if (d.ficha) filas.push({ tipo: "ficha", texto: d.ficha, alto: 48 });
  if (d.medidas) filas.push({ tipo: "medidas", texto: d.medidas, alto: 44 });
  if (d.precio) filas.push({ tipo: "precio", alto: 96 });
  else if (d.financiamiento) filas.push({ tipo: "pastilla", alto: 86 });
  filas.push({ tipo: "contacto", alto: 64 });

  const alto = filas.reduce((s, f) => s + f.alto, 0);
  const arranque = Math.max(H * 0.30, H - M - alto - 210);

  // Degradado de abajo: es lo que hace legible el texto sobre cualquier foto.
  const g = ctx.createLinearGradient(0, arranque, 0, H);
  g.addColorStop(0, "rgba(16,24,38,0)");
  g.addColorStop(0.55, "rgba(16,24,38,0.78)");
  g.addColorStop(1, "rgba(16,24,38,0.97)");
  ctx.fillStyle = g;
  ctx.fillRect(0, arranque, W, H - arranque);

  // Degradado de arriba, para la marca
  const g2 = ctx.createLinearGradient(0, 0, 0, 290);
  g2.addColorStop(0, "rgba(16,24,38,0.72)");
  g2.addColorStop(1, "rgba(16,24,38,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, 290);

  // ----- Marca, arriba a la izquierda -----
  if (logo) ctx.drawImage(logo, M, M - 12, 104, 104);
  const xMarca = M + (logo ? 124 : 0);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = CREMA;
  ctx.font = `600 40px ${serif}`;
  ctx.fillText("SOBRE LA ROCA", xMarca, M + 36);
  ctx.fillStyle = GOLD;
  ctx.font = `600 17px ${sans}`;
  textoEspaciado(ctx, "CONSTRUCTORA INMOBILIARIA", xMarca + 2, M + 70, 3.4);

  // ----- Sello de vendida -----
  if (d.vendida) {
    ctx.font = `700 24px ${sans}`;
    const ancho = anchoEspaciado(ctx, "VENDIDA", 4) + 52;
    ctx.fillStyle = "#C0392B";
    rectRedondo(ctx, W - M - ancho, M - 6, ancho, 54, 27);
    ctx.fill();
    ctx.fillStyle = "#fff";
    textoEspaciado(ctx, "VENDIDA", W - M - ancho + 26, M + 28, 4);
  }

  // ----- Se dibuja el bloque de abajo -----
  let y = H - M - alto;

  for (const f of filas) {
    if (f.tipo === "antetitulo") {
      // El antetítulo lleva el proyecto y la dirección, que pueden ser largos.
      // Se achica hasta que entre en el ancho en vez de salirse de la hoja.
      ctx.fillStyle = GOLD;
      let tam = 19, esp = 3.6;
      for (; tam >= 12; tam -= 1, esp -= 0.2) {
        ctx.font = `700 ${tam}px ${sans}`;
        if (anchoEspaciado(ctx, d.antetitulo, esp) <= anchoUtil) break;
      }
      textoEspaciado(ctx, d.antetitulo, M, y + 22, Math.max(esp, 1.6));
    } else if (f.tipo === "nombre") {
      ctx.fillStyle = CREMA;
      ctx.font = `700 78px ${serif}`;
      ctx.fillText(f.texto, M, y + 68);
    } else if (f.tipo === "ficha") {
      ctx.fillStyle = "#DCE3EE";
      ctx.font = `400 31px ${sans}`;
      ctx.fillText(f.texto, M, y + 34);
    } else if (f.tipo === "medidas") {
      ctx.fillStyle = GRISC;
      ctx.font = `400 27px ${sans}`;
      ctx.fillText(f.texto, M, y + 30);
    } else if (f.tipo === "precio") {
      ctx.fillStyle = GOLD;
      ctx.font = `700 70px ${sans}`;
      ctx.fillText(d.precio, M, y + 74);
    } else if (f.tipo === "pastilla") {
      ctx.font = `700 25px ${sans}`;
      const txt = "FINANCIAMIENTO PROPIO";
      const ancho = anchoEspaciado(ctx, txt, 3.4) + 56;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      rectRedondo(ctx, M, y + 8, ancho, 60, 30);
      ctx.stroke();
      ctx.fillStyle = GOLD;
      textoEspaciado(ctx, txt, M + 28, y + 46, 3.4);
    } else if (f.tipo === "contacto") {
      ctx.fillStyle = "rgba(237,231,217,0.22)";
      ctx.fillRect(M, y + 14, anchoUtil, 1);
      ctx.fillStyle = GRISC;
      ctx.font = `400 25px ${sans}`;
      ctx.fillText("Escríbenos por WhatsApp  ·  sobrelaroca-ventas.vercel.app", M, y + 52);
    }
    y += f.alto;
  }
}

// ============================================================
export default function BrochureVenta({ propiedad, proyecto, fotos = [], asesor, onCerrar }) {
  const [formato, setFormato] = useState("vertical");
  const [idxFoto, setIdxFoto] = useState(0);
  const [imagen, setImagen] = useState(null);
  const [generando, setGenerando] = useState(true);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState(-1);
  const lienzo = useRef(null);
  const recursos = useRef({ logo: null, fotos: {} });

  const urls = (fotos || []).map((f) => f.archivo_url).filter(Boolean);
  const textos = construirTextos(propiedad, proyecto, asesor);
  const nombreArchivo =
    `${(propiedad.nombre || "propiedad").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-")}-${formato}.jpg`;

  useEffect(() => {
    let vivo = true;
    (async () => {
      setGenerando(true);
      setError("");
      try {
        if (!recursos.current.logo) recursos.current.logo = await cargarImagen(logoEmblema);
        const url = urls[idxFoto];
        if (url && !recursos.current.fotos[url]) {
          const data = await comoDataUrl(url);
          recursos.current.fotos[url] = data ? await cargarImagen(data) : null;
        }
        if (!vivo) return;
        const canvas = lienzo.current;
        if (!canvas) return;
        pintar(canvas, {
          foto: url ? recursos.current.fotos[url] : null,
          logo: recursos.current.logo,
          p: propiedad,
          proyecto,
          formato,
        });
        setImagen(canvas.toDataURL("image/jpeg", 0.92));
      } catch (e) {
        if (vivo) setError("No se pudo armar la imagen. " + (e?.message || ""));
      } finally {
        if (vivo) setGenerando(false);
      }
    })();
    return () => { vivo = false; };
  }, [formato, idxFoto, propiedad.id]);

  const compartir = async () => {
    try {
      const res = await fetch(imagen);
      const blob = await res.blob();
      const archivo = new File([blob], nombreArchivo, { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], text: textos[0].texto });
      }
    } catch {
      /* si el teléfono no deja compartir, queda el botón de descargar */
    }
  };

  const copiar = async (texto, i) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(i);
      setTimeout(() => setCopiado(-1), 1800);
    } catch {
      setError("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  };

  const puedeCompartir = typeof navigator !== "undefined" && !!navigator.canShare;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-3 sm:p-6">
        <div className="bg-[#101826] border border-[#2A3547] rounded-xl w-full max-w-2xl">

          <div className="flex items-center gap-2 p-4 border-b border-[#2A3547] sticky top-0 bg-[#101826] rounded-t-xl z-10">
            <IconoImagen size={18} className="text-[#C9A227]" />
            <h2 className="font-serif text-lg flex-1">Brochure para redes</h2>
            <button onClick={onCerrar} className="text-[#8A93A3] hover:text-[#EDE7D9]"><X size={20} /></button>
          </div>

          <div className="p-4 space-y-5">

            {/* Formato */}
            <div className="flex gap-2">
              {Object.entries(FORMATOS).map(([k, f]) => (
                <button
                  key={k}
                  onClick={() => setFormato(k)}
                  className={`flex-1 py-2 px-2 rounded-md border text-center transition ${
                    formato === k
                      ? "border-[#C9A227] bg-[#C9A227]/10 text-[#EDE7D9]"
                      : "border-[#2A3547] text-[#8A93A3] hover:border-[#3a4864]"}`}
                >
                  <div className="text-[13px] font-medium">{f.etiqueta}</div>
                  <div className="text-[10px] opacity-70">{f.nota}</div>
                </button>
              ))}
            </div>

            {/* Vista previa */}
            <div className="bg-[#0C121C] rounded-lg p-4 flex justify-center">
              {generando && <div className="text-sm text-[#8A93A3] py-16">Armando el brochure...</div>}
              {!generando && imagen && (
                <img src={imagen} alt="Brochure" className="max-h-[52vh] w-auto rounded shadow-lg" />
              )}
            </div>
            <canvas ref={lienzo} className="hidden" />

            {error && <div className="text-xs text-red-400">{error}</div>}

            {/* Elegir foto */}
            {urls.length > 1 && (
              <div>
                <div className="text-[11px] text-[#8A93A3] mb-2">Foto de fondo</div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {urls.map((u, i) => (
                    <button key={u} onClick={() => setIdxFoto(i)}
                      className={`shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition ${
                        i === idxFoto ? "border-[#C9A227]" : "border-transparent opacity-60 hover:opacity-100"}`}>
                      <img src={u} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Descargar / compartir */}
            <div className="flex gap-2">
              <a
                href={imagen || "#"}
                download={nombreArchivo}
                className={`flex-1 flex items-center justify-center gap-2 bg-[#C9A227] text-[#101826] font-medium py-2.5 rounded-md text-sm ${
                  imagen ? "" : "opacity-40 pointer-events-none"}`}
              >
                <Download size={16} /> Descargar imagen
              </a>
              {puedeCompartir && (
                <button onClick={compartir} disabled={!imagen}
                  className="flex items-center justify-center gap-2 bg-[#2A3547] text-[#EDE7D9] px-4 py-2.5 rounded-md text-sm disabled:opacity-40">
                  <Share2 size={16} /> Compartir
                </button>
              )}
            </div>

            {!propiedad.mostrar_precio && (
              <p className="text-[11px] text-[#8A93A3] -mt-2">
                El brochure sale sin precio porque esta propiedad tiene apagado "Mostrar precio".
                Es el mismo interruptor del sitio público: si lo enciendes ahí, aparece aquí.
              </p>
            )}

            {/* Textos */}
            <div>
              <div className="text-[11px] text-[#8A93A3] mb-2">
                Tres opciones de texto. Toca copiar y pégalo en la publicación.
              </div>
              <div className="space-y-2.5">
                {textos.map((t, i) => (
                  <div key={i} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] text-[#C9A227] font-medium uppercase tracking-wider">{t.titulo}</span>
                      <button onClick={() => copiar(t.texto, i)}
                        className="ml-auto text-[11px] bg-[#2A3547] hover:bg-[#35425a] px-2.5 py-1 rounded flex items-center gap-1.5">
                        {copiado === i ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
                      </button>
                    </div>
                    <pre className="text-[12px] text-[#C7CEDB] whitespace-pre-wrap font-sans leading-relaxed">{t.texto}</pre>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

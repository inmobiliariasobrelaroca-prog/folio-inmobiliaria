// ============================================================
// MapaLotes.tsx — plano de lotes del residencial
//
// El trazo sale del DXF del proyecto, así que las proporciones y los
// ángulos son los reales, no un esquema. El lienzo mide 1000 x 1157 y
// cada lote guarda su posición sobre él en la tabla `lotes`.
//
// El asesor toca un lote libre para cotizarlo, o aparta uno dejando
// constancia de quién y con cuánto.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { X, Check } from "lucide-react";

// El dibujo del plano vive en public/plano-reu.svg: el mismo que se manda
// por WhatsApp, con calles, áreas verdes, garita y Fase 2. Se le quitaron
// los colores de los lotes y los puntos rojos de vendido, porque eso lo
// pinta la app con lo que dice la base. Así el plano nunca queda viejo.
//
// GEO son los 32 lotes que sí están a la venta, con su figura exacta sacada
// del vectorial. Los del 8 al 16 y del 42 al 49 son Fase 2 y ya salen
// rotulados como tales en el dibujo.
const GEO = {
  1: { d: "M 210.31 276.5 L 210.31 276.14 L 257.11 276.14 L 260.71 276.14 L 260.71 391.32 L 226.15 391.32 L 224.6 391.24 L 223.06 391.02 L 221.55 390.64 L 220.09 390.11 L 218.69 389.45 L 217.35 388.65 L 216.1 387.72 L 214.95 386.68 L 213.91 385.53 L 212.98 384.28 L 212.18 382.95 L 211.52 381.54 L 210.99 380.08 L 210.62 378.57 L 210.39 377.03 L 210.31 375.48 L 210.31 276.51 Z", cx: 221.1, cy: 362.0 },
  2: { d: "M 260.71 391.32 L 260.71 276.14 L 264.31 276.14 L 311.11 276.14 L 311.11 391.32 Z", cx: 281.6, cy: 322.2 },
  3: { d: "M 361.52 276.14 L 361.52 276.14 L 361.52 391.32 L 311.11 391.32 L 311.11 276.14 L 311.11 276.14 Z", cx: 336.3, cy: 314.5 },
  4: { d: "M 361.52 391.32 L 361.52 276.14 L 411.92 276.14 L 411.92 391.32 Z", cx: 386.7, cy: 333.7 },
  5: { d: "M 462.32 276.14 L 462.32 276.14 L 462.32 391.32 L 411.92 391.32 L 411.92 276.14 L 411.92 276.14 Z", cx: 437.1, cy: 314.5 },
  6: { d: "M 462.32 391.32 L 462.32 276.14 L 512.72 276.14 L 512.72 276.14 L 512.72 391.32 Z", cx: 492.6, cy: 322.2 },
  7: { d: "M 560.16 391.34 L 560.14 391.34 L 560.14 391.34 L 559.77 391.32 L 512.72 391.32 L 512.72 276.14 L 512.72 276.14 L 560.16 275.43 Z", cx: 542.3, cy: 348.0 },
  17: { d: "M 846.92 896.81 L 762.4 975.71 L 730.37 934.86 L 814.75 855.9 L 845.77 895.38 L 846.0 895.65 L 846.01 895.65 L 846.62 896.42 Z", cx: 817.4, cy: 905.8 },
  18: { d: "M 699.15 895.05 L 783.5 816.11 L 814.75 855.9 L 730.37 934.86 Z", cx: 756.9, cy: 875.5 },
  19: { d: "M 667.93 855.23 L 752.25 776.33 L 783.5 816.11 L 699.15 895.05 Z", cx: 725.7, cy: 835.7 },
  20: { d: "M 636.72 815.42 L 721.0 736.55 L 752.25 776.33 L 667.93 855.23 Z", cx: 694.5, cy: 795.9 },
  21: { d: "M 605.5 775.61 L 689.75 696.76 L 721.0 736.55 L 636.72 815.42 Z", cx: 663.2, cy: 756.1 },
  22: { d: "M 574.28 735.79 L 658.51 656.98 L 689.75 696.76 L 605.5 775.61 Z", cx: 632.0, cy: 716.3 },
  23: { d: "M 543.06 695.98 L 627.26 617.2 L 658.51 656.98 L 574.28 735.79 Z", cx: 600.8, cy: 676.5 },
  24: { d: "M 511.85 656.17 L 596.01 577.41 L 627.26 617.2 L 543.06 695.98 Z", cx: 569.5, cy: 636.7 },
  25: { d: "M 596.01 577.41 L 511.85 656.17 L 480.63 616.35 L 564.76 537.63 Z", cx: 538.3, cy: 596.9 },
  26: { d: "M 564.76 537.63 L 480.63 616.35 L 451.63 579.37 L 449.41 576.54 L 533.51 497.85 Z", cx: 496.0, cy: 561.5 },
  27: { d: "M 533.51 497.85 L 449.41 576.54 L 418.28 536.84 L 502.36 458.18 Z", cx: 475.9, cy: 517.4 },
  28: { d: "M 418.2 536.73 L 416.04 533.98 L 386.98 496.91 L 453.64 434.53 L 476.36 434.53 L 477.66 434.6 L 479.23 434.84 L 480.77 435.24 L 482.27 435.78 L 483.7 436.48 L 485.06 437.32 L 486.32 438.28 L 487.48 439.37 L 488.52 440.58 L 502.26 458.06 Z", cx: 467.0, cy: 455.1 },
  29: { d: "M 386.98 496.91 L 302.54 575.93 L 271.33 536.11 L 355.76 457.1 L 357.98 459.93 Z", cx: 334.9, cy: 505.2 },
  30: { d: "M 416.04 533.98 L 418.2 536.73 L 333.76 615.74 L 302.54 575.93 L 386.98 496.91 Z", cx: 371.5, cy: 551.9 },
  31: { d: "M 449.41 576.54 L 364.98 655.55 L 333.84 615.84 L 415.93 539.04 L 418.28 536.84 Z", cx: 396.5, cy: 584.8 },
  32: { d: "M 480.63 616.35 L 396.19 695.37 L 392.8 691.05 L 364.98 655.55 L 449.41 576.54 L 451.63 579.37 Z", cx: 422.6, cy: 635.7 },
  33: { d: "M 511.85 656.17 L 427.41 735.18 L 396.19 695.37 L 480.63 616.35 Z", cx: 454.0, cy: 675.8 },
  34: { d: "M 427.41 735.18 L 511.85 656.17 L 543.06 695.98 L 458.63 774.99 Z", cx: 485.2, cy: 715.6 },
  35: { d: "M 458.63 774.99 L 543.06 695.98 L 574.28 735.79 L 489.84 814.81 Z", cx: 516.5, cy: 755.4 },
  36: { d: "M 489.84 814.81 L 574.28 735.79 L 605.5 775.61 L 521.06 854.62 Z", cx: 547.7, cy: 795.2 },
  37: { d: "M 521.06 854.62 L 605.5 775.61 L 636.72 815.42 L 552.28 894.43 Z", cx: 578.9, cy: 835.0 },
  38: { d: "M 552.28 894.43 L 636.72 815.42 L 667.93 855.23 L 583.5 934.25 Z", cx: 610.1, cy: 874.8 },
  39: { d: "M 583.5 934.25 L 667.93 855.23 L 699.15 895.05 L 614.71 974.06 Z", cx: 641.3, cy: 914.6 },
  40: { d: "M 614.71 974.06 L 699.15 895.05 L 730.37 934.86 L 645.93 1013.87 Z", cx: 672.5, cy: 954.5 },
  41: { d: "M 762.4 975.71 L 677.88 1054.62 L 677.15 1053.69 L 645.93 1013.87 L 730.37 934.86 Z", cx: 698.7, cy: 1006.5 },
};

const VISTA = { w: 1080, h: 1281.6 };

const COLOR = {
  disponible:    "#2E9E6B",
  apartado:      "#C9A227",
  vendido:       "#C0392B",
  no_disponible: "#39445A",
};
const ROTULO = {
  disponible:    "Disponible",
  apartado:      "Apartado",
  vendido:       "Vendido",
  no_disponible: "Todavía no a la venta",
};

const fmtQ = (n) =>
  "Q " + Number(n || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// verConteos: el asesor externo no necesita saber cuántos van vendidos ni
// apartados. Le basta el color de cada lote. La inmobiliaria sí lo ve.
//
// miniatura: vista decorativa y sin clicks, para la tarjeta de "Tus
// propiedades" (pedido de Carlos, 2026-10-03). No trae los apartados (no
// hacen falta sin panel de selección) y no muestra leyenda ni "Agrandar".
export default function MapaLotes({ proyectoVentaId, onCotizar, onSeleccionar, puedeApartar, asesorId, verConteos = false, precioCasa = 580000, miniatura = false }) {
  const [lotes, setLotes] = useState([]);
  const [apartados, setApartados] = useState([]);
  const [sel, setSel] = useState(null);
  const [apartando, setApartando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [zoom, setZoom] = useState(false);

  const cargar = async () => {
    if (miniatura) {
      const { data: ls } = await supabase.from("lotes").select("*").eq("proyecto_venta_id", proyectoVentaId).order("numero");
      setLotes(ls || []);
      setCargando(false);
      return;
    }
    const [{ data: ls }, { data: aps }] = await Promise.all([
      supabase.from("lotes").select("*").eq("proyecto_venta_id", proyectoVentaId).order("numero"),
      supabase.from("lote_apartados").select("*").order("created_at", { ascending: false }),
    ]);
    setLotes(ls || []);
    setApartados(aps || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, [proyectoVentaId]);

  if (cargando) {
    return miniatura ? null : <div className="text-sm text-[#8A93A3]">Cargando el plano...</div>;
  }

  const porNumero = {};
  lotes.forEach((l) => { porNumero[l.numero] = l; });
  const elegido = sel ? lotes.find((l) => l.id === sel) : null;
  const apartadoDe = elegido
    // El estado real está en `estado`, no en una columna "liberado" que no existe
    ? apartados.find((a) => a.lote_id === elegido.id && a.estado === "vigente")
    : null;

  const cuenta = (e) => lotes.filter((l) => l.estado === e).length;

  if (miniatura) {
    // Solo el dibujo con los colores, sin leyenda, sin zoom y sin que se
    // pueda tocar un lote: es una vista previa dentro de un carrusel que
    // cicla solo, no la herramienta para apartar.
    return (
      <div className="relative w-full h-full bg-[#F6F2EA] pointer-events-none select-none">
        <img src="/plano-reu.svg" alt="Plano de distribución de Las Luces Retalhuleu"
             className="absolute inset-0 w-full h-full object-cover" draggable="false" />
        <svg viewBox={`0 0 ${VISTA.w} ${VISTA.h}`} className="absolute inset-0 w-full h-full"
             preserveAspectRatio="xMidYMid slice">
          {Object.entries(GEO).map(([num, g]) => {
            const l = porNumero[num];
            if (!l) return null;
            return <path key={num} d={g.d} fill={COLOR[l.estado]} fillOpacity={0.45} />;
          })}
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
        {["disponible", "apartado", "vendido"].map((e) => (
          <span key={e} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR[e] }} />
            {ROTULO[e]}{verConteos ? ` · ${cuenta(e)}` : ""}
          </span>
        ))}
        <button onClick={() => setZoom(!zoom)} className="ml-auto text-[#C9A227]">
          {zoom ? "Achicar" : "Agrandar"}
        </button>
      </div>

      <div className={`bg-[#F6F2EA] rounded-lg border border-[#2A3547] ${zoom ? "overflow-auto max-h-[70vh]" : "overflow-hidden"}`}>
        <div className="relative" style={{ width: zoom ? "200%" : "100%" }}>
          {/* El dibujo, tal cual se diseñó */}
          <img src="/plano-reu.svg" alt="Plano de distribución de Las Luces Retalhuleu"
               className="block w-full select-none" draggable="false" />

          {/* Encima, cada lote con el color que le da la base */}
          <svg viewBox={`0 0 ${VISTA.w} ${VISTA.h}`} className="absolute inset-0 w-full h-full">
            {Object.entries(GEO).map(([num, g]) => {
              const l = porNumero[num];
              if (!l) return null;
              const activo = l.estado === "disponible";
              return (
                <g key={num} onClick={() => { setSel(l.id); setApartando(false); onSeleccionar && onSeleccionar(l); }}
                   style={{ cursor: activo || puedeApartar ? "pointer" : "default" }}>
                  <path d={g.d} fill={COLOR[l.estado]}
                        fillOpacity={sel === l.id ? 0.62 : 0.38}
                        stroke={sel === l.id ? "#101826" : "none"} strokeWidth="2.5" />
                  {l.estado === "vendido" && (
                    <circle cx={g.cx} cy={g.cy} r="9" fill="#d62828" stroke="#7f1010" strokeWidth="0.7" />
                  )}
                  {l.estado === "apartado" && (
                    <circle cx={g.cx} cy={g.cy} r="9" fill="#C9A227" stroke="#7a6316" strokeWidth="0.7" />
                  )}
                  {/* Marca de que ahí va casa */}
                  {l.destino === "casa" && l.estado !== "vendido" && (
                    <text x={g.cx} y={g.cy + 5} fontSize="14" textAnchor="middle"
                          style={{ pointerEvents: "none" }}>{"\u{1F3E0}"}</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {!elegido && (
        <p className="text-[10px] text-[#8A93A3]">
          Tocá un lote para ver su precio. Los que dicen Fase 2 todavía no se venden.
        </p>
      )}

      {elegido && (
        <PanelLote
          precioCasa={precioCasa}
          lote={elegido}
          apartado={apartadoDe}
          puedeApartar={puedeApartar}
          asesorId={asesorId}
          onCerrar={() => { setSel(null); setApartando(false); onSeleccionar && onSeleccionar(null); }}
          onCotizar={onCotizar}
          apartando={apartando}
          setApartando={setApartando}
          onListo={() => { setApartando(false); setSel(null); cargar(); }}
        />
      )}
    </div>
  );
}

// ---------- El lote elegido ----------
//
// Un lote en blanco se puede vender de dos formas, y no son el mismo
// producto: como terreno o para construirle casa. Hay que elegir una,
// porque cambia el precio y lo que el cliente termina firmando.

function PanelLote({ lote, apartado, puedeApartar, asesorId, onCerrar, onCotizar,
                     apartando, setApartando, onListo, precioCasa }) {
  const [destino, setDestino] = useState(null);
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [monto, setMonto] = useState("");
  const [vence, setVence] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const precioLote = lote.precio_lote != null ? Number(lote.precio_lote) : null;
  // Sobre algunos lotes la casa vale más; si el lote no dice nada, el general
  const precioCasaAqui = lote.precio_casa != null ? Number(lote.precio_casa) : precioCasa;
  // Si ya se definió que ahí va casa, no se puede vender como terreno pelado
  const soloCasa = lote.destino === "casa";
  const puedeLote = !soloCasa && precioLote != null;

  const guardar = async () => {
    setError(""); setGuardando(true);
    try {
      const { error: e } = await supabase.rpc("apartar_lote", {
        p_lote: lote.id,
        p_destino: destino,
        p_cliente: nombre.trim(),
        p_telefono: tel.trim() || null,
        p_monto: Number(monto),
        p_precio: destino === "lote" ? precioLote : precioCasaAqui,
        p_vence: vence || null,
        p_nota: null,
      });
      if (e) throw new Error(e.message);
      onListo();
    } catch (e) { setError(e.message); setGuardando(false); }
  };

  return (
    <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm">Lote {lote.numero} · sector {lote.sector}</div>
          <div className="text-[11px] text-[#8A93A3]">
            {lote.area_m2 ? `${lote.area_m2} m² de terreno · ` : ""}
            <span style={{ color: COLOR[lote.estado] }}>{ROTULO[lote.estado]}</span>
            {lote.obra_estado === "construccion" && " · casa en construcción"}
            {lote.obra_estado === "acabados" && " · casa en acabados finales"}
          </div>
          {lote.notas && <div className="text-[10px] text-[#6b7280] mt-0.5">{lote.notas}</div>}
        </div>
        <button onClick={onCerrar} className="text-[#8A93A3] hover:text-[#EDE7D9] shrink-0">
          <X size={15} />
        </button>
      </div>

      {apartado && (
        <div className="mt-2 text-[11px] bg-[#0C121C] border border-amber-800/60 rounded-md p-2">
          Apartado por <b>{apartado.cliente_nombre}</b> con {fmtQ(apartado.monto)} el{" "}
          {apartado.fecha}
          {apartado.destino && ` · para ${apartado.destino === "casa" ? "casa" : "terreno"}`}
          {apartado.vence ? `, vence el ${apartado.vence}` : ""}.
        </div>
      )}

      {lote.estado === "disponible" && !apartando && (
        <div className="mt-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-[#8A93A3]">
            {soloCasa ? "Se vende como" : "Se puede vender como"}
          </div>

          {puedeLote && (
            <div className="bg-[#0C121C] border border-[#2A3547] rounded-md p-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px]">Terreno</span>
                <span className="font-mono text-sm" style={{ color: COLOR.apartado }}>{fmtQ(precioLote)}</span>
              </div>
              <div className="text-[10px] text-[#8A93A3] mb-1.5">
                Enganche desde {fmtQ(8000)} · hasta 10 años
                <br/>Precio fijo. Cualquier rebaja la autoriza la inmobiliaria.
              </div>
              <div className="flex gap-2">
                <button onClick={() => onCotizar && onCotizar(lote, "lote")}
                  className="flex-1 text-[10px] bg-[#C9A227] text-[#101826] font-medium py-1.5 rounded">
                  Cotizar el terreno
                </button>
                {puedeApartar && (
                  <button onClick={() => { setDestino("lote"); setApartando(true); setError(""); }}
                    className="flex-1 text-[10px] bg-[#2A3547] py-1.5 rounded">
                    Apartar como terreno
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bg-[#0C121C] border border-[#2A3547] rounded-md p-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px]">Casa construida</span>
              <span className="font-mono text-sm" style={{ color: COLOR.apartado }}>{fmtQ(precioCasaAqui)}</span>
            </div>
            <div className="text-[10px] text-[#8A93A3] mb-1.5">
              Enganche desde {fmtQ(40000)} · hasta 25 años
              <br/>Precio fijo. Cualquier rebaja la autoriza la inmobiliaria.
            </div>
            <div className="flex gap-2">
              <button onClick={() => onCotizar && onCotizar(lote, "casa")}
                className="flex-1 text-[10px] bg-[#C9A227] text-[#101826] font-medium py-1.5 rounded">
                Cotizar la casa
              </button>
              {puedeApartar && (
                <button onClick={() => { setDestino("casa"); setApartando(true); setError(""); }}
                  className="flex-1 text-[10px] bg-[#2A3547] py-1.5 rounded">
                  Apartar para casa
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {apartando && (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] text-[#8A93A3]">
            Se aparta <b>para {destino === "casa" ? "casa" : "terreno"}</b>, a{" "}
            {fmtQ(destino === "casa" ? precioCasaAqui : precioLote)}. Queda bloqueado
            para los demás vendedores.
          </p>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de quien aparta"
            className="w-full bg-[#0C121C] border border-[#2A3547] rounded p-2 text-[11px]" />
          <input value={tel} onChange={(e) => setTel(e.target.value)}
            placeholder="Teléfono (opcional)"
            className="w-full bg-[#0C121C] border border-[#2A3547] rounded p-2 text-[11px]" />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] text-[#8A93A3]">Cuánto dejó</span>
              <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)}
                className="w-full mt-0.5 bg-[#0C121C] border border-[#2A3547] rounded p-2 text-[11px] font-mono" />
            </label>
            <label className="block">
              <span className="text-[10px] text-[#8A93A3]">Vence el (opcional)</span>
              <input type="date" value={vence} onChange={(e) => setVence(e.target.value)}
                className="w-full mt-0.5 bg-[#0C121C] border border-[#2A3547] rounded p-2 text-[11px]" />
            </label>
          </div>
          {error && <div className="text-[11px] text-red-400">{error}</div>}
          <div className="flex gap-2">
            <button onClick={() => setApartando(false)} disabled={guardando}
              className="flex-1 text-[10px] bg-[#2A3547] disabled:opacity-40 py-2 rounded">Cancelar</button>
            <button onClick={guardar}
              disabled={guardando || !nombre.trim() || !(Number(monto) > 0)}
              className="flex-1 flex items-center justify-center gap-1 text-[10px] bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded">
              {guardando ? "Guardando..." : (<><Check size={11} /> Apartar</>)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

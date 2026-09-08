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

const TRAZO = "M500.4 21.0L1018.4 679.7M1018.4 679.7L499.8 1165.2M499.8 1165.2L396.1 1141.5M397.6 1136.8L246.9 1131.8M246.9 1131.8L281.6 1083.8M281.6 1083.8L228.7 1053.4M228.7 1053.4L-57.8 22.1M396.1 1141.5L397.6 1136.8M-57.8 22.1L500.4 21.0M2.4 22.1L2.4 54.5M-19.4 23.5L1.0 23.5M1.0 23.5L1.0 54.5M-19.4 53.1L1.0 53.1M2.4 54.5L-19.4 54.5M11.1 171.6L-9.2 54.5M-20.8 22.1L2.4 22.1M2.4 22.1L2.4 21.9M2.4 22.0L1.0 22.0M1.0 22.0L1.0 22.2M2.4 22.0L34.7 22.0M34.7 22.0L34.7 22.0M50.9 22.0L50.9 170.9M34.7 30.5L50.9 30.5M34.7 31.0L50.9 31.0M34.7 152.6L50.9 152.6M34.7 153.1L50.9 153.1M34.7 141.5L50.9 141.5M34.7 142.0L50.9 142.0M34.7 130.4L51.0 130.4M34.7 130.9L51.0 130.9M34.7 119.3L50.9 119.3M34.7 119.8L50.9 119.8M34.7 108.2L50.9 108.2M34.7 108.7L50.9 108.7M34.7 97.1L50.9 97.1M34.7 97.6L50.9 97.6M34.7 86.0L50.9 86.0M34.7 86.5L50.9 86.5M34.7 74.9L50.9 74.9M34.7 75.4L50.9 75.4M34.7 63.8L50.9 63.8M34.7 64.3L50.9 64.3M34.7 52.7L51.0 52.7M34.7 53.2L51.0 53.2M34.7 41.6L51.0 41.6M34.7 42.1L51.0 42.1M50.9 30.5L36.1 30.5M36.1 30.5L36.1 170.9M36.1 170.9L50.9 170.9M34.7 23.3L50.9 23.3M50.9 22.0L34.7 22.0M115.7 22.0L115.7 170.0M50.9 170.0L50.9 22.0M500.4 170.0L50.9 170.0M245.2 22.0L245.2 170.0M180.4 170.0L180.4 22.0M374.7 22.0L374.7 170.0M310.0 170.0L310.0 22.0M439.5 170.0L439.5 22.0M115.7 22.0L50.9 22.0M180.4 22.0L115.7 22.0M245.2 22.0L180.4 22.0M310.0 22.0L245.2 22.0M374.7 22.0L310.0 22.0M439.5 22.0L374.7 22.0M500.4 21.0L439.5 22.0M500.4 170.0L500.4 20.6M501.3 19.9L1018.4 679.7M1018.4 679.7L499.1 1164.5M499.1 1164.5L395.4 1140.7M397.0 1135.9L246.3 1130.8M246.3 1130.8L281.1 1082.8M281.1 1082.8L228.2 1052.3M228.2 1052.3L-56.9 20.7M395.4 1140.7L397.0 1135.9M499.2 252.9L909.5 780.8M199.7 530.9L473.2 882.8M518.8 941.4L610.0 1058.7M124.9 675.8L364.3 983.8M409.9 1042.5L501.1 1159.8M403.1 1048.8L481.6 1149.7M1018.4 679.7L497.6 1163.0M972.8 621.1L863.9 722.1M564.4 1000.1L455.5 1101.1M927.2 562.4L818.3 663.5M518.8 941.4L409.9 1042.5M881.6 503.8L772.7 604.8M473.2 882.8L364.3 983.8M836.0 445.1L727.1 546.2M427.6 824.1L318.7 925.2M790.4 386.5L681.5 487.5M382.0 765.5L273.1 866.5M744.8 327.8L635.9 428.9M336.4 706.8L227.5 807.9M699.2 269.2L590.3 370.2M290.9 648.2L182.0 749.2M653.7 210.5L544.7 311.6M245.3 589.5L136.4 690.6M608.1 151.9L499.2 252.9M595.6 150.9L492.9 246.2M199.7 530.9L108.4 615.5M499.2 252.9L492.9 246.2M409.9 1042.5L403.1 1048.8M364.3 983.8L357.0 989.5M333.7 969.9L335.7 967.7M333.7 969.9L335.7 967.7M868.6 818.7L909.5 780.8M889.1 799.7L419.8 196.1M496.0 912.1L387.1 1013.1M610.0 1058.7L650.7 1020.9M546.8 408.7L329.9 611.7M586.9 459.8L370.0 662.9M627.0 511.0L410.1 714.0M667.1 562.1L450.2 765.2M707.2 613.3L490.3 816.3M747.4 664.4L530.4 867.5M787.5 715.6L570.5 918.6M827.6 766.7L610.6 969.8M506.7 357.5L289.7 560.6M466.6 306.4L249.6 509.4M466.6 306.4L867.7 817.9M318.1 356.9L759.2 919.4M249.6 509.4L650.7 1020.9M466.6 306.4L426.6 255.4M249.6 509.4L209.6 458.4M426.6 255.4L209.6 458.4M426.6 255.4L318.5 356.6M80.0 225.5L402.3 225.5M426.5 255.2L209.5 458.3M466.6 306.4L249.6 509.4M363.6 225.5L169.4 407.1M268.8 225.5L129.3 356.0M402.3 225.5L466.6 306.4M237.8 254.4L358.1 407.9M129.3 356.0L249.6 509.4M268.8 225.5L129.0 355.6M174.0 225.5L89.2 304.8M215.1 225.5L237.8 254.4M89.2 304.8L129.3 356.0M199.7 530.9L21.6 308.0M80.0 225.5L56.6 247.3M56.4 246.9L89.5 305.2M199.7 530.9L141.9 458.5M89.2 304.8L174.0 225.5M42.4 197.7L423.1 199.0M30.5 249.9L30.5 249.9";
const LIENZO = { w: 1000, h: 1157 };

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
export default function MapaLotes({ proyectoVentaId, onCotizar, puedeApartar, asesorId, verConteos = false }) {
  const [lotes, setLotes] = useState([]);
  const [apartados, setApartados] = useState([]);
  const [sel, setSel] = useState(null);
  const [apartando, setApartando] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    const [l, a] = await Promise.all([
      supabase.from("lotes").select("*").eq("proyecto_venta_id", proyectoVentaId).order("numero"),
      supabase.from("lote_apartados").select("*").eq("estado", "vigente"),
    ]);
    setLotes(l.data || []);
    setApartados(a.data || []);
    setCargando(false);
  };
  useEffect(() => { if (proyectoVentaId) cargar(); }, [proyectoVentaId]);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando el plano...</div>;
  if (lotes.length === 0) return null;

  const cuenta = (e) => lotes.filter((l) => l.estado === e).length;
  const apartadoDe = (loteId) => apartados.find((a) => a.lote_id === loteId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-[11px] text-[#8A93A3]">
        {["disponible", "apartado", "vendido", "no_disponible"].map((e) => (
          <span key={e} className="flex items-center gap-1.5">
            <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COLOR[e] }} />
            {ROTULO[e]}{verConteos ? ` · ${cuenta(e)}` : ""}
          </span>
        ))}
      </div>

      <div className="bg-[#0C121C] border border-[#2A3547] rounded-lg p-2">
        <svg viewBox={`0 0 ${LIENZO.w} ${LIENZO.h}`} className="w-full h-auto">
          <path d={TRAZO} stroke="#6E7A92" strokeWidth="1.6" fill="none" />
          {lotes.map((l) => {
            const activo = l.estado === "disponible" || l.estado === "apartado";
            return (
              <g key={l.id}
                 onClick={() => activo && setSel(l)}
                 style={{ cursor: activo ? "pointer" : "default" }}>
                <circle cx={l.mapa_x} cy={l.mapa_y} r={sel?.id === l.id ? 22 : 17}
                        fill={COLOR[l.estado]} fillOpacity={activo ? 0.9 : 0.55}
                        stroke={sel?.id === l.id ? "#EDE7D9" : "#fff"}
                        strokeWidth={sel?.id === l.id ? 3 : 1.5} />
                <text x={l.mapa_x} y={l.mapa_y} fontSize="12" fontWeight="700" fill="#fff"
                      textAnchor="middle" dominantBaseline="central"
                      style={{ pointerEvents: "none" }}>{l.numero}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {sel && (
        <PanelLote
          lote={sel}
          apartado={apartadoDe(sel.id)}
          puedeApartar={puedeApartar}
          asesorId={asesorId}
          onCerrar={() => { setSel(null); setApartando(false); }}
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

function PanelLote({ lote, apartado, puedeApartar, asesorId, onCerrar, onCotizar,
                     apartando, setApartando, onListo }) {
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [monto, setMonto] = useState("");
  const [vence, setVence] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    setError(""); setGuardando(true);
    try {
      const { error: e1 } = await supabase.from("lote_apartados").insert({
        lote_id: lote.id, cliente_nombre: nombre.trim(), cliente_telefono: tel.trim() || null,
        monto: Number(monto), vence: vence || null, asesor_id: asesorId || null,
      });
      if (e1) throw new Error(e1.message);
      // El lote queda bloqueado para los demás vendedores
      const { error: e2 } = await supabase.from("lotes")
        .update({ estado: "apartado" }).eq("id", lote.id);
      if (e2) throw new Error(e2.message);
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
          {apartado.vence ? `, vence el ${apartado.vence}` : ""}.
        </div>
      )}

      {lote.estado === "disponible" && !apartando && (
        <div className="flex gap-2 mt-3">
          <button onClick={() => onCotizar && onCotizar(lote)}
            className="flex-1 text-[11px] bg-[#C9A227] text-[#101826] font-medium py-2 rounded-md">
            Cotizar este lote
          </button>
          {puedeApartar && (
            <button onClick={() => setApartando(true)}
              className="flex-1 text-[11px] bg-[#2A3547] py-2 rounded-md">
              Apartarlo
            </button>
          )}
        </div>
      )}

      {apartando && (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] text-[#8A93A3]">
            Al apartarlo queda bloqueado para los demás vendedores.
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
              className="flex-1 text-[10px] bg-[#2A3547] disabled:opacity-40 py-2 rounded">
              Cancelar
            </button>
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

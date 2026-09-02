// ============================================================
// tesoreria/Mapa.tsx — mapa de flujo del dinero
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { fmt, fmtDate, C_ORIGEN, C_BOLSA, C_GASTO } from "./comun";

// ---------- Mapa de flujo del dinero ----------
//
// Tres columnas, de izquierda a derecha, como se lee un flujo:
//   verde  — de dónde vino
//   dorado — en qué bolsa está asignado
//   rojo   — en qué obra se convirtió en gasto
//
// El grosor de cada línea es proporcional al monto.
// SVG puro, sin librerías. En pantallas angostas se desliza
// horizontalmente en vez de encogerse hasta ser ilegible.

export function MapaFlujo({ bolsas, libre, delegado, apartado }) {
  const [origenes, setOrigenes] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [desglose, setDesglose] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState(null); // { tipo:'origen'|'bolsa'|'gasto', id, nombre, monto }

  useEffect(() => {
    (async () => {
      const [{ data: o }, { data: g }, { data: d }] = await Promise.all([
        supabase.from("v_flujo_origen_bolsa").select("*"),
        supabase.from("v_flujo_bolsa_centro").select("*"),
        supabase.from("v_flujo_centro_categoria").select("*"),
      ]);
      setOrigenes(o || []);
      setGastos(g || []);
      setDesglose(d || []);
      setCargando(false);
    })();
  }, []);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Armando el mapa...</div>;

  // ---- Geometría ----
  const W = 560, NW = 148, NH = 44, GAP = 16, TOP = 14;
  const COL = { origen: 8, bolsa: (W - NW) / 2, gasto: W - NW - 8 };

  // ---- Columna 1: orígenes ----
  const acumOrigen = {};
  origenes.forEach((o) => { acumOrigen[o.origen] = (acumOrigen[o.origen] || 0) + Number(o.total); });
  const listaOrigen = Object.entries(acumOrigen)
    .map(([nombre, monto]) => ({ id: nombre, nombre, monto }))
    .sort((a, b) => b.monto - a.monto);

  // ---- Columna 2: bolsas con actividad ----
  const listaBolsa = bolsas
    .filter((b) => Number(b.saldo_actual) !== 0 ||
      gastos.some((g) => g.bolsa_id === b.id) ||
      origenes.some((o) => o.bolsa_id === b.id))
    .map((b) => ({ id: b.id, nombre: b.nombre, monto: Number(b.saldo_actual),
                   tipo: b.tipo, apartada: b.disponible_para_gasto === false,
                   delegada: !!b.delegada_a_rol_id }))
    .sort((a, b) => b.monto - a.monto);

  // ---- Columna 3: obras ----
  const acumGasto = {};
  gastos.forEach((g) => {
    const k = g.centro_id || "sin";
    if (!acumGasto[k]) acumGasto[k] = { id: g.centro_id, nombre: g.centro, monto: 0 };
    acumGasto[k].monto += Number(g.total);
  });
  const listaGasto = Object.values(acumGasto).sort((a, b) => b.monto - a.monto);

  const filas = Math.max(listaOrigen.length, listaBolsa.length, listaGasto.length, 1);
  const H = TOP + filas * (NH + GAP) + 10;

  // Centra verticalmente cada columna según cuántos nodos tenga
  const posiciones = (lista) => {
    const alto = lista.length * (NH + GAP) - GAP;
    const y0 = TOP + (H - TOP - 10 - alto) / 2;
    const mapa = {};
    lista.forEach((n, i) => { mapa[n.id] = y0 + i * (NH + GAP); });
    return mapa;
  };
  const yOri = posiciones(listaOrigen);
  const yBol = posiciones(listaBolsa);
  const yGas = posiciones(listaGasto);

  // ---- Resaltado ----
  const vivo = (tipo, id) => {
    if (!sel) return true;
    if (sel.tipo === "bolsa") {
      if (tipo === "bolsa") return id === sel.id;
      if (tipo === "origen") return origenes.some((o) => o.bolsa_id === sel.id && o.origen === id);
      return gastos.some((g) => g.bolsa_id === sel.id && g.centro_id === id);
    }
    if (sel.tipo === "origen") {
      if (tipo === "origen") return id === sel.id;
      if (tipo === "bolsa") return origenes.some((o) => o.origen === sel.id && o.bolsa_id === id);
      return false;
    }
    if (tipo === "gasto") return id === sel.id;
    if (tipo === "bolsa") return gastos.some((g) => g.centro_id === sel.id && g.bolsa_id === id);
    return false;
  };

  const maxFlujo = Math.max(1,
    ...origenes.map((o) => Number(o.total)),
    ...gastos.map((g) => Number(g.total)));
  const grosor = (m) => 1.5 + 7 * Math.sqrt(Number(m) / maxFlujo);

  const lazo = (x1, y1, x2, y2) => {
    const dx = (x2 - x1) * 0.45;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  const corto = (t, n) => (t && t.length > n ? t.slice(0, n - 1) + "…" : t || "");

  const Nodo = ({ x, y, nombre, monto, color, fondo, onClick, atenuado, sub }) => (
    <g onClick={onClick} style={{ cursor: "pointer" }} opacity={atenuado ? 0.2 : 1}>
      <rect x={x} y={y} width={NW} height={NH} rx="9" fill={fondo} stroke={color} strokeWidth="1.8" />
      <text x={x + 11} y={y + 18} fontSize="10" fill="#EDE7D9">{corto(nombre, 21)}</text>
      <text x={x + 11} y={y + 33} fontSize="11" fill={color} fontWeight="600">{fmt(monto)}</text>
      {sub && <text x={x + NW - 11} y={y + 18} fontSize="8" fill="#8A93A3" textAnchor="end">{sub}</text>}
    </g>
  );

  const catsSel = sel?.tipo === "gasto"
    ? desglose.filter((d) => d.centro_id === sel.id).sort((a, b) => Number(b.total) - Number(a.total))
    : [];

  const colorSel = sel?.tipo === "origen" ? C_ORIGEN : sel?.tipo === "bolsa" ? C_BOLSA : C_GASTO;

  return (
    <div>
      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 mb-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wide text-[#8A93A3]">A tu disposición</span>
          <span className="font-serif text-2xl" style={{ color: C_BOLSA }}>{fmt(libre)}</span>
        </div>
        {delegado > 0 && (
          <div className="flex items-baseline justify-between mt-1.5 pt-1.5 border-t border-[#2A3547]">
            <span className="text-[10px] uppercase tracking-wide text-[#8A93A3]">Delegado a terceros</span>
            <span className="font-mono text-sm text-[#8A93A3]">{fmt(delegado)}</span>
          </div>
        )}
        {apartado > 0 && (
          <div className="flex items-baseline justify-between mt-1.5 pt-1.5 border-t border-[#2A3547]">
            <span className="text-[10px] uppercase tracking-wide text-[#8A93A3]">Apartado o retenido</span>
            <span className="font-mono text-sm text-[#8A93A3]">{fmt(apartado)}</span>
          </div>
        )}
      </div>

      <div className="flex justify-between px-1 mb-1 text-[9px] uppercase tracking-wide">
        <span style={{ color: C_ORIGEN }}>Vino de</span>
        <span style={{ color: C_BOLSA }}>Asignado en</span>
        <span style={{ color: C_GASTO }}>Se gastó en</span>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W }}>
          {/* Líneas origen → bolsa */}
          {origenes.map((o, i) => {
            if (yOri[o.origen] == null || yBol[o.bolsa_id] == null) return null;
            const activo = vivo("origen", o.origen) && vivo("bolsa", o.bolsa_id);
            return (
              <path key={`ob-${i}`}
                d={lazo(COL.origen + NW, yOri[o.origen] + NH / 2, COL.bolsa, yBol[o.bolsa_id] + NH / 2)}
                fill="none" stroke={C_ORIGEN} strokeWidth={grosor(o.total)}
                opacity={activo ? 0.55 : 0.08} strokeLinecap="round" />
            );
          })}

          {/* Líneas bolsa → gasto */}
          {gastos.map((g, i) => {
            if (yBol[g.bolsa_id] == null || yGas[g.centro_id] == null) return null;
            const activo = vivo("bolsa", g.bolsa_id) && vivo("gasto", g.centro_id);
            return (
              <path key={`bg-${i}`}
                d={lazo(COL.bolsa + NW, yBol[g.bolsa_id] + NH / 2, COL.gasto, yGas[g.centro_id] + NH / 2)}
                fill="none" stroke={C_GASTO} strokeWidth={grosor(g.total)}
                opacity={activo ? 0.55 : 0.08} strokeLinecap="round" />
            );
          })}

          {/* Nodos */}
          {listaOrigen.map((n) => (
            <Nodo key={`o-${n.id}`} x={COL.origen} y={yOri[n.id]} nombre={n.nombre} monto={n.monto}
              color={C_ORIGEN} fondo="#0F2119" atenuado={!vivo("origen", n.id)}
              onClick={() => setSel(sel?.tipo === "origen" && sel.id === n.id ? null : { tipo: "origen", ...n })} />
          ))}

          {listaBolsa.map((n) => (
            <Nodo key={`b-${n.id}`} x={COL.bolsa} y={yBol[n.id]} nombre={n.nombre} monto={n.monto}
              color={C_BOLSA} fondo="#1C1B10" atenuado={!vivo("bolsa", n.id)}
              sub={n.apartada ? "apartado" : n.delegada ? "delegado" : null}
              onClick={() => setSel(sel?.tipo === "bolsa" && sel.id === n.id ? null : { tipo: "bolsa", ...n })} />
          ))}

          {listaGasto.map((n) => (
            <Nodo key={`g-${n.id}`} x={COL.gasto} y={yGas[n.id]} nombre={n.nombre} monto={n.monto}
              color={C_GASTO} fondo="#22110F" atenuado={!vivo("gasto", n.id)}
              onClick={() => setSel(sel?.tipo === "gasto" && sel.id === n.id ? null : { tipo: "gasto", ...n })} />
          ))}
        </svg>
      </div>

      {/* Detalle */}
      {!sel ? (
        <p className="text-[11px] text-[#8A93A3] text-center px-4 mt-2">
          Tocá cualquier bloque para seguir el rastro del dinero.
        </p>
      ) : (
        <div className="bg-[#161F2E] border rounded-lg p-4 mt-3" style={{ borderColor: colorSel }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-[#8A93A3]">
                {sel.tipo === "origen" ? "Vino de" : sel.tipo === "bolsa" ? "Asignado en" : "Se gastó en"}
              </div>
              <div className="font-serif text-lg truncate">{sel.nombre}</div>
            </div>
            <div className="font-mono text-sm shrink-0" style={{ color: colorSel }}>{fmt(sel.monto)}</div>
          </div>

          {sel.tipo === "bolsa" && (
            <div className="mt-3 space-y-3">
              {origenes.filter((o) => o.bolsa_id === sel.id).length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[#8A93A3] mb-1.5">De dónde vino</div>
                  {origenes.filter((o) => o.bolsa_id === sel.id).map((o, i) => (
                    <div key={i} className="flex justify-between text-xs bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 mb-1">
                      <span className="truncate">{o.origen}</span>
                      <span className="font-mono ml-2 shrink-0" style={{ color: C_ORIGEN }}>{fmt(o.total)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[#8A93A3] mb-1.5">A dónde se fue</div>
                {gastos.filter((g) => g.bolsa_id === sel.id).length === 0 ? (
                  <div className="text-xs text-[#8A93A3]">Todavía no ha salido nada de esta bolsa.</div>
                ) : gastos.filter((g) => g.bolsa_id === sel.id).map((g, i) => (
                  <button key={i} onClick={() => setSel({ tipo: "gasto", id: g.centro_id, nombre: g.centro, monto: g.total })}
                    className="w-full flex justify-between text-xs bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 mb-1">
                    <span className="truncate">{g.centro}</span>
                    <span className="font-mono ml-2 shrink-0" style={{ color: C_GASTO }}>{fmt(g.total)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {sel.tipo === "origen" && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wide text-[#8A93A3] mb-1.5">Entró a estas bolsas</div>
              {origenes.filter((o) => o.origen === sel.id).map((o, i) => (
                <button key={i} onClick={() => setSel({ tipo: "bolsa", id: o.bolsa_id, nombre: o.bolsa, monto: bolsas.find((b) => b.id === o.bolsa_id)?.saldo_actual })}
                  className="w-full flex justify-between text-xs bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 mb-1">
                  <span className="truncate">{o.bolsa}</span>
                  <span className="font-mono ml-2 shrink-0">{fmt(o.total)}</span>
                </button>
              ))}
            </div>
          )}

          {sel.tipo === "gasto" && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wide text-[#8A93A3] mb-1.5">En qué se gastó</div>
              {catsSel.length === 0 ? (
                <div className="text-xs text-[#8A93A3]">Sin desglose todavía.</div>
              ) : catsSel.map((c, i) => (
                <div key={i} className="flex justify-between text-xs bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 mb-1">
                  <span className="truncate">{c.categoria}<span className="text-[#8A93A3]"> · {c.movimientos} mov.</span></span>
                  <span className="font-mono ml-2 shrink-0" style={{ color: C_GASTO }}>{fmt(c.total)}</span>
                </div>
              ))}
              <div className="text-[10px] uppercase tracking-wide text-[#8A93A3] mt-3 mb-1.5">Financiado por</div>
              {gastos.filter((g) => g.centro_id === sel.id).map((g, i) => (
                <button key={i} onClick={() => setSel({ tipo: "bolsa", id: g.bolsa_id, nombre: g.bolsa, monto: bolsas.find((b) => b.id === g.bolsa_id)?.saldo_actual })}
                  className="w-full flex justify-between text-xs bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 mb-1">
                  <span className="truncate">{g.bolsa}</span>
                  <span className="font-mono ml-2 shrink-0" style={{ color: C_BOLSA }}>{fmt(g.total)}</span>
                </button>
              ))}
            </div>
          )}

          <button onClick={() => setSel(null)} className="mt-3 text-[11px] text-[#8A93A3] underline">
            Ver todo el mapa
          </button>
        </div>
      )}
    </div>
  );
}

export default MapaFlujo;

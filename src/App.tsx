import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import {
  Plus, Zap, Bell, ChevronLeft, ChevronUp, ChevronDown, CheckCircle2,
  AlertTriangle, Clock, TrendingDown, Calculator, Upload, X, Lock, Sparkles, Settings2, Building2, FolderOpen,
  FileText, Download, Trash2, Printer, LogOut, Pencil, Users, Shield, KeyRound
} from "lucide-react";

// ---------- Utilidades financieras ----------

const LOCALE = "es-GT"; // formato con coma de miles y punto decimal

const fmt = (n) =>
  (isFinite(n) ? n : 0).toLocaleString(LOCALE, { style: "currency", currency: "GTQ", maximumFractionDigits: 2 });

const fmtNum = (n) => (isFinite(n) ? n : 0).toLocaleString(LOCALE, { maximumFractionDigits: 2 });

const fmtDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(LOCALE, { day: "2-digit", month: "short", year: "numeric" });
};

const fmtDateTime = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString(LOCALE, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const addMonths = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const daysBetween = (a, b) => Math.floor((new Date(a) - new Date(b)) / 86400000);

function pagoMensual(principal, tasaAnual, meses) {
  const i = tasaAnual / 100 / 12;
  if (i === 0) return principal / meses;
  return (principal * i) / (1 - Math.pow(1 + i, -meses));
}

function mesesRestantes(principal, tasaAnual, pago) {
  const i = tasaAnual / 100 / 12;
  if (i === 0) return Math.ceil(principal / pago);
  const n = -Math.log(1 - (i * principal) / pago) / Math.log(1 + i);
  return Math.max(1, Math.ceil(n));
}

function generarTabla({ precio, enganche, tasaAnual, plazoAnios, fechaInicio }) {
  const principal = Math.max(0, precio - enganche);
  const meses = Math.round(plazoAnios * 12);
  const i = tasaAnual / 100 / 12;
  const pago = pagoMensual(principal, tasaAnual, meses);
  let saldo = principal;
  const filas = [];
  for (let n = 1; n <= meses; n++) {
    const interes = saldo * i;
    let capital = pago - interes;
    if (n === meses || capital > saldo) capital = saldo;
    const pagoReal = n === meses ? capital + interes : pago;
    const saldoFinal = Math.max(0, saldo - capital);
    filas.push({
      numero: n,
      fecha: addMonths(fechaInicio, n),
      saldoInicial: saldo,
      pago: pagoReal,
      interes,
      capital,
      saldoFinal,
      estado: "pendiente", // pendiente | revision | parcial | pagado
      fechaPago: null,
      moraAplicada: 0,
      abono: 0,
      montoPagadoAcumulado: 0,
      moraPagada: 0,
      moraCondonada: 0,
      moraGeneradaFinal: null,
      comprobante: null, // { imagen, fecha, montoDepositado, moraAlSubir, cuotaPendienteAlSubir, montoRequerido, excedente, faltante, resultado, destinoExcedente, estado }
      ultimoRechazo: null,
      luzPagado: false,
      luzFechaPago: null,
      luzMoraPagada: 0,
    });
    saldo = saldoFinal;
  }
  return filas;
}

// Aplica un monto de dinero empezando en idxInicial, cubriendo primero mora y luego capital
// (y luz, si aplica) de esa cuota; si sobra dinero y la SIGUIENTE cuota ya está vencida
// también, sigue aplicando ahí en cascada. Se detiene al quedarse sin dinero o al llegar a
// una cuota que aún no vence (esa parte del sobrante ya no se aplica aquí — el llamador
// decide qué hacer con ella).
function aplicarPagoCascada(tabla, idxInicial, monto, hoy, prop) {
  let restante = monto;
  let idx = idxInicial;
  while (restante > 0.009 && idx < tabla.length) {
    const fila = tabla[idx];
    if (fila.estado === "pagado") { idx++; continue; }
    if (idx > idxInicial && daysBetween(hoy, fila.fecha) <= 0) break; // aún no vence, no seguir en cascada

    const { moraPendiente, cuotaPendiente, luzPendiente, luzMoraPendiente } = calcularEstadoPago(fila, hoy, prop);

    const montoParaMora = Math.min(restante, moraPendiente);
    fila.moraPagada = (fila.moraPagada || 0) + montoParaMora;
    restante -= montoParaMora;

    const montoParaCuota = Math.min(restante, cuotaPendiente);
    fila.montoPagadoAcumulado = (fila.montoPagadoAcumulado || 0) + montoParaCuota;
    restante -= montoParaCuota;

    if (prop.aplicaLuz) {
      const montoParaLuzMora = Math.min(restante, luzMoraPendiente);
      fila.luzMoraPagada = (fila.luzMoraPagada || 0) + montoParaLuzMora;
      restante -= montoParaLuzMora;

      if (luzPendiente > 0 && restante >= luzPendiente - 0.009) {
        fila.luzPagado = true;
        fila.luzFechaPago = hoy;
        restante -= luzPendiente;
      }
    }

    const estadoNuevo = calcularEstadoPago(fila, hoy, prop);
    const todoResuelto = estadoNuevo.moraPendiente <= 0.009 && estadoNuevo.cuotaPendiente <= 0.009 && estadoNuevo.luzPendiente <= 0.009 && estadoNuevo.luzMoraPendiente <= 0.009;
    if (todoResuelto) {
      fila.moraGeneradaFinal = calcularMoraGenerada(fila, hoy, prop.diasGracia, prop.moraDiaria);
      fila.estado = "pagado";
      fila.fechaPago = hoy;
      fila.moraAplicada = fila.moraPagada;
      idx++;
    } else {
      if ((fila.montoPagadoAcumulado || 0) > 0 || (fila.moraPagada || 0) > 0 || fila.luzPagado) fila.estado = "parcial";
      break;
    }
  }
  return { restante, idxDetenido: idx };
}

function recalcularConAbono(tabla, indexDesde, montoAbono, tasaAnual) {
  const fila = tabla[indexDesde];
  const pagoFijo = tabla.find((f) => f.estado !== "pagado")?.pago || fila.pago;
  const nuevoPrincipal = Math.max(0, fila.saldoFinal - montoAbono);
  fila.abono = montoAbono;
  fila.saldoFinal = nuevoPrincipal;

  const historico = tabla.slice(0, indexDesde + 1);
  if (nuevoPrincipal <= 0.5) return historico;

  const i = tasaAnual / 100 / 12;
  const nMeses = mesesRestantes(nuevoPrincipal, tasaAnual, pagoFijo);
  let saldo = nuevoPrincipal;
  const nuevas = [];
  for (let k = 1; k <= nMeses; k++) {
    const interes = saldo * i;
    let capital = pagoFijo - interes;
    if (k === nMeses || capital > saldo) capital = saldo;
    const pagoReal = k === nMeses ? capital + interes : pagoFijo;
    const saldoFinal = Math.max(0, saldo - capital);
    nuevas.push({
      numero: indexDesde + 1 + k,
      fecha: addMonths(fila.fecha, k),
      saldoInicial: saldo,
      pago: pagoReal,
      interes,
      capital,
      saldoFinal,
      estado: "pendiente",
      fechaPago: null,
      moraAplicada: 0,
      abono: 0,
      montoPagadoAcumulado: 0,
      moraPagada: 0,
      moraCondonada: 0,
      moraGeneradaFinal: null,
      comprobante: null,
      ultimoRechazo: null,
      luzPagado: false,
      luzFechaPago: null,
      luzMoraPagada: 0,
    });
    saldo = saldoFinal;
  }
  return [...historico, ...nuevas];
}

// ---------- Mora diaria con días de gracia ----------

function fechaLimiteGracia(fecha, diasGracia) {
  return addDays(fecha, diasGracia);
}

function calcularMoraGenerada(fila, hoy, diasGracia, moraDiaria) {
  if (fila.moraGeneradaFinal != null) return fila.moraGeneradaFinal; // congelada al resolverse la cuota
  const limite = fechaLimiteGracia(fila.fecha, diasGracia);
  const diasAtraso = daysBetween(hoy, limite);
  return diasAtraso <= 0 ? 0 : diasAtraso * moraDiaria;
}

function calcularMoraCredito(fila, hoy, diasGracia, moraDiaria) {
  const generada = calcularMoraGenerada(fila, hoy, diasGracia, moraDiaria);
  return Math.max(0, generada - (fila.moraPagada || 0) - (fila.moraCondonada || 0));
}

// Mora de luz de una cuota específica (solo aplica si la propiedad tiene luz activada).
function calcularMoraLuzCuota(fila, hoy, diasGraciaLuz, moraDiariaLuz) {
  if (fila.luzPagado) return 0;
  const limite = fechaLimiteGracia(fila.fecha, diasGraciaLuz);
  const diasAtraso = daysBetween(hoy, limite);
  const bruta = diasAtraso <= 0 ? 0 : diasAtraso * moraDiariaLuz;
  return Math.max(0, bruta - (fila.luzMoraPagada || 0));
}

// Cuánto falta por cubrir de esta cuota en este momento: cuota pendiente (después de abonos
// parciales previos) + mora pendiente (después de mora ya pagada o condonada) + luz de ese
// mes y su propia mora, si la propiedad tiene luz activada.
function calcularEstadoPago(fila, hoy, prop) {
  const moraPendiente = calcularMoraCredito(fila, hoy, prop.diasGracia, prop.moraDiaria);
  const cuotaPendiente = Math.max(0, fila.pago - (fila.montoPagadoAcumulado || 0));
  let luzPendiente = 0;
  let luzMoraPendiente = 0;
  if (prop.aplicaLuz) {
    luzPendiente = fila.luzPagado ? 0 : (prop.montoLuzMensual || 0);
    luzMoraPendiente = calcularMoraLuzCuota(fila, hoy, prop.diasGraciaLuz, prop.moraDiariaLuz);
  }
  return {
    moraPendiente,
    cuotaPendiente,
    luzPendiente,
    luzMoraPendiente,
    montoRequerido: moraPendiente + cuotaPendiente + luzPendiente + luzMoraPendiente,
  };
}

// Recalcula si un pago fue a tiempo, con excedente, o parcial, usando una fecha de
// referencia que puede ser distinta a "hoy" — para cuando la inmobiliaria corrige la
// fecha real del depósito (por ejemplo, si el cliente pagó a tiempo pero el registro
// en la app se hizo después).
function calcularResultadoPago(fila, prop, fechaReferencia, montoDepositado) {
  const { moraPendiente, montoRequerido } = calcularEstadoPago(fila, fechaReferencia, prop);
  const excedente = Math.max(0, montoDepositado - montoRequerido);
  const faltante = Math.max(0, montoRequerido - montoDepositado);
  const aTiempo = moraPendiente === 0;
  return {
    moraAlSubir: moraPendiente,
    montoRequerido,
    excedente,
    faltante,
    aTiempo,
    resultado: faltante > 0.009 ? "parcial" : excedente > 0.009 ? "excedente" : "completo",
  };
}

function calcularMoraLuz(cargo, hoy, diasGraciaLuz, moraDiariaLuz) {
  if (cargo.pagado) return 0;
  const limite = fechaLimiteGracia(cargo.fecha, diasGraciaLuz);
  const diasAtraso = daysBetween(hoy, limite);
  if (diasAtraso <= 0) return 0;
  return diasAtraso * moraDiariaLuz;
}

function estadoReal(fila, hoy, diasGracia) {
  if (fila.estado === "pagado") return "pagado";
  if (fila.estado === "revision") return "revision";
  if (fila.estado === "parcial") return "parcial";
  const diasDesdeVencimiento = daysBetween(hoy, fila.fecha);
  if (diasDesdeVencimiento <= 0) return "pendiente";
  if (diasDesdeVencimiento <= diasGracia) return "gracia";
  return "vencido";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Placeholder: lectura automática del comprobante con IA de visión.
// Estructura lista pero DESACTIVADA — se activa cuando la app viva en la nube.
// Nota para cuando se active: si la fecha que la IA lee en la foto del depósito NO coincide
// con la fecha de subida (fila.comprobante.fecha), no decidir solo — generar una notificación
// para la inmobiliaria alertando la discrepancia, para que un humano decida a mano si el
// excedente se trata como a tiempo (abono a capital) o tarde (crédito al siguiente mes).
async function leerComprobanteConIA(_imagenBase64) {
  return null; // { montoDetectado, fechaDetectada, referencia }
}

function nuevaNotificacion(para, mensaje) {
  return { id: crypto.randomUUID(), para, mensaje, fecha: new Date().toISOString(), leida: false };
}

// ---------- Llamada a la Edge Function segura (crea/gestiona usuarios con la llave secreta,
// que solo vive en el servidor de Supabase, nunca en el navegador) ----------

const SUPABASE_URL_FUNCIONES = import.meta.env.VITE_SUPABASE_URL || "https://knquysqjhprnyztkgmwb.supabase.co";

async function llamarGestionUsuarios(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL_FUNCIONES}/functions/v1/gestionar-usuarios`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Error en el servidor");
  return json;
}

function generarCodigoNumerico() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Vista imprimible: solo visible cuando el navegador está imprimiendo (o guardando como PDF).
// No depende de ninguna librería externa, así que funciona en cualquier entorno.
function VistaImprimible({ prop, proyecto, hoy }) {
  const saldoActual = prop.tabla.find((f) => f.estado !== "pagado")?.saldoInicial ?? 0;
  const tarjetas = [
    ["Precio de venta", fmt(prop.precio)],
    ["Enganche", fmt(prop.enganche)],
    ["Monto financiado", fmt(Math.max(0, prop.precio - prop.enganche))],
    ["Tasa anual", `${fmtNum(prop.tasaAnual)}%`],
    ["Plazo", `${fmtNum(prop.plazoAnios)} años · ${prop.tabla.length} cuotas`],
    ["Mensualidad", fmt(prop.tabla[0]?.pago ?? 0)],
    ["Saldo actual", fmt(saldoActual)],
    ["Mora crédito", `${prop.diasGracia} días gracia · ${fmt(prop.moraDiaria)}/día`],
    ...(prop.aplicaLuz ? [["Luz mensual", `${fmt(prop.montoLuzMensual)} · ${prop.diasGraciaLuz} días gracia · ${fmt(prop.moraDiariaLuz)}/día mora`]] : []),
  ];
  const estadoTxt = { pendiente: "Pendiente", gracia: "En gracia", vencido: "Vencido", parcial: "Parcial", revision: "En revisión", pagado: "Pagado" };

  return (
    <div className="hidden print:block bg-white text-[#14212f] p-8" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
      <div className="bg-[#101826] text-white rounded-md px-5 py-4 mb-5 flex justify-between items-start">
        <div>
          <div className="text-xl font-bold">Tabla de Pagos</div>
          <div className="text-sm mt-1">{prop.cliente}</div>
          <div className="text-xs text-[#C9A227] mt-0.5">{proyecto?.nombre || ""}</div>
        </div>
        <div className="text-[10px] text-gray-300 text-right">Generado el {fmtDate(hoy)}</div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        {tarjetas.map(([label, value]) => (
          <div key={label} className="border border-gray-300 rounded-sm px-2.5 py-2">
            <div className="text-[8px] uppercase text-gray-500">{label}</div>
            <div className="text-[11px] font-bold">{value}</div>
          </div>
        ))}
      </div>

      <div className="text-sm font-bold mb-2">Tabla de amortización</div>
      <table className="w-full text-[9px] border-collapse mb-6">
        <thead>
          <tr className="bg-[#101826] text-white">
            <th className="p-1 text-left">#</th>
            <th className="p-1 text-left">Fecha</th>
            <th className="p-1 text-right">Capital</th>
            <th className="p-1 text-right">Interés</th>
            <th className="p-1 text-right">Cuota</th>
            <th className="p-1 text-right">Abono a capital</th>
            <th className="p-1 text-right">Mora</th>
            {prop.aplicaLuz && <th className="p-1 text-right">Luz</th>}
            <th className="p-1 text-right">Saldo</th>
            <th className="p-1 text-left">Estado</th>
          </tr>
        </thead>
        <tbody>
          {prop.tabla.map((f, i) => {
            const mora = calcularMoraCredito(f, hoy, prop.diasGracia, prop.moraDiaria);
            const est = f.estado === "pagado" ? "pagado" : estadoReal(f, hoy, prop.diasGracia);
            const luzMora = prop.aplicaLuz ? calcularMoraLuzCuota(f, hoy, prop.diasGraciaLuz, prop.moraDiariaLuz) : 0;
            return (
              <tr key={f.numero} className={i % 2 === 1 ? "bg-gray-100" : ""}>
                <td className="p-1">{f.numero}</td>
                <td className="p-1">{fmtDate(f.fecha)}</td>
                <td className="p-1 text-right">{fmt(f.capital)}</td>
                <td className="p-1 text-right">{fmt(f.interes)}</td>
                <td className="p-1 text-right">{fmt(f.pago)}</td>
                <td className="p-1 text-right">{f.abono > 0 ? fmt(f.abono) : "-"}</td>
                <td className="p-1 text-right">{mora > 0 ? fmt(mora) : "-"}</td>
                {prop.aplicaLuz && (
                  <td className="p-1 text-right">
                    {f.luzPagado ? "Pagada" : `${fmt(prop.montoLuzMensual)}${luzMora > 0 ? ` +${fmt(luzMora)}` : ""}`}
                  </td>
                )}
                <td className="p-1 text-right">{fmt(f.saldoFinal)}</td>
                <td className="p-1">{estadoTxt[est] || est}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Datos de ejemplo ----------

const DEFAULTS_CONDICIONES = { diasGracia: 3, moraDiaria: 100, diasGraciaLuz: 3, moraDiariaLuz: 20 };

// ---------- Puente entre el modelo local y las tablas de Supabase ----------

function propiedadDesdeFila(row) {
  return {
    id: row.id,
    proyectoId: row.proyecto_id,
    folio: row.folio || "",
    direccion: row.direccion,
    cliente: row.cliente_nombre,
    telefono: row.telefono || "",
    precio: Number(row.precio),
    enganche: Number(row.enganche),
    tasaAnual: Number(row.tasa_anual),
    plazoAnios: Number(row.plazo_anios),
    fechaInicio: row.fecha_inicio,
    diasGracia: row.dias_gracia,
    moraDiaria: Number(row.mora_diaria),
    diasGraciaLuz: row.dias_gracia_luz,
    moraDiariaLuz: Number(row.mora_diaria_luz),
    aplicaLuz: !!row.aplica_luz,
    montoLuzMensual: Number(row.monto_luz_mensual || 0),
    saldoAFavor: Number(row.saldo_a_favor || 0),
    clienteUserId: row.cliente_user_id,
  };
}

function propiedadHaciaFila(p) {
  return {
    proyecto_id: p.proyectoId,
    folio: p.folio,
    direccion: p.direccion,
    cliente_nombre: p.cliente,
    telefono: p.telefono,
    precio: p.precio,
    enganche: p.enganche,
    tasa_anual: p.tasaAnual,
    plazo_anios: p.plazoAnios,
    fecha_inicio: p.fechaInicio,
    dias_gracia: p.diasGracia,
    mora_diaria: p.moraDiaria,
    dias_gracia_luz: p.diasGraciaLuz,
    mora_diaria_luz: p.moraDiariaLuz,
    aplica_luz: !!p.aplicaLuz,
    monto_luz_mensual: p.montoLuzMensual || 0,
    saldo_a_favor: p.saldoAFavor,
  };
}

// ---------- Cuotas: puente entre el modelo local y la tabla `cuotas` de Supabase ----------

function cuotaHaciaFila(f, propiedadId) {
  return {
    propiedad_id: propiedadId,
    numero: f.numero,
    fecha: f.fecha,
    saldo_inicial: f.saldoInicial,
    pago: f.pago,
    interes: f.interes,
    capital: f.capital,
    saldo_final: f.saldoFinal,
    estado: f.estado,
    fecha_pago: f.fechaPago,
    mora_pagada: f.moraPagada || 0,
    mora_condonada: f.moraCondonada || 0,
    mora_generada_final: f.moraGeneradaFinal,
    abono: f.abono || 0,
    monto_pagado_acumulado: f.montoPagadoAcumulado || 0,
    ultimo_rechazo_fecha: f.ultimoRechazo?.fecha || null,
    luz_pagado: !!f.luzPagado,
    luz_fecha_pago: f.luzFechaPago || null,
    luz_mora_pagada: f.luzMoraPagada || 0,
  };
}

function cuotaDesdeFila(row) {
  return {
    id: row.id,
    numero: row.numero,
    fecha: row.fecha,
    saldoInicial: Number(row.saldo_inicial),
    pago: Number(row.pago),
    interes: Number(row.interes),
    capital: Number(row.capital),
    saldoFinal: Number(row.saldo_final),
    estado: row.estado,
    fechaPago: row.fecha_pago,
    moraPagada: Number(row.mora_pagada || 0),
    moraCondonada: Number(row.mora_condonada || 0),
    moraGeneradaFinal: row.mora_generada_final != null ? Number(row.mora_generada_final) : null,
    moraAplicada: Number(row.mora_pagada || 0),
    abono: Number(row.abono || 0),
    montoPagadoAcumulado: Number(row.monto_pagado_acumulado || 0),
    ultimoRechazo: row.ultimo_rechazo_fecha ? { fecha: row.ultimo_rechazo_fecha } : null,
    luzPagado: !!row.luz_pagado,
    luzFechaPago: row.luz_fecha_pago,
    luzMoraPagada: Number(row.luz_mora_pagada || 0),
    comprobante: null, // se completa con lo que haya guardado localmente (ver abajo)
  };
}

// Guarda las cuotas de una propiedad en Supabase manteniendo el mismo id por cada
// número de cuota (upsert), y borra solo las que ya no existen (por ejemplo, tras un
// abono a capital que acorta el plazo restante).
async function sincronizarCuotas(propiedadId, tabla) {
  if (tabla.length > 0) {
    const filas = tabla.map((f) => cuotaHaciaFila(f, propiedadId));
    const { error: errUpsert } = await supabase.from("cuotas").upsert(filas, { onConflict: "propiedad_id,numero" });
    if (errUpsert) { console.error("Error guardando cuotas:", errUpsert); return; }
  }
  const maxNumero = tabla.length > 0 ? Math.max(...tabla.map((f) => f.numero)) : 0;
  const { error: errDelete } = await supabase.from("cuotas").delete().eq("propiedad_id", propiedadId).gt("numero", maxNumero);
  if (errDelete) console.error("Error limpiando cuotas sobrantes:", errDelete);
}

// ---------- Comprobantes de pago: subida real a Supabase Storage + tabla `comprobantes` ----------

async function subirImagenComprobante(propiedadId, cuotaNumero, file) {
  const { data: cuotaRow, error: errCuota } = await supabase
    .from("cuotas").select("id").eq("propiedad_id", propiedadId).eq("numero", cuotaNumero).single();
  if (errCuota || !cuotaRow) { console.error("No se encontró la cuota en Supabase:", errCuota); return null; }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${propiedadId}/${cuotaRow.id}-${Date.now()}.${ext}`;
  const { error: errUpload } = await supabase.storage.from("comprobantes").upload(path, file, { upsert: true });
  if (errUpload) { console.error("Error subiendo comprobante a Storage:", errUpload); return null; }

  return { cuotaId: cuotaRow.id, path };
}

async function guardarComprobanteEnBD(cuotaId, path, datos) {
  const { error } = await supabase.from("comprobantes").insert({
    cuota_id: cuotaId,
    imagen_url: path,
    monto_depositado: datos.montoDepositado,
    mora_al_subir: datos.moraAlSubir,
    monto_requerido: datos.montoRequerido,
    excedente: datos.excedente,
    faltante: datos.faltante,
    resultado: datos.resultado,
    destino_excedente: datos.destinoExcedente,
    estado: "revision",
  });
  if (error) console.error("Error guardando el registro del comprobante:", error);
}

async function actualizarEstadoComprobanteBD(propiedadId, cuotaNumero, estado) {
  const { data: cuotaRow } = await supabase.from("cuotas").select("id").eq("propiedad_id", propiedadId).eq("numero", cuotaNumero).single();
  if (!cuotaRow) return;
  const { error } = await supabase.from("comprobantes")
    .update({ estado, revisado_en: new Date().toISOString() })
    .eq("cuota_id", cuotaRow.id)
    .eq("estado", "revision");
  if (error) console.error("Error actualizando el estado del comprobante:", error);
}

function cargarComprobantesLocal(propiedadId) {
  try {
    const raw = localStorage.getItem(`comprobantes_${propiedadId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function guardarComprobantesLocal(propiedadId, tabla) {
  const mapa = {};
  tabla.forEach((f) => {
    if (f.comprobante || f.ultimoRechazo) mapa[f.numero] = { comprobante: f.comprobante, ultimoRechazo: f.ultimoRechazo };
  });
  try {
    localStorage.setItem(`comprobantes_${propiedadId}`, JSON.stringify(mapa));
  } catch {}
}

function fusionarComprobantes(tabla, mapaComprobantes) {
  return tabla.map((f) => (!f.comprobante && mapaComprobantes[f.numero] ? { ...f, ...mapaComprobantes[f.numero] } : f));
}

// ---------- Cargos de luz: puente hacia la tabla `cargos_luz` de Supabase ----------

function cargoLuzHaciaFila(c, propiedadId) {
  return { propiedad_id: propiedadId, fecha: c.fecha, monto: c.monto, pagado: c.pagado, fecha_pago: c.fechaPago || null };
}

function cargoLuzDesdeFila(row) {
  return { id: row.id, fecha: row.fecha, monto: Number(row.monto), pagado: row.pagado, fechaPago: row.fecha_pago };
}

async function sincronizarCargosLuz(propiedadId, cargosLuz) {
  const { error: errDelete } = await supabase.from("cargos_luz").delete().eq("propiedad_id", propiedadId);
  if (errDelete) { console.error("Error borrando cargos de luz previos:", errDelete); return; }
  if (cargosLuz.length === 0) return;
  const filas = cargosLuz.map((c) => cargoLuzHaciaFila(c, propiedadId));
  const { error: errInsert } = await supabase.from("cargos_luz").insert(filas);
  if (errInsert) console.error("Error guardando cargos de luz:", errInsert);
}

// ---------- Notificaciones: puente hacia la tabla `notificaciones` de Supabase ----------

function notifHaciaFila(n, propiedadId) {
  return { propiedad_id: propiedadId, para: n.para, mensaje: n.mensaje, leida: n.leida, created_at: n.fecha };
}

function notifDesdeFila(row) {
  return { id: row.id, para: row.para, mensaje: row.mensaje, leida: row.leida, fecha: row.created_at };
}

async function sincronizarNotificaciones(propiedadId, notificaciones) {
  const { error: errDelete } = await supabase.from("notificaciones").delete().eq("propiedad_id", propiedadId);
  if (errDelete) { console.error("Error borrando notificaciones previas:", errDelete); return; }
  if (notificaciones.length === 0) return;
  const filas = notificaciones.map((n) => notifHaciaFila(n, propiedadId));
  const { error: errInsert } = await supabase.from("notificaciones").insert(filas);
  if (errInsert) console.error("Error guardando notificaciones:", errInsert);
}

// ---------- Documentos del contrato: Supabase Storage + tabla `documentos` ----------
// Estos se manejan aparte (no con el guardado general), porque cada uno tiene un archivo
// real en Storage que no debe volver a subirse cada vez que cambia otra cosa.

function documentoDesdeFila(row) {
  return { id: row.id, nombre: row.nombre, archivoUrl: row.archivo_url, tipo: row.tipo, fecha: row.created_at };
}

async function subirDocumentoStorage(propiedadId, file) {
  const path = `${propiedadId}/${crypto.randomUUID()}-${file.name}`;
  const { error: errUpload } = await supabase.storage.from("documentos").upload(path, file);
  if (errUpload) { console.error("Error subiendo documento:", errUpload); return null; }
  const { data, error: errInsert } = await supabase
    .from("documentos")
    .insert({ propiedad_id: propiedadId, nombre: file.name, archivo_url: path, tipo: file.type })
    .select().single();
  if (errInsert) { console.error("Error registrando documento:", errInsert); return null; }
  return documentoDesdeFila(data);
}

async function eliminarDocumentoStorage(documentoId, archivoUrl) {
  await supabase.storage.from("documentos").remove([archivoUrl]);
  const { error } = await supabase.from("documentos").delete().eq("id", documentoId);
  if (error) console.error("Error eliminando documento:", error);
}

async function verDocumentoStorage(archivoUrl) {
  const { data, error } = await supabase.storage.from("documentos").createSignedUrl(archivoUrl, 60);
  if (error) { console.error("Error generando enlace del documento:", error); return; }
  window.open(data.signedUrl, "_blank");
}

function datosIniciales() {
  const proyectoId = crypto.randomUUID();
  const fechaInicio = new Date().toISOString().slice(0, 10);
  const propiedad = {
    id: crypto.randomUUID(),
    proyectoId,
    folio: "LT-014",
    direccion: "Lote 14, Fracc. Vista Real",
    cliente: "Marisol Hernández",
    telefono: "55 1234 5678",
    precio: 850000,
    enganche: 170000,
    tasaAnual: 14,
    plazoAnios: 8,
    ...DEFAULTS_CONDICIONES,
    fechaInicio,
    cargosLuz: [],
    notificaciones: [],
    documentos: [], // [{ id, archivo (dataURL), nombre, tipo, fecha }]
    saldoAFavor: 0,
  };
  propiedad.tabla = generarTabla(propiedad);
  const proyecto = { id: proyectoId, nombre: "Vista Real", ubicacion: "Zona 16, Ciudad de Guatemala" };
  return { proyectos: [proyecto], propiedades: [propiedad] };
}

// ---------- Login ----------

function Login({ onIngreso }) {
  const [modo, setModo] = useState("cliente"); // 'cliente' | 'staff'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codigo, setCodigo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const ingresarStaff = async (e) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) { setError("Correo o contraseña incorrectos."); return; }
    onIngreso(data.session);
  };

  const ingresarCliente = async (e) => {
    e.preventDefault();
    setError("");
    setCargando(true);
    const codigoLimpio = codigo.trim();
    const emailSintetico = `cliente${codigoLimpio}@cliente.folio`;
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailSintetico, password: codigoLimpio });
    setCargando(false);
    if (error) { setError("Código incorrecto."); return; }
    onIngreso(data.session);
  };

  return (
    <div className="min-h-screen bg-[#101826] text-[#EDE7D9] flex items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-md bg-[#C9A227] flex items-center justify-center text-[#101826] font-serif font-bold text-xl mx-auto mb-3">F</div>
          <div className="font-serif text-2xl">Folio</div>
          <div className="text-[11px] uppercase tracking-widest text-[#8A93A3] mt-1">Control de financiamiento</div>
        </div>

        <div className="flex rounded-full bg-[#1A2333] p-1 text-xs mb-4">
          <button type="button" onClick={() => { setModo("cliente"); setError(""); }} className={`flex-1 py-1.5 rounded-full transition ${modo === "cliente" ? "bg-[#C9A227] text-[#101826] font-medium" : "text-[#8A93A3]"}`}>Soy cliente</button>
          <button type="button" onClick={() => { setModo("staff"); setError(""); }} className={`flex-1 py-1.5 rounded-full transition ${modo === "staff" ? "bg-[#C9A227] text-[#101826] font-medium" : "text-[#8A93A3]"}`}>Soy inmobiliaria</button>
        </div>

        {modo === "cliente" ? (
          <form onSubmit={ingresarCliente} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-5 space-y-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">Tu código de acceso</span>
              <input type="text" inputMode="numeric" placeholder="Ej. 384729" required value={codigo} onChange={(e) => setCodigo(e.target.value)} className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm tracking-widest focus:outline-none focus:border-[#C9A227]" />
            </label>
            {error && <div className="text-xs text-red-400">{error}</div>}
            <button type="submit" disabled={cargando} className="w-full bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2.5 rounded-md">
              {cargando ? "Entrando..." : "Iniciar sesión"}
            </button>
            <p className="text-[11px] text-[#8A93A3] text-center">Tu código te lo dio la inmobiliaria. Si lo perdiste, pídeles que te lo regeneren.</p>
          </form>
        ) : (
          <form onSubmit={ingresarStaff} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-5 space-y-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">Correo</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]" />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">Contraseña</span>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]" />
            </label>
            {error && <div className="text-xs text-red-400">{error}</div>}
            <button type="submit" disabled={cargando} className="w-full bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2.5 rounded-md">
              {cargando ? "Entrando..." : "Iniciar sesión"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------- App ----------

export default function App() {
  const [sesion, setSesion] = useState(undefined); // undefined = cargando, null = sin sesión
  const [perfil, setPerfil] = useState(null); // { tipo: 'staff'|'cliente', usuario?, propiedadId? }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSesion(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sesion) { setPerfil(null); return; }
    (async () => {
      const uid = sesion.user.id;
      const { data: usuario } = await supabase.from("usuarios").select("*, roles(*)").eq("id", uid).maybeSingle();
      if (usuario) {
        setPerfil({ tipo: "staff", usuario });
        return;
      }
      const { data: propiedad } = await supabase.from("propiedades").select("id").eq("cliente_user_id", uid).maybeSingle();
      if (propiedad) {
        setPerfil({ tipo: "cliente", propiedadId: propiedad.id });
        return;
      }
      setPerfil({ tipo: "sin_acceso" });
    })();
  }, [sesion]);

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
  };

  if (sesion === undefined) return <div className="min-h-screen bg-[#101826]" />;
  if (!sesion) return <Login onIngreso={setSesion} />;
  if (!perfil) return <div className="min-h-screen bg-[#101826] text-[#EDE7D9] flex items-center justify-center text-sm">Cargando tu cuenta...</div>;
  if (perfil.tipo === "sin_acceso") {
    return (
      <div className="min-h-screen bg-[#101826] text-[#EDE7D9] flex flex-col items-center justify-center gap-3 p-5 text-center">
        <div className="text-sm">Tu cuenta inició sesión, pero no está vinculada a ninguna propiedad ni a tu equipo todavía.</div>
        <div className="text-xs text-[#8A93A3]">Pide al administrador que te dé acceso.</div>
        <button onClick={cerrarSesion} className="text-xs bg-[#2A3547] px-3 py-2 rounded-md mt-2">Cerrar sesión</button>
      </div>
    );
  }

  return <AppInterno perfil={perfil} cerrarSesion={cerrarSesion} />;
}

function AppInterno({ perfil, cerrarSesion }) {
  const [proyectos, setProyectos] = useState([]);
  const [propiedades, setPropiedades] = useState([]);
  const [cargado, setCargado] = useState(false);
  const esCliente = perfil.tipo === "cliente";
  const esAdmin = perfil.tipo === "staff" && !!perfil.usuario?.roles?.es_administrador;
  const [modo, setModo] = useState(esCliente ? "cliente" : "inmobiliaria");
  const [proyectoSel, setProyectoSel] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [pantalla, setPantalla] = useState("proyectos");
  const [imprimir, setImprimir] = useState(null);
  const hoy = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!imprimir) return;
    const t = setTimeout(() => window.print(), 80);
    const onAfter = () => setImprimir(null);
    window.addEventListener("afterprint", onAfter);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", onAfter);
    };
  }, [imprimir]);

  useEffect(() => {
    (async () => {
      const { data: proys, error: errProys } = await supabase.from("proyectos").select("*").order("created_at");
      if (errProys) console.error("Error cargando proyectos:", errProys);
      setProyectos((proys || []).map((r) => ({ id: r.id, nombre: r.nombre, ubicacion: r.ubicacion })));

      const { data: props, error: errProps } = await supabase.from("propiedades").select("*").order("created_at");
      if (errProps) console.error("Error cargando propiedades:", errProps);
      const propsList = props || [];

      const idsPropiedades = propsList.map((r) => r.id);
      let cuotasPorPropiedad = {};
      let luzPorPropiedad = {};
      let documentosPorPropiedad = {};
      let notifsPorPropiedad = {};

      if (idsPropiedades.length > 0) {
        const { data: cuotasRows, error: errCuotas } = await supabase
          .from("cuotas").select("*").in("propiedad_id", idsPropiedades).order("numero");
        if (errCuotas) console.error("Error cargando cuotas:", errCuotas);

        // Comprobantes reales (con su imagen en Supabase Storage), para que se vean igual
        // sin importar en qué navegador/dispositivo se esté revisando.
        const idsCuotas = (cuotasRows || []).map((r) => r.id);
        let comprobantesPorCuota = {};
        if (idsCuotas.length > 0) {
          const { data: compRows, error: errComp } = await supabase
            .from("comprobantes").select("*").in("cuota_id", idsCuotas).order("created_at", { ascending: false });
          if (errComp) console.error("Error cargando comprobantes:", errComp);
          for (const row of compRows || []) {
            if (comprobantesPorCuota[row.cuota_id]) continue; // ya tenemos el más reciente de esa cuota
            let imagenUrl = null;
            try {
              const { data: signed } = await supabase.storage.from("comprobantes").createSignedUrl(row.imagen_url, 3600);
              imagenUrl = signed?.signedUrl || null;
            } catch (e) {
              console.error("Error generando enlace del comprobante:", e);
            }
            comprobantesPorCuota[row.cuota_id] = {
              imagen: imagenUrl,
              fecha: row.created_at,
              estado: row.estado,
              montoDepositado: Number(row.monto_depositado),
              moraAlSubir: Number(row.mora_al_subir || 0),
              montoRequerido: Number(row.monto_requerido || 0),
              excedente: Number(row.excedente || 0),
              faltante: Number(row.faltante || 0),
              resultado: row.resultado,
              destinoExcedente: row.destino_excedente,
            };
          }
        }

        (cuotasRows || []).forEach((row) => {
          if (!cuotasPorPropiedad[row.propiedad_id]) cuotasPorPropiedad[row.propiedad_id] = [];
          const fila = cuotaDesdeFila(row);
          fila.comprobante = comprobantesPorCuota[row.id] || null;
          cuotasPorPropiedad[row.propiedad_id].push(fila);
        });

        const { data: luzRows, error: errLuz } = await supabase
          .from("cargos_luz").select("*").in("propiedad_id", idsPropiedades).order("fecha");
        if (errLuz) console.error("Error cargando cargos de luz:", errLuz);
        (luzRows || []).forEach((row) => {
          if (!luzPorPropiedad[row.propiedad_id]) luzPorPropiedad[row.propiedad_id] = [];
          luzPorPropiedad[row.propiedad_id].push(cargoLuzDesdeFila(row));
        });

        const { data: docRows, error: errDocs } = await supabase
          .from("documentos").select("*").in("propiedad_id", idsPropiedades).order("created_at");
        if (errDocs) console.error("Error cargando documentos:", errDocs);
        (docRows || []).forEach((row) => {
          if (!documentosPorPropiedad[row.propiedad_id]) documentosPorPropiedad[row.propiedad_id] = [];
          documentosPorPropiedad[row.propiedad_id].push(documentoDesdeFila(row));
        });

        const { data: notifRows, error: errNotifs } = await supabase
          .from("notificaciones").select("*").in("propiedad_id", idsPropiedades).order("created_at", { ascending: false });
        if (errNotifs) console.error("Error cargando notificaciones:", errNotifs);
        (notifRows || []).forEach((row) => {
          if (!notifsPorPropiedad[row.propiedad_id]) notifsPorPropiedad[row.propiedad_id] = [];
          notifsPorPropiedad[row.propiedad_id].push(notifDesdeFila(row));
        });
      }

      const lista = [];
      for (const row of propsList) {
        const base = propiedadDesdeFila(row);
        const mapaComprobantes = cargarComprobantesLocal(base.id);
        let tabla = cuotasPorPropiedad[base.id];
        if (!tabla || tabla.length === 0) {
          // Propiedad sin cuotas en Supabase todavía (por ejemplo, creada antes de este paso) — se generan y se guardan.
          tabla = generarTabla(base);
          await sincronizarCuotas(base.id, tabla);
        }
        tabla = fusionarComprobantes(tabla, mapaComprobantes);
        lista.push({
          ...base,
          tabla,
          cargosLuz: luzPorPropiedad[base.id] || [],
          documentos: documentosPorPropiedad[base.id] || [],
          notificaciones: notifsPorPropiedad[base.id] || [],
        });
      }
      setPropiedades(lista);
      setCargado(true);
    })();
  }, []);

  const proySel = proyectos.find((p) => p.id === proyectoSel);
  const propSel = propiedades.find((p) => p.id === seleccion);
  const propiedadesDelProyecto = propiedades.filter((p) => p.proyectoId === proyectoSel);

  const actualizarProp = (id, fn) => {
    setPropiedades((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const actualizado = fn(structuredClone(p));
        guardarComprobantesLocal(id, actualizado.tabla);
        supabase.from("propiedades").update(propiedadHaciaFila(actualizado)).eq("id", id).then(({ error }) => {
          if (error) console.error("Error guardando propiedad en Supabase:", error);
        });
        sincronizarCuotas(id, actualizado.tabla).catch((err) => console.error("Error guardando cuotas en Supabase:", err));
        sincronizarCargosLuz(id, actualizado.cargosLuz).catch((err) => console.error("Error guardando cargos de luz:", err));
        sincronizarNotificaciones(id, actualizado.notificaciones).catch((err) => console.error("Error guardando notificaciones:", err));
        return actualizado;
      })
    );
  };

  const crearProyecto = async (datos) => {
    const { data, error } = await supabase.from("proyectos").insert({ nombre: datos.nombre, ubicacion: datos.ubicacion }).select().single();
    if (error) { alert("No se pudo crear el proyecto: " + error.message); return; }
    setProyectos((prev) => [...prev, { id: data.id, nombre: data.nombre, ubicacion: data.ubicacion }]);
    setProyectoSel(data.id);
    setPantalla("propiedades");
  };

  const crearPropiedad = async (datos) => {
    const fila = {
      proyecto_id: proyectoSel,
      folio: datos.folio,
      direccion: datos.direccion,
      cliente_nombre: datos.cliente,
      telefono: datos.telefono,
      precio: datos.precio,
      enganche: datos.enganche,
      tasa_anual: datos.tasaAnual,
      plazo_anios: datos.plazoAnios,
      fecha_inicio: datos.fechaInicio,
      dias_gracia: datos.diasGracia,
      mora_diaria: datos.moraDiaria,
      dias_gracia_luz: datos.diasGraciaLuz,
      mora_diaria_luz: datos.moraDiariaLuz,
      aplica_luz: !!datos.aplicaLuz,
      monto_luz_mensual: datos.montoLuzMensual || 0,
      saldo_a_favor: 0,
    };
    const { data, error } = await supabase.from("propiedades").insert(fila).select().single();
    if (error) { alert("No se pudo crear la propiedad: " + error.message); return; }
    const nueva = propiedadDesdeFila(data);
    nueva.cargosLuz = [];
    nueva.notificaciones = [];
    nueva.documentos = [];
    nueva.tabla = generarTabla(nueva);
    await sincronizarCuotas(nueva.id, nueva.tabla);
    setPropiedades((prev) => [...prev, nueva]);
    setPantalla("propiedades");
  };

  const actualizarProyecto = async (id, datos) => {
    const { error } = await supabase.from("proyectos").update({ nombre: datos.nombre, ubicacion: datos.ubicacion }).eq("id", id);
    if (error) { alert("No se pudo actualizar el proyecto: " + error.message); return; }
    setProyectos((prev) => prev.map((p) => (p.id === id ? { ...p, ...datos } : p)));
  };

  if (!cargado) return <div className="min-h-screen bg-[#101826]" />;

  return (
    <>
      <div className="min-h-screen bg-[#101826] text-[#EDE7D9] font-sans print:hidden">
        <TopBar
          modo={modo}
          setModo={esCliente ? null : (m) => { setModo(m); setPantalla("proyectos"); setProyectoSel(null); setSeleccion(null); }}
          cerrarSesion={cerrarSesion}
          esAdmin={esAdmin}
          onEquipo={() => setPantalla("equipo")}
        />

        {modo === "inmobiliaria" && pantalla === "equipo" && (
          <PantallaEquipo onVolver={() => setPantalla("proyectos")} />
        )}

        {modo === "inmobiliaria" && pantalla === "proyectos" && (
          <ListaProyectos
            proyectos={proyectos}
            propiedades={propiedades}
            hoy={hoy}
            onNuevo={() => setPantalla("nuevoProyecto")}
            onAbrir={(id) => { setProyectoSel(id); setPantalla("propiedades"); }}
            onActualizar={actualizarProyecto}
          />
        )}

        {modo === "inmobiliaria" && pantalla === "nuevoProyecto" && (
          <NuevoProyecto onCancelar={() => setPantalla("proyectos")} onCrear={crearProyecto} />
        )}

        {modo === "inmobiliaria" && pantalla === "propiedades" && proySel && (
          <ListaPropiedades
            proyecto={proySel}
            propiedades={propiedadesDelProyecto}
            hoy={hoy}
            onVolver={() => { setPantalla("proyectos"); setProyectoSel(null); }}
            onNueva={() => setPantalla("nuevaPropiedad")}
            onAbrir={(id) => { setSeleccion(id); setPantalla("detalle"); }}
          />
        )}

        {modo === "inmobiliaria" && pantalla === "nuevaPropiedad" && (
          <NuevaPropiedad proyecto={proySel} onCancelar={() => setPantalla("propiedades")} onCrear={crearPropiedad} />
        )}

        {modo === "inmobiliaria" && pantalla === "detalle" && propSel && (
          <DetallePropiedad prop={propSel} hoy={hoy} onVolver={() => setPantalla("propiedades")} actualizar={(fn) => actualizarProp(propSel.id, fn)} />
        )}

        {modo === "cliente" && (
          <VistaCliente
            propiedades={propiedades}
            proyectos={proyectos}
            seleccion={seleccion}
            setSeleccion={setSeleccion}
            hoy={hoy}
            actualizar={(id, fn) => actualizarProp(id, fn)}
            onImprimir={(datos) => setImprimir(datos)}
          />
        )}
      </div>
      {imprimir && <VistaImprimible prop={imprimir.prop} proyecto={imprimir.proyecto} hoy={imprimir.hoy} />}
    </>
  );
}

function TopBar({ modo, setModo, cerrarSesion, esAdmin, onEquipo }) {
  return (
    <div className="border-b border-[#2A3547] bg-[#0C121C] px-5 py-4 sticky top-0 z-10">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-sm bg-[#C9A227] flex items-center justify-center text-[#101826] font-serif font-bold text-sm">F</div>
          <div>
            <div className="font-serif text-lg leading-tight tracking-tight">Folio</div>
            <div className="text-[10px] uppercase tracking-widest text-[#8A93A3] leading-tight">Control de financiamiento</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {setModo && (
            <div className="flex rounded-full bg-[#1A2333] p-1 text-xs">
              <button onClick={() => setModo("inmobiliaria")} className={`px-3 py-1.5 rounded-full transition ${modo === "inmobiliaria" ? "bg-[#C9A227] text-[#101826] font-medium" : "text-[#8A93A3]"}`}>Inmobiliaria</button>
              <button onClick={() => setModo("cliente")} className={`px-3 py-1.5 rounded-full transition ${modo === "cliente" ? "bg-[#C9A227] text-[#101826] font-medium" : "text-[#8A93A3]"}`}>Cliente</button>
            </div>
          )}
          {esAdmin && modo === "inmobiliaria" && (
            <button onClick={onEquipo} title="Equipo y roles" className="text-[#8A93A3] hover:text-[#EDE7D9] p-1.5">
              <Users size={16} />
            </button>
          )}
          <button onClick={cerrarSesion} title="Cerrar sesión" className="text-[#8A93A3] hover:text-[#EDE7D9] p-1.5">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Equipo: usuarios de la inmobiliaria y roles con permisos ----------

const PERMISOS_DISPONIBLES = [
  ["crear_proyectos_propiedades", "Crear proyectos y propiedades"],
  ["aprobar_rechazar_pagos", "Aprobar/rechazar comprobantes de pago"],
  ["condonar_mora", "Condonar mora"],
  ["modificar_condiciones", "Modificar precio/tasa/plazo/mora"],
  ["agregar_cargos_luz", "Agregar cargos de luz"],
  ["subir_documentos", "Subir documentos del contrato"],
  ["ver_reportes", "Ver reportes e historial de moras"],
  ["crear_usuarios", "Crear otros usuarios"],
];

function PantallaEquipo({ onVolver }) {
  const [tab, setTab] = useState("usuarios");
  const [roles, setRoles] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    setCargando(true);
    const { data: rolesData } = await supabase.from("roles").select("*").order("created_at");
    const { data: usuariosData } = await supabase.from("usuarios").select("*, roles(*)").order("created_at");
    setRoles(rolesData || []);
    setUsuarios(usuariosData || []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  return (
    <div className="max-w-3xl mx-auto p-5 pb-24">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onVolver} className="text-[#8A93A3]"><ChevronLeft size={20} /></button>
        <h1 className="font-serif text-2xl">Equipo y roles</h1>
      </div>

      <div className="flex gap-1 mb-4 border-b border-[#2A3547]">
        <button onClick={() => setTab("usuarios")} className={`px-3 py-2 text-xs border-b-2 -mb-px flex items-center gap-1.5 ${tab === "usuarios" ? "border-[#C9A227] text-[#EDE7D9]" : "border-transparent text-[#8A93A3]"}`}><Users size={14} /> Usuarios</button>
        <button onClick={() => setTab("roles")} className={`px-3 py-2 text-xs border-b-2 -mb-px flex items-center gap-1.5 ${tab === "roles" ? "border-[#C9A227] text-[#EDE7D9]" : "border-transparent text-[#8A93A3]"}`}><Shield size={14} /> Roles</button>
      </div>

      {cargando ? (
        <div className="text-sm text-[#8A93A3]">Cargando...</div>
      ) : tab === "usuarios" ? (
        <PestanaUsuarios usuarios={usuarios} roles={roles} onCreado={cargar} />
      ) : (
        <PestanaRoles roles={roles} onCreado={cargar} />
      )}
    </div>
  );
}

function PestanaUsuarios({ usuarios, roles, onCreado }) {
  const [creando, setCreando] = useState(false);
  return (
    <div>
      <button onClick={() => setCreando(true)} className="flex items-center gap-1.5 bg-[#C9A227] text-[#101826] px-3.5 py-2 rounded-md text-sm font-medium mb-4">
        <Plus size={16} /> Nuevo usuario
      </button>
      <div className="space-y-2">
        {usuarios.length === 0 && <div className="text-sm text-[#8A93A3]">Sin usuarios registrados todavía.</div>}
        {usuarios.map((u) => (
          <div key={u.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="text-sm">{u.nombre}</div>
              <div className="text-xs text-[#8A93A3]">{u.email}</div>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-full border border-[#3a4864] text-[#8A93A3] uppercase tracking-wide">{u.roles?.nombre}</span>
          </div>
        ))}
      </div>
      {creando && <ModalNuevoUsuario roles={roles} onCancelar={() => setCreando(false)} onCreado={() => { setCreando(false); onCreado(); }} />}
    </div>
  );
}

function ModalNuevoUsuario({ roles, onCancelar, onCreado }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rolId, setRolId] = useState(roles[0]?.id || "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    setError("");
    setGuardando(true);
    try {
      await llamarGestionUsuarios({ accion: "crear_staff", nombre, email, password, rol_id: rolId });
      onCreado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-5 w-full max-w-sm space-y-3">
        <div className="font-serif text-lg">Nuevo usuario de equipo</div>
        <Campo label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Campo label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo label="Contraseña inicial" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">Rol</span>
          <select value={rolId} onChange={(e) => setRolId(e.target.value)} className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm">
            {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </label>
        {error && <div className="text-xs text-red-400">{error}</div>}
        <div className="flex gap-2">
          <button onClick={onCancelar} className="flex-1 text-xs bg-[#2A3547] py-2 rounded-md">Cancelar</button>
          <button onClick={crear} disabled={guardando || !nombre || !email || !password || !rolId} className="flex-1 text-xs bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded-md">
            {guardando ? "Creando..." : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PestanaRoles({ roles, onCreado }) {
  const [creando, setCreando] = useState(false);
  return (
    <div>
      <button onClick={() => setCreando(true)} className="flex items-center gap-1.5 bg-[#C9A227] text-[#101826] px-3.5 py-2 rounded-md text-sm font-medium mb-4">
        <Plus size={16} /> Nuevo rol
      </button>
      <div className="space-y-3">
        {roles.map((r) => <TarjetaRol key={r.id} rol={r} onActualizado={onCreado} />)}
      </div>
      {creando && <ModalNuevoRol onCancelar={() => setCreando(false)} onCreado={() => { setCreando(false); onCreado(); }} />}
    </div>
  );
}

function TarjetaRol({ rol, onActualizado }) {
  const [editando, setEditando] = useState(false);
  const [permisos, setPermisos] = useState(rol.permisos || {});

  const guardar = async () => {
    await supabase.from("roles").update({ permisos }).eq("id", rol.id);
    setEditando(false);
    onActualizado();
  };

  if (rol.es_administrador) {
    return (
      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-[#C9A227]" />
          <div className="font-serif">{rol.nombre}</div>
        </div>
        <div className="text-xs text-[#8A93A3] mt-1">Tiene todos los permisos siempre. No se puede editar.</div>
      </div>
    );
  }

  return (
    <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-serif">{rol.nombre}</div>
        {!editando && <button onClick={() => setEditando(true)} className="text-xs bg-[#2A3547] px-2.5 py-1.5 rounded-md flex items-center gap-1"><Pencil size={12} /> Editar</button>}
      </div>
      <div className="space-y-1.5">
        {PERMISOS_DISPONIBLES.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" disabled={!editando} checked={!!permisos[key]} onChange={(e) => setPermisos({ ...permisos, [key]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>
      {editando && (
        <div className="flex gap-2 mt-3">
          <button onClick={() => { setPermisos(rol.permisos || {}); setEditando(false); }} className="flex-1 text-xs bg-[#2A3547] py-1.5 rounded-md">Cancelar</button>
          <button onClick={guardar} className="flex-1 text-xs bg-[#C9A227] text-[#101826] font-medium py-1.5 rounded-md">Guardar</button>
        </div>
      )}
    </div>
  );
}

function ModalNuevoRol({ onCancelar, onCreado }) {
  const [nombre, setNombre] = useState("");
  const [permisos, setPermisos] = useState({});
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    setGuardando(true);
    await supabase.from("roles").insert({ nombre, permisos, es_administrador: false });
    setGuardando(false);
    onCreado();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-5 w-full max-w-sm space-y-3">
        <div className="font-serif text-lg">Nuevo rol</div>
        <Campo label="Nombre del rol" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <div className="space-y-1.5">
          {PERMISOS_DISPONIBLES.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={!!permisos[key]} onChange={(e) => setPermisos({ ...permisos, [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancelar} className="flex-1 text-xs bg-[#2A3547] py-2 rounded-md">Cancelar</button>
          <button onClick={crear} disabled={guardando || !nombre} className="flex-1 text-xs bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded-md">
            {guardando ? "Creando..." : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Compara el estado real del crédito (con los abonos a capital ya aplicados) contra cómo
// habría estado si nunca se hubiera hecho ningún abono — para mostrarle al cliente el
// beneficio concreto: cuántas cuotas se ahorró y cuánto menos debe hoy.
function calcularComparativaAbono(prop) {
  const totalAbonado = prop.tabla.reduce((s, f) => s + (f.abono || 0), 0);
  if (totalAbonado <= 0) return null;

  const original = generarTabla(prop); // misma tasa/plazo original, sin abonos
  const idxActual = prop.tabla.findIndex((f) => f.estado !== "pagado");
  const numeroActual = idxActual === -1 ? prop.tabla.length + 1 : prop.tabla[idxActual].numero;
  const filaOriginal = original.find((f) => f.numero === numeroActual) || original[original.length - 1];

  const saldoSinAbono = filaOriginal ? filaOriginal.saldoInicial : 0;
  const saldoConAbono = idxActual === -1 ? 0 : prop.tabla[idxActual].saldoInicial;
  const cuotasExoneradas = Math.max(0, original.length - prop.tabla.length);

  return {
    totalAbonado,
    saldoSinAbono,
    saldoConAbono,
    ahorroSaldo: Math.max(0, saldoSinAbono - saldoConAbono),
    cuotasExoneradas,
    cuotasTotalesOriginal: original.length,
    cuotasTotalesActual: prop.tabla.length,
  };
}

function resumenProp(prop, hoy) {
  const filas = prop.tabla;
  const saldoActual = filas.find((f) => f.estado !== "pagado")?.saldoInicial ?? 0;
  const vencidas = filas.filter((f) => estadoReal(f, hoy, prop.diasGracia) === "vencido");
  const enRevision = filas.filter((f) => f.estado === "revision");
  const moraCredito = filas.reduce((s, f) => s + calcularMoraCredito(f, hoy, prop.diasGracia, prop.moraDiaria), 0);
  const moraLuz = prop.aplicaLuz ? filas.reduce((s, f) => s + calcularMoraLuzCuota(f, hoy, prop.diasGraciaLuz, prop.moraDiariaLuz), 0) : 0;
  const moraTotal = moraCredito + moraLuz;
  const luzPendiente = prop.aplicaLuz ? filas.reduce((s, f) => s + (f.luzPagado ? 0 : (prop.montoLuzMensual || 0)), 0) : 0;
  const proximaCuota = filas.find((f) => f.estado !== "pagado");
  const pendienteActual = proximaCuota ? calcularEstadoPago(proximaCuota, hoy, prop) : null;
  return { saldoActual, vencidas, enRevision, moraCredito, moraLuz, moraTotal, luzPendiente, proximaCuota, pendienteActual };
}

// ---------- Proyectos ----------

function ListaProyectos({ proyectos, propiedades, hoy, onNuevo, onAbrir, onActualizar }) {
  const [editando, setEditando] = useState(null);

  return (
    <div className="max-w-3xl mx-auto p-5 pb-24">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-serif text-2xl">Proyectos</h1>
        <button onClick={onNuevo} className="flex items-center gap-1.5 bg-[#C9A227] text-[#101826] px-3.5 py-2 rounded-md text-sm font-medium">
          <Plus size={16} /> Nuevo proyecto
        </button>
      </div>

      {proyectos.length === 0 && <div className="text-center text-[#8A93A3] mt-16 text-sm">Aún no hay proyectos. Crea el primero para empezar a registrar propiedades.</div>}

      <div className="space-y-3">
        {proyectos.map((proy) => {
          const props = propiedades.filter((p) => p.proyectoId === proy.id);
          const vencidasTotal = props.reduce((s, p) => s + resumenProp(p, hoy).vencidas.length, 0);
          return (
            <div key={proy.id} className="w-full bg-[#161F2E] border border-[#2A3547] rounded-lg p-4 hover:border-[#C9A227]/50 transition flex items-center gap-3">
              <button onClick={() => onAbrir(proy.id)} className="flex items-center gap-3 flex-1 text-left min-w-0">
                <div className="w-11 h-11 rounded-md bg-[#1A2333] flex items-center justify-center shrink-0">
                  <Building2 size={20} className="text-[#C9A227]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-lg truncate">{proy.nombre}</div>
                  <div className="text-sm text-[#8A93A3] truncate">{proy.ubicacion}</div>
                </div>
              </button>
              <div className="text-right text-xs shrink-0">
                <div className="font-mono">{props.length} propiedad{props.length !== 1 ? "es" : ""}</div>
                {vencidasTotal > 0 && <div className="text-red-400 mt-0.5">{vencidasTotal} vencida{vencidasTotal > 1 ? "s" : ""}</div>}
              </div>
              <button onClick={() => setEditando(proy)} className="text-[#8A93A3] hover:text-[#EDE7D9] p-1.5 shrink-0" title="Editar proyecto">
                <Pencil size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {editando && (
        <ModalEditarProyecto
          proyecto={editando}
          onCancelar={() => setEditando(null)}
          onGuardar={(datos) => { onActualizar(editando.id, datos); setEditando(null); }}
        />
      )}
    </div>
  );
}

function ModalEditarProyecto({ proyecto, onCancelar, onGuardar }) {
  const [nombre, setNombre] = useState(proyecto.nombre);
  const [ubicacion, setUbicacion] = useState(proyecto.ubicacion || "");
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-5 w-full max-w-sm">
        <div className="font-serif text-lg mb-3">Editar proyecto</div>
        <div className="space-y-3">
          <Campo label="Nombre del proyecto" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Campo label="Ubicación" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onCancelar} className="flex-1 text-xs bg-[#2A3547] py-2 rounded-md">Cancelar</button>
          <button onClick={() => onGuardar({ nombre, ubicacion })} disabled={!nombre} className="flex-1 text-xs bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded-md">Guardar</button>
        </div>
      </div>
    </div>
  );
}

function NuevoProyecto({ onCancelar, onCrear }) {
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  return (
    <div className="max-w-3xl mx-auto p-5 pb-24">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onCancelar} className="text-[#8A93A3]"><ChevronLeft size={20} /></button>
        <h1 className="font-serif text-2xl">Nuevo proyecto</h1>
      </div>
      <div className="space-y-4">
        <Campo label="Nombre del proyecto" placeholder="Ej. Fraccionamiento Vista Real" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Campo label="Ubicación" placeholder="Ej. Zona 16, Ciudad de Guatemala" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />
        <button disabled={!nombre} onClick={() => onCrear({ nombre, ubicacion })} className="w-full bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-3 rounded-md mt-2">
          Crear proyecto
        </button>
      </div>
    </div>
  );
}

// ---------- Propiedades dentro de un proyecto ----------

function ListaPropiedades({ proyecto, propiedades, hoy, onVolver, onNueva, onAbrir }) {
  return (
    <div className="max-w-3xl mx-auto p-5 pb-24">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onVolver} className="text-[#8A93A3]"><ChevronLeft size={20} /></button>
        <div className="text-[11px] uppercase tracking-widest text-[#8A93A3] flex items-center gap-1"><FolderOpen size={12} /> Proyecto</div>
      </div>
      <div className="flex items-center justify-between mb-5 pl-7">
        <h1 className="font-serif text-2xl">{proyecto.nombre}</h1>
        <button onClick={onNueva} className="flex items-center gap-1.5 bg-[#C9A227] text-[#101826] px-3.5 py-2 rounded-md text-sm font-medium">
          <Plus size={16} /> Nueva
        </button>
      </div>

      {propiedades.length === 0 && <div className="text-center text-[#8A93A3] mt-16 text-sm">Este proyecto aún no tiene propiedades registradas.</div>}

      <div className="space-y-3">
        {propiedades.map((p) => {
          const { saldoActual, vencidas, enRevision, moraTotal, luzPendiente } = resumenProp(p, hoy);
          const alDia = vencidas.length === 0;
          return (
            <button key={p.id} onClick={() => onAbrir(p.id)} className="w-full text-left bg-[#161F2E] border border-[#2A3547] rounded-lg p-4 hover:border-[#C9A227]/50 transition">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#8A93A3]">{p.folio}</div>
                  <div className="font-serif text-lg">{p.direccion}</div>
                  <div className="text-sm text-[#8A93A3]">{p.cliente}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[10px] px-2 py-1 rounded-full border font-medium uppercase tracking-wide ${alDia ? "border-emerald-700 text-emerald-400" : "border-red-800 text-red-400"}`}>
                    {alDia ? "Al día" : `${vencidas.length} vencida${vencidas.length > 1 ? "s" : ""}`}
                  </span>
                  {enRevision.length > 0 && <span className="text-[10px] px-2 py-1 rounded-full border border-amber-700 text-amber-400 font-medium uppercase tracking-wide">{enRevision.length} por revisar</span>}
                </div>
              </div>
              <div className="flex gap-5 mt-3 text-xs font-mono">
                <div><div className="text-[#8A93A3]">Saldo</div><div>{fmt(saldoActual)}</div></div>
                {moraTotal > 0 && <div><div className="text-red-400/80">Mora a pagar</div><div className="text-red-400">{fmt(moraTotal)}</div></div>}
                {luzPendiente > 0 && <div><div className="text-[#8A93A3]">Luz pend.</div><div>{fmt(luzPendiente)}</div></div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NuevaPropiedad({ proyecto, onCancelar, onCrear }) {
  const [f, setF] = useState({
    folio: "", direccion: "", cliente: "", telefono: "",
    precio: "", enganche: "", tasaAnual: "", plazoAnios: "",
    diasGracia: 3, moraDiaria: 100, diasGraciaLuz: 3, moraDiariaLuz: 20,
    aplicaLuz: false, montoLuzMensual: "",
    fechaInicio: new Date().toISOString().slice(0, 10),
  });

  const precioNum = Number(f.precio) || 0;
  const engancheNum = Number(f.enganche) || 0;
  const tasaNum = Number(f.tasaAnual) || 0;
  const plazoNum = Number(f.plazoAnios) || 0;
  const principal = Math.max(0, precioNum - engancheNum);
  const mensualidad = plazoNum > 0 ? pagoMensual(principal, tasaNum, Math.round(plazoNum * 12)) : 0;
  const datosCompletos = f.direccion && f.cliente && precioNum > 0 && tasaNum > 0 && plazoNum > 0;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="max-w-3xl mx-auto p-5 pb-24">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onCancelar} className="text-[#8A93A3]"><ChevronLeft size={20} /></button>
        <div className="text-[11px] uppercase tracking-widest text-[#8A93A3]">{proyecto?.nombre}</div>
      </div>
      <h1 className="font-serif text-2xl mb-5 pl-7">Nuevo contrato</h1>
      <div className="space-y-4">
        <div className="border border-dashed border-[#2A3547] rounded-lg p-4 flex items-start gap-3">
          <Sparkles size={18} className="text-[#6b7280] mt-0.5 shrink-0" />
          <div>
            <div className="text-sm text-[#8A93A3]">Autocompletar con el PDF del contrato (próximamente)</div>
            <p className="text-[11px] text-[#6b7280] mt-1">
              Cuando esta función esté activa, podrás subir el contrato de promesa de compraventa aquí y la IA leerá precio,
              enganche, tasa, plazo y datos del cliente para llenar los campos de abajo automáticamente. Por ahora, complétalos a mano.
            </p>
            <label className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-[#6b7280] border border-dashed border-[#2A3547] rounded-md px-3 py-1.5 cursor-not-allowed">
              <FileText size={12} /> Subir contrato (desactivado)
              <input type="file" disabled className="hidden" />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Folio / Lote" value={f.folio} onChange={set("folio")} />
          <Campo label="Cliente" value={f.cliente} onChange={set("cliente")} />
        </div>
        <Campo label="Dirección" value={f.direccion} onChange={set("direccion")} />
        <Campo label="Teléfono (para avisos)" value={f.telefono} onChange={set("telefono")} />
        <div className="grid grid-cols-2 gap-3">
          <CampoMoneda label="Precio de venta" value={f.precio} onChange={(n) => setF({ ...f, precio: n })} />
          <CampoMoneda label="Enganche" value={f.enganche} onChange={(n) => setF({ ...f, enganche: n })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Tasa anual %" type="number" value={f.tasaAnual} onChange={set("tasaAnual")} />
          <Campo label="Plazo (años)" type="number" value={f.plazoAnios} onChange={set("plazoAnios")} />
        </div>
        <Campo label="Fecha de inicio" type="date" value={f.fechaInicio} onChange={set("fechaInicio")} />

        <div className="border-t border-[#2A3547] pt-4">
          <div className="text-[11px] uppercase tracking-wide text-[#8A93A3] mb-2.5">Mora del crédito</div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Días de gracia" type="number" value={f.diasGracia} onChange={set("diasGracia")} />
            <CampoMoneda label="Mora diaria" value={f.moraDiaria} onChange={(n) => setF({ ...f, moraDiaria: n })} />
          </div>
          <p className="text-[11px] text-[#8A93A3] mt-1.5">Durante los días de gracia no se cobra mora. Al pasar ese plazo, se cobra este monto fijo por cada día de atraso.</p>
        </div>

        <div className="border-t border-[#2A3547] pt-4">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿Se cobra luz en esta propiedad?</span>
            <input type="checkbox" checked={f.aplicaLuz} onChange={(e) => setF({ ...f, aplicaLuz: e.target.checked })} className="w-4 h-4 accent-[#C9A227]" />
          </label>

          {f.aplicaLuz && (
            <div className="mt-3 space-y-3">
              <CampoMoneda label="Monto mensual de luz" value={f.montoLuzMensual} onChange={(n) => setF({ ...f, montoLuzMensual: n })} />
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Días de gracia (luz)" type="number" value={f.diasGraciaLuz} onChange={set("diasGraciaLuz")} />
                <CampoMoneda label="Mora diaria (luz)" value={f.moraDiariaLuz} onChange={(n) => setF({ ...f, moraDiariaLuz: n })} />
              </div>
              <p className="text-[11px] text-[#8A93A3]">Este monto se agregará automáticamente a cada cuota, junto con su propia mora si no se paga a tiempo.</p>
            </div>
          )}
        </div>

        <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4 flex items-center gap-3">
          <Calculator size={18} className="text-[#C9A227]" />
          <div>
            <div className="text-xs text-[#8A93A3]">Monto a financiar: {plazoNum > 0 ? fmt(principal) : "—"}</div>
            <div className="font-mono text-lg">{plazoNum > 0 ? fmt(mensualidad) : "—"} <span className="text-xs text-[#8A93A3]">/ mes</span></div>
          </div>
        </div>

        <p className="text-[11px] text-[#8A93A3] flex items-center gap-1.5"><Lock size={12} /> Estos datos de mora se podrán modificar después confirmando tu contraseña.</p>

        <button
          disabled={!datosCompletos}
          onClick={() => onCrear({ ...f, precio: precioNum, enganche: engancheNum, tasaAnual: tasaNum, plazoAnios: plazoNum, montoLuzMensual: Number(f.montoLuzMensual) || 0 })}
          className="w-full bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-3 rounded-md mt-2"
        >
          Generar tabla de pagos
        </button>
      </div>
    </div>
  );
}

function Campo({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">{label}</span>
      <input {...props} className="w-full mt-1 bg-[#161F2E] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]" />
    </label>
  );
}

// Campo de dinero: muestra el número con comas de miles mientras el usuario escribe,
// para que no se confunda si está poniendo cientos, miles o millones.
function CampoMoneda({ label, value, onChange, placeholder, disabled }) {
  const formatear = (n) => (n || n === 0) && n !== "" ? Number(n).toLocaleString("es-GT", { maximumFractionDigits: 2 }) : "";
  const [texto, setTexto] = useState(formatear(value));

  const manejarCambio = (e) => {
    let crudo = e.target.value.replace(/[^0-9.]/g, "");
    const partes = crudo.split(".");
    if (partes.length > 2) crudo = partes[0] + "." + partes.slice(1).join("");
    let [enteroStr, decimalStr] = crudo.split(".");
    if (decimalStr !== undefined) decimalStr = decimalStr.slice(0, 2);

    const numero = crudo === "" || crudo === "." ? 0 : parseFloat(crudo.endsWith(".") ? crudo.slice(0, -1) : crudo) || 0;
    const enteroFormateado = enteroStr === "" ? "" : parseInt(enteroStr || "0", 10).toLocaleString("es-GT");
    const nuevoTexto = decimalStr !== undefined ? `${enteroFormateado}.${decimalStr}` : crudo.endsWith(".") ? `${enteroFormateado}.` : enteroFormateado;

    setTexto(nuevoTexto);
    onChange(numero);
  };

  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">{label}</span>
      <div className="relative mt-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A93A3] text-sm">Q</span>
        <input
          type="text"
          inputMode="decimal"
          value={texto}
          onChange={manejarCambio}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full bg-[#161F2E] border border-[#2A3547] rounded-md pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227] disabled:opacity-40"
        />
      </div>
    </label>
  );
}

// ---------- Modal de confirmación con contraseña ----------

function ModalPin({ onCancelar, onExito }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [enviandoReset, setEnviandoReset] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);

  const confirmar = async () => {
    setError("");
    setVerificando(true);
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email;
    if (!email) { setError("No se pudo confirmar tu sesión. Intenta cerrar sesión y volver a entrar."); setVerificando(false); return; }
    const { error: errAuth } = await supabase.auth.signInWithPassword({ email, password });
    setVerificando(false);
    if (errAuth) { setError("Contraseña incorrecta."); return; }
    onExito();
  };

  const olvidoContrasena = async () => {
    setEnviandoReset(true);
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email;
    if (email) {
      await supabase.auth.resetPasswordForEmail(email);
      setResetEnviado(true);
    }
    setEnviandoReset(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-5 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-3">
          <Lock size={16} className="text-[#C9A227]" />
          <div className="font-serif text-lg">Confirma tu contraseña</div>
        </div>
        <p className="text-xs text-[#8A93A3] mb-3">Para modificar esto, escribe la contraseña de tu cuenta.</p>
        <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm mb-2 focus:outline-none focus:border-[#C9A227]" />
        {error && <div className="text-xs text-red-400 mb-2">{error}</div>}

        {resetEnviado ? (
          <div className="text-xs text-emerald-400 mb-2">Te enviamos un correo para restablecer tu contraseña. Revisa tu bandeja de entrada.</div>
        ) : (
          <button onClick={olvidoContrasena} disabled={enviandoReset} className="text-[11px] text-[#8A93A3] underline mb-2">
            {enviandoReset ? "Enviando..." : "¿Olvidaste tu contraseña? Enviarme un correo para restablecerla"}
          </button>
        )}

        <div className="flex gap-2 mt-2">
          <button onClick={onCancelar} className="flex-1 text-xs bg-[#2A3547] hover:bg-[#3a4864] py-2 rounded-md">Cancelar</button>
          <button onClick={confirmar} disabled={verificando || !password} className="flex-1 text-xs bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded-md">
            {verificando ? "Verificando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Ventana deslizante de la tabla (3 atrás / 3 adelante + botones "+") ----------

function useVentana(tabla) {
  const [extraAnt, setExtraAnt] = useState(0);
  const [extraSig, setExtraSig] = useState(0);
  const cursor = tabla.findIndex((f) => f.estado !== "pagado");
  const cursorIdx = cursor === -1 ? tabla.length : cursor;
  const pasadas = tabla.slice(0, cursorIdx);
  const futuras = tabla.slice(cursorIdx);
  const nAnt = 3 + extraAnt;
  const nSig = 3 + extraSig;
  const visiblesAnt = pasadas.slice(Math.max(0, pasadas.length - nAnt));
  const visiblesSig = futuras.slice(0, nSig);
  const hayMasAnt = pasadas.length > nAnt;
  const hayMasSig = futuras.length > nSig;
  return { visiblesAnt, visiblesSig, hayMasAnt, hayMasSig, setExtraAnt, setExtraSig };
}

function BotonMas({ onClick, texto, direccion }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-center gap-1.5 text-xs text-[#C9A227] py-2 border border-dashed border-[#2A3547] rounded-md hover:border-[#C9A227]/50">
      {direccion === "arriba" && <ChevronUp size={14} />}
      {texto}
      {direccion === "abajo" && <ChevronDown size={14} />}
    </button>
  );
}

// Fila de detalle numérico reutilizada en admin y cliente
function DetalleFila({ f, mora, prop, hoy }) {
  const luzMora = prop?.aplicaLuz ? calcularMoraLuzCuota(f, hoy, prop.diasGraciaLuz, prop.moraDiariaLuz) : 0;
  return (
    <div className="grid grid-cols-4 gap-2 mt-2.5 pt-2.5 border-t border-[#2A3547] text-[11px]">
      <div><div className="text-[#8A93A3]">Capital</div><div className="font-mono">{fmt(f.capital)}</div></div>
      <div><div className="text-[#8A93A3]">Interés</div><div className="font-mono">{fmt(f.interes)}</div></div>
      <div><div className="text-[#8A93A3]">Saldo restante</div><div className="font-mono">{fmt(f.saldoFinal)}</div></div>
      <div>
        <div className="text-[#8A93A3]">Mora</div>
        <div className={`font-mono ${mora > 0 ? "text-red-400" : "text-emerald-400"}`}>{mora > 0 ? fmt(mora) : "Sin mora"}</div>
      </div>
      {prop?.aplicaLuz && (
        <div className="col-span-4 flex items-center justify-between bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 mt-1">
          <span className="flex items-center gap-1.5 text-[#8A93A3]"><Zap size={12} className="text-[#C9A227]" /> Luz de este mes: <span className="font-mono text-[#EDE7D9]">{fmt(prop.montoLuzMensual)}</span></span>
          {f.luzPagado ? (
            <span className="text-emerald-400">Pagada</span>
          ) : (
            <span className="text-red-400">{luzMora > 0 ? `Pendiente + ${fmt(luzMora)} mora` : "Pendiente"}</span>
          )}
        </div>
      )}
      {f.abono > 0 && (
        <div className="col-span-4 -mt-0.5">
          <span className="text-[#C9A227]">Abono a capital aplicado: {fmt(f.abono)}</span>
        </div>
      )}
      {f.moraCondonada > 0 && (
        <div className="col-span-4 -mt-0.5">
          <span className="text-emerald-400">Mora condonada: {fmt(f.moraCondonada)}</span>
        </div>
      )}
      {f.estado === "parcial" && (
        <div className="col-span-4 -mt-0.5">
          <span className="text-red-400">Pago parcial recibido: {fmt(f.montoPagadoAcumulado || 0)} de {fmt(f.pago)} — falta {fmt(Math.max(0, f.pago - (f.montoPagadoAcumulado || 0)))}</span>
        </div>
      )}
    </div>
  );
}

// ---------- Vista Inmobiliaria: detalle de propiedad ----------

function DetallePropiedad({ prop, hoy, onVolver, actualizar }) {
  const [tab, setTab] = useState("tabla");
  const [abonoMonto, setAbonoMonto] = useState(0);
  const [imagenAmpliada, setImagenAmpliada] = useState(null);
  const [pidiendoPin, setPidiendoPin] = useState(null); // null | 'condiciones' | idx (número, para condonar)
  const [condicionesDesbloqueadas, setCondicionesDesbloqueadas] = useState(false);
  const [condForm, setCondForm] = useState(null);
  const [condonarIdx, setCondonarIdx] = useState(null);
  const [condonoMonto, setCondonoMonto] = useState("");
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [generandoCodigo, setGenerandoCodigo] = useState(false);
  const [codigoGenerado, setCodigoGenerado] = useState(null);
  const [errorCodigo, setErrorCodigo] = useState("");

  const generarCodigoCliente = async () => {
    setErrorCodigo("");
    setGenerandoCodigo(true);
    const codigo = generarCodigoNumerico();
    try {
      if (prop.clienteUserId) {
        await llamarGestionUsuarios({ accion: "regenerar_codigo_cliente", codigo, cliente_user_id: prop.clienteUserId });
      } else {
        await llamarGestionUsuarios({ accion: "crear_cliente", codigo, propiedad_id: prop.id });
      }
      setCodigoGenerado(codigo);
    } catch (e) {
      setErrorCodigo(e.message);
    } finally {
      setGenerandoCodigo(false);
    }
  };
  const [corrigiendoIdx, setCorrigiendoIdx] = useState(null);
  const [fechaCorregida, setFechaCorregida] = useState("");
  const [previewCorregido, setPreviewCorregido] = useState(null);
  const [destinoCorregido, setDestinoCorregido] = useState(null);

  const { saldoActual, moraCredito, moraLuz, moraTotal, luzPendiente } = resumenProp(prop, hoy);
  const ventana = useVentana(prop.tabla);

  const marcarPagado = (idx) => {
    actualizar((p) => {
      const fila = p.tabla[idx];
      const mora = calcularMoraCredito(fila, hoy, p.diasGracia, p.moraDiaria);
      fila.moraGeneradaFinal = calcularMoraGenerada(fila, hoy, p.diasGracia, p.moraDiaria);
      fila.moraPagada = (fila.moraPagada || 0) + mora;
      fila.estado = "pagado";
      fila.fechaPago = hoy;
      fila.montoPagadoAcumulado = fila.pago;
      fila.moraAplicada = fila.moraPagada;
      if (p.aplicaLuz && !fila.luzPagado) {
        const luzMora = calcularMoraLuzCuota(fila, hoy, p.diasGraciaLuz, p.moraDiariaLuz);
        fila.luzMoraPagada = (fila.luzMoraPagada || 0) + luzMora;
        fila.luzPagado = true;
        fila.luzFechaPago = hoy;
      }
      return p;
    });
  };

  const aprobarComprobante = (idx) => {
    const numero = prop.tabla[idx].numero;
    actualizarEstadoComprobanteBD(prop.id, numero, "aprobado").catch((err) => console.error(err));
    actualizar((p) => {
      const fila = p.tabla[idx];
      const c = fila.comprobante;
      if (!c) return p;

      const { restante, idxDetenido } = aplicarPagoCascada(p.tabla, idx, c.montoDepositado, hoy, p);

      if (fila.estado !== "pagado" && fila.estado !== "parcial") {
        // la fila objetivo no cambió de estado dentro de la cascada (caso raro), la dejamos consistente
        fila.estado = "pendiente";
      }

      if (restante > 0.009) {
        // ya no quedan meses atrasados por cubrir: el sobrante sigue el destino que eligió el cliente
        if (c.destinoExcedente === "abono") {
          p.tabla = recalcularConAbono(p.tabla, idxDetenido - 1, restante, p.tasaAnual);
        } else {
          p.saldoAFavor = (p.saldoAFavor || 0) + restante;
        }
      }

      p.notificaciones = p.notificaciones || [];
      if (fila.estado === "parcial") {
        p.notificaciones.unshift(nuevaNotificacion("cliente", `Recibimos tu pago parcial de la cuota #${fila.numero}. Aún falta ${fmt(Math.max(0, fila.pago - (fila.montoPagadoAcumulado || 0)))}.`));
      } else {
        p.notificaciones.unshift(nuevaNotificacion("cliente", `Tu pago de la cuota #${fila.numero} fue confirmado. ¡Gracias!`));
      }
      if (c) c.estado = "aprobado";
      return p;
    });
  };

  const rechazarComprobante = (idx) => {
    const numero = prop.tabla[idx].numero;
    actualizarEstadoComprobanteBD(prop.id, numero, "rechazado").catch((err) => console.error(err));
    actualizar((p) => {
      const fila = p.tabla[idx];
      fila.estado = "pendiente";
      fila.comprobante = null;
      fila.ultimoRechazo = { fecha: hoy };
      p.notificaciones = p.notificaciones || [];
      p.notificaciones.unshift(nuevaNotificacion("cliente", `Tu comprobante de la cuota #${fila.numero} fue rechazado. Por favor sube uno nuevo o contáctanos.`));
      return p;
    });
  };

  const aplicarAbono = () => {
    const monto = Number(abonoMonto);
    if (!monto || monto <= 0) return;
    actualizar((p) => {
      const idx = p.tabla.findIndex((f) => f.estado !== "pagado");
      if (idx === -1) return p;
      p.tabla = recalcularConAbono(p.tabla, idx, monto, p.tasaAnual);
      return p;
    });
    setAbonoMonto(0);
  };

  const [subiendoContrato, setSubiendoContrato] = useState(false);

  const subirDocumentos = async (files) => {
    if (!files || files.length === 0) return;
    setSubiendoContrato(true);
    try {
      const nuevos = [];
      for (const file of Array.from(files)) {
        const doc = await subirDocumentoStorage(prop.id, file);
        if (doc) nuevos.push(doc);
      }
      if (nuevos.length > 0) {
        actualizar((p) => {
          p.documentos = [...(p.documentos || []), ...nuevos];
          return p;
        });
      }
    } finally {
      setSubiendoContrato(false);
    }
  };

  const eliminarDocumento = async (doc) => {
    await eliminarDocumentoStorage(doc.id, doc.archivoUrl);
    actualizar((p) => {
      p.documentos = (p.documentos || []).filter((d) => d.id !== doc.id);
      return p;
    });
  };

  const abrirCondiciones = () => { if (!condicionesDesbloqueadas) setPidiendoPin("condiciones"); };

  const abrirCondonar = (idx) => { setPidiendoPin(idx); };

  const abrirCorreccion = (idx) => {
    const c = prop.tabla[idx].comprobante;
    setCorrigiendoIdx(idx);
    setFechaCorregida((c.fecha || hoy).slice(0, 10));
    setPreviewCorregido(null);
    setDestinoCorregido(null);
  };

  const recalcularConFecha = (idx) => {
    const fila = prop.tabla[idx];
    const c = fila.comprobante;
    const resultado = calcularResultadoPago(fila, prop, fechaCorregida, c.montoDepositado);
    setPreviewCorregido(resultado);
    setDestinoCorregido(null);
  };

  const guardarCorreccion = (idx) => {
    if (!previewCorregido) return;
    const necesitaDestino = previewCorregido.resultado === "excedente" && previewCorregido.aTiempo;
    if (necesitaDestino && !destinoCorregido) return;
    actualizar((p) => {
      const fila = p.tabla[idx];
      const c = fila.comprobante;
      c.fecha = `${fechaCorregida}T00:00:00.000Z`;
      c.moraAlSubir = previewCorregido.moraAlSubir;
      c.montoRequerido = previewCorregido.montoRequerido;
      c.excedente = previewCorregido.excedente;
      c.faltante = previewCorregido.faltante;
      c.resultado = previewCorregido.resultado;
      c.destinoExcedente = previewCorregido.resultado === "excedente" ? (previewCorregido.aTiempo ? destinoCorregido : "creditoSiguiente") : null;
      return p;
    });
    setCorrigiendoIdx(null);
    setPreviewCorregido(null);
    setDestinoCorregido(null);
  };

  const confirmarCondonacion = () => {
    const monto = Number(condonoMonto);
    if (!monto || monto <= 0 || condonarIdx == null) return;
    actualizar((p) => {
      const fila = p.tabla[condonarIdx];
      const pendienteAntes = calcularMoraCredito(fila, hoy, p.diasGracia, p.moraDiaria);
      const aplicar = Math.min(monto, pendienteAntes);
      fila.moraCondonada = (fila.moraCondonada || 0) + aplicar;
      const cuotaPendiente = Math.max(0, fila.pago - (fila.montoPagadoAcumulado || 0));
      const moraPendienteNueva = calcularMoraCredito(fila, hoy, p.diasGracia, p.moraDiaria);
      if (cuotaPendiente <= 0.01 && moraPendienteNueva <= 0.01 && fila.estado !== "pagado") {
        fila.moraGeneradaFinal = calcularMoraGenerada(fila, hoy, p.diasGracia, p.moraDiaria);
        fila.estado = "pagado";
        fila.fechaPago = hoy;
        fila.moraAplicada = fila.moraPagada;
      }
      p.notificaciones = p.notificaciones || [];
      p.notificaciones.unshift(nuevaNotificacion("cliente", `Se te condonó ${fmt(aplicar)} de mora de la cuota #${fila.numero}.`));
      return p;
    });
    setCondonarIdx(null);
    setCondonoMonto("");
  };

  const hayPagosRegistrados = prop.tabla.some((f) => f.estado === "pagado");

  const guardarCondiciones = () => {
    actualizar((p) => {
      p.diasGracia = Number(condForm.diasGracia);
      p.moraDiaria = Number(condForm.moraDiaria);
      p.diasGraciaLuz = Number(condForm.diasGraciaLuz);
      p.moraDiariaLuz = Number(condForm.moraDiariaLuz);
      p.aplicaLuz = !!condForm.aplicaLuz;
      p.montoLuzMensual = Number(condForm.montoLuzMensual) || 0;
      if (!hayPagosRegistrados) {
        p.precio = Number(condForm.precio);
        p.enganche = Number(condForm.enganche);
        p.tasaAnual = Number(condForm.tasaAnual);
        p.plazoAnios = Number(condForm.plazoAnios);
        p.tabla = generarTabla(p);
      }
      return p;
    });
    setCondicionesDesbloqueadas(false);
    setCondForm(null);
  };

  const notifsAdmin = (prop.notificaciones || []).filter((n) => n.para === "inmobiliaria");

  const renderFila = (f, idx) => {
    const est = estadoReal(f, hoy, prop.diasGracia);
    const mora = calcularMoraCredito(f, hoy, prop.diasGracia, prop.moraDiaria);
    return (
      <div key={idx} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-[#8A93A3] font-mono">#{f.numero} · {fmtDate(f.fecha)}</div>
            <div className="font-mono text-sm">{fmt(f.pago)}</div>
            {f.ultimoRechazo && est !== "pagado" && est !== "revision" && <div className="text-[11px] text-red-400/80">último comprobante rechazado</div>}
          </div>
          <div className="flex items-center gap-2">
            <Badge estado={est} />
            {mora > 0 && est !== "pagado" && condonarIdx !== idx && (
              <button onClick={() => abrirCondonar(idx)} className="text-xs bg-[#2A3547] hover:bg-[#3a4864] px-2.5 py-1.5 rounded-md">Perdonar mora</button>
            )}
            {(est === "vencido" || est === "pendiente" || est === "gracia" || est === "parcial") && (
              <button onClick={() => marcarPagado(idx)} className="text-xs bg-[#2A3547] hover:bg-[#3a4864] px-2.5 py-1.5 rounded-md">Marcar pagado</button>
            )}
          </div>
        </div>

        {condonarIdx === idx && (
          <div className="mt-2.5 pt-2.5 border-t border-[#2A3547] flex items-center gap-2">
            <Lock size={13} className="text-[#C9A227] shrink-0" />
            <input type="number" value={condonoMonto} onChange={(e) => setCondonoMonto(e.target.value)} className="flex-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#C9A227]" />
            <button onClick={() => { setCondonarIdx(null); setCondonoMonto(""); }} className="text-xs bg-[#2A3547] px-2.5 py-1.5 rounded-md">Cancelar</button>
            <button onClick={confirmarCondonacion} className="text-xs bg-[#C9A227] text-[#101826] font-medium px-2.5 py-1.5 rounded-md">Confirmar</button>
          </div>
        )}

        <DetalleFila f={f} mora={mora} prop={prop} hoy={hoy} />

        {est === "revision" && f.comprobante && (
          <div className="mt-3 pt-3 border-t border-[#2A3547]">
            <div className="flex items-center gap-3">
              <button onClick={() => setImagenAmpliada(f.comprobante.imagen)} className="shrink-0">
                <img src={f.comprobante.imagen} alt="Comprobante" className="w-16 h-16 object-cover rounded-md border border-[#2A3547]" />
              </button>
              <div className="flex-1">
                <div className="text-[11px] text-[#8A93A3] mb-1">Comprobante subido {fmtDateTime(f.comprobante.fecha)}</div>
                <div className="text-xs font-mono">Depositó {fmt(f.comprobante.montoDepositado)}</div>
                {f.comprobante.resultado === "parcial" && (
                  <div className="text-[11px] text-blue-300">Pago parcial — faltarían {fmt(f.comprobante.faltante)}</div>
                )}
                {f.comprobante.resultado === "excedente" && (
                  <div className="text-[11px] text-[#C9A227]">
                    Excedente de {fmt(f.comprobante.excedente)} → {f.comprobante.destinoExcedente === "abono" ? "el cliente eligió abono a capital" : "queda como saldo a favor"}
                  </div>
                )}
                {f.comprobante.resultado === "completo" && <div className="text-[11px] text-emerald-400">Cubre exactamente lo que debía</div>}
              </div>
            </div>

            {corrigiendoIdx !== idx ? (
              <button onClick={() => abrirCorreccion(idx)} className="mt-2 text-[11px] text-[#8A93A3] underline">
                ¿El cliente pagó antes de esta fecha? Corregir fecha del depósito
              </button>
            ) : (
              <div className="mt-2.5 pt-2.5 border-t border-[#2A3547] space-y-2">
                <div className="text-[11px] text-[#8A93A3]">Fecha real en que el cliente depositó:</div>
                <div className="flex gap-2">
                  <input type="date" value={fechaCorregida} onChange={(e) => { setFechaCorregida(e.target.value); setPreviewCorregido(null); }} className="flex-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#C9A227]" />
                  <button onClick={() => recalcularConFecha(idx)} className="text-xs bg-[#2A3547] hover:bg-[#3a4864] px-2.5 py-1.5 rounded-md">Recalcular</button>
                </div>

                {previewCorregido && (
                  <div className="bg-[#0C121C] border border-[#2A3547] rounded-md p-2.5 text-[11px] space-y-1.5">
                    <div className="text-[#8A93A3]">
                      Con esa fecha, el pago {previewCorregido.aTiempo ? <span className="text-emerald-400">llegó a tiempo</span> : <span className="text-red-400">seguiría llegando tarde</span>}.
                    </div>
                    {previewCorregido.resultado === "excedente" && previewCorregido.aTiempo && (
                      <div className="space-y-1.5">
                        <div className="text-[#C9A227]">Hay un excedente de {fmt(previewCorregido.excedente)}. ¿Qué hacer con él?</div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name={`destino-correccion-${idx}`} checked={destinoCorregido === "abono"} onChange={() => setDestinoCorregido("abono")} />
                          Abonarlo a capital
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name={`destino-correccion-${idx}`} checked={destinoCorregido === "creditoSiguiente"} onChange={() => setDestinoCorregido("creditoSiguiente")} />
                          Dejarlo como crédito para la siguiente cuota
                        </label>
                      </div>
                    )}
                    {previewCorregido.resultado === "parcial" && <div className="text-blue-300">Con esa fecha, faltarían {fmt(previewCorregido.faltante)}.</div>}
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => { setCorrigiendoIdx(null); setPreviewCorregido(null); }} className="flex-1 text-xs bg-[#2A3547] py-1.5 rounded-md">Cancelar</button>
                  <button
                    onClick={() => guardarCorreccion(idx)}
                    disabled={!previewCorregido || (previewCorregido.resultado === "excedente" && previewCorregido.aTiempo && !destinoCorregido)}
                    className="flex-1 text-xs bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-1.5 rounded-md"
                  >
                    Guardar corrección
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-2.5">
              <button onClick={() => aprobarComprobante(idx)} className="flex-1 text-xs bg-emerald-800 hover:bg-emerald-700 px-2.5 py-1.5 rounded-md">Aprobar</button>
              <button onClick={() => rechazarComprobante(idx)} className="flex-1 text-xs bg-red-900 hover:bg-red-800 px-2.5 py-1.5 rounded-md">Rechazar</button>
            </div>
            <button disabled title="Se activará cuando la app esté en la nube" className="mt-2.5 w-full flex items-center justify-center gap-1.5 text-[11px] text-[#6b7280] border border-dashed border-[#2A3547] rounded-md py-1.5 cursor-not-allowed">
              <Sparkles size={12} /> Leer comprobante con IA (próximamente)
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto p-5 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onVolver} className="text-[#8A93A3]"><ChevronLeft size={20} /></button>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-[#8A93A3]">{prop.folio}</div>
          <h1 className="font-serif text-xl leading-tight">{prop.direccion}</h1>
          <div className="text-xs text-[#8A93A3] mt-0.5">{prop.cliente}{prop.telefono ? ` · ${prop.telefono}` : ""}</div>
        </div>
        <button onClick={() => setEditandoDatos(true)} className="text-[#8A93A3] hover:text-[#EDE7D9] p-1.5" title="Editar datos generales">
          <Pencil size={16} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-2">
        <Stat label="Saldo" value={fmt(saldoActual)} />
        <Stat label="Mora a pagar" value={fmt(moraTotal)} warn={moraTotal > 0} />
        <Stat label="Luz pendiente" value={fmt(luzPendiente)} warn={luzPendiente > 0} />
      </div>
      {moraTotal > 0 && (
        <div className="text-[11px] text-[#8A93A3] mb-2">
          Desglose: {moraCredito > 0 && <span>mora crédito {fmt(moraCredito)}</span>}{moraCredito > 0 && moraLuz > 0 && " · "}{moraLuz > 0 && <span>mora luz {fmt(moraLuz)}</span>}
        </div>
      )}
      {prop.saldoAFavor > 0 && (
        <div className="text-[11px] text-emerald-400 mb-4">El cliente tiene {fmt(prop.saldoAFavor)} de saldo a favor pendiente de aplicar.</div>
      )}

      <div className="flex gap-1 mb-4 border-b border-[#2A3547] overflow-x-auto">
        {[
          ["tabla", "Tabla de pagos", Clock],
          ["abono", "Abono a capital", TrendingDown],
          ["contrato", `Contrato${(prop.documentos || []).length ? ` (${prop.documentos.length})` : ""}`, FileText],
          ["condiciones", "Condiciones", Settings2],
          ["avisos", `Avisos${notifsAdmin.filter((n) => !n.leida).length ? ` (${notifsAdmin.filter((n) => !n.leida).length})` : ""}`, Bell],
        ].map(([id, label, Icon]) => (
          <button key={id} onClick={() => { setTab(id); if (id === "avisos") actualizar((p) => { p.notificaciones = (p.notificaciones || []).map((n) => (n.para === "inmobiliaria" ? { ...n, leida: true } : n)); return p; }); }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 -mb-px whitespace-nowrap ${tab === id ? "border-[#C9A227] text-[#EDE7D9]" : "border-transparent text-[#8A93A3]"}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === "tabla" && (
        <div className="space-y-2">
          {ventana.hayMasAnt && <BotonMas direccion="arriba" texto="Ver cuotas anteriores" onClick={() => ventana.setExtraAnt((v) => v + 6)} />}
          {ventana.visiblesAnt.map((f) => renderFila(f, prop.tabla.indexOf(f)))}
          <div className="text-center text-[10px] uppercase tracking-widest text-[#8A93A3] py-1">Hoy</div>
          {ventana.visiblesSig.map((f) => renderFila(f, prop.tabla.indexOf(f)))}
          {ventana.hayMasSig && <BotonMas direccion="abajo" texto="Ver cuotas siguientes" onClick={() => ventana.setExtraSig((v) => v + 6)} />}
        </div>
      )}

      {tab === "abono" && (
        <div>
          <p className="text-sm text-[#8A93A3] mb-3">Registra un pago extra a capital. Se aplicará al saldo de la próxima cuota pendiente y la tabla se recalculará manteniendo la misma mensualidad, reduciendo el plazo restante.</p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <CampoMoneda label="Monto del abono" value={abonoMonto} onChange={setAbonoMonto} />
            </div>
            <button onClick={aplicarAbono} className="bg-[#C9A227] text-[#101826] px-4 py-2 rounded-md text-sm font-medium">Aplicar</button>
          </div>
          <div className="mt-4 text-xs text-[#8A93A3]">Meses restantes en la tabla: <span className="text-[#EDE7D9] font-mono">{fmtNum(prop.tabla.filter((f) => f.estado !== "pagado").length)}</span></div>
        </div>
      )}



      {tab === "contrato" && (
        <div className="space-y-4">
          <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-[#2A3547] rounded-lg py-8 cursor-pointer hover:border-[#C9A227]/50">
            <FileText size={22} className="text-[#8A93A3]" />
            <span className="text-sm text-[#8A93A3]">{subiendoContrato ? "Subiendo..." : "Subir documentos (contrato, addendums, identificaciones...)"}</span>
            <span className="text-[11px] text-[#6b7280]">Puedes seleccionar varios PDF o fotos a la vez</span>
            <input type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => subirDocumentos(e.target.files)} />
          </label>

          {(prop.documentos || []).length > 0 && (
            <div className="space-y-2">
              {prop.documentos.map((doc) => (
                <div key={doc.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-[#1A2333] flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-[#C9A227]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{doc.nombre}</div>
                    <div className="text-[11px] text-[#8A93A3]">Subido {fmtDateTime(doc.fecha)}</div>
                  </div>
                  <button onClick={() => verDocumentoStorage(doc.archivoUrl)} className="text-xs bg-[#2A3547] hover:bg-[#3a4864] px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shrink-0">
                    <Download size={13} /> Ver
                  </button>
                  <button onClick={() => eliminarDocumento(doc)} className="text-xs bg-red-900 hover:bg-red-800 px-2.5 py-1.5 rounded-md shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#8A93A3] mb-2">Condiciones pactadas en el contrato</div>
            <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4 space-y-2 text-sm">
              <Fila2 label="Precio de venta" value={fmt(prop.precio)} />
              <Fila2 label="Enganche" value={fmt(prop.enganche)} />
              <Fila2 label="Monto financiado" value={fmt(Math.max(0, prop.precio - prop.enganche))} />
              <Fila2 label="Tasa de interés anual" value={`${fmtNum(prop.tasaAnual)}%`} />
              <Fila2 label="Plazo" value={`${fmtNum(prop.plazoAnios)} años (${prop.tabla.length} cuotas)`} />
              <Fila2 label="Mensualidad" value={fmt(prop.tabla[0]?.pago ?? 0)} />
              <Fila2 label="Mora crédito" value={`${prop.diasGracia} días de gracia · ${fmt(prop.moraDiaria)}/día después`} />
              <Fila2 label="Mora luz" value={`${prop.diasGraciaLuz} días de gracia · ${fmt(prop.moraDiariaLuz)}/día después`} />
              <Fila2 label="Fecha de inicio" value={fmtDate(prop.fechaInicio)} />
            </div>
          </div>
        </div>
      )}

      {tab === "condiciones" && (
        <div>
          <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-1.5">
              <KeyRound size={15} className="text-[#C9A227]" />
              <div className="text-sm font-medium">Acceso del cliente</div>
            </div>
            <div className="text-[11px] text-[#8A93A3] mb-3">
              {prop.clienteUserId ? "Este cliente ya tiene un código de acceso." : "Este cliente todavía no tiene código para entrar a la app."}
            </div>
            <button onClick={generarCodigoCliente} disabled={generandoCodigo} className="text-xs bg-[#2A3547] hover:bg-[#3a4864] px-3 py-2 rounded-md disabled:opacity-40">
              {generandoCodigo ? "Generando..." : prop.clienteUserId ? "Regenerar código" : "Generar código de acceso"}
            </button>
            {errorCodigo && <div className="text-xs text-red-400 mt-2">{errorCodigo}</div>}
            {codigoGenerado && (
              <div className="mt-3 bg-[#0C121C] border border-[#C9A227]/40 rounded-md p-3">
                <div className="text-[11px] text-[#8A93A3]">Código para {prop.cliente}:</div>
                <div className="font-mono text-2xl tracking-widest text-[#C9A227]">{codigoGenerado}</div>
                <div className="text-[11px] text-[#8A93A3] mt-1">Compárteselo por WhatsApp o en persona. Lo usa junto con "Soy cliente" en la pantalla de inicio.</div>
              </div>
            )}
          </div>

          {!condicionesDesbloqueadas || !condForm ? (
            <div className="space-y-3">
              <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4 space-y-2 text-sm">
                <Fila2 label="Precio de venta" value={fmt(prop.precio)} />
                <Fila2 label="Enganche" value={fmt(prop.enganche)} />
                <Fila2 label="Tasa anual" value={`${fmtNum(prop.tasaAnual)}%`} />
                <Fila2 label="Plazo" value={`${fmtNum(prop.plazoAnios)} años`} />
                <div className="border-t border-[#2A3547] my-1"></div>
                <Fila2 label="Días de gracia (crédito)" value={`${prop.diasGracia} días`} />
                <Fila2 label="Mora diaria (crédito)" value={fmt(prop.moraDiaria)} />
                <div className="border-t border-[#2A3547] my-1"></div>
                <Fila2 label="¿Se cobra luz?" value={prop.aplicaLuz ? "Sí" : "No"} />
                {prop.aplicaLuz && (
                  <>
                    <Fila2 label="Monto mensual de luz" value={fmt(prop.montoLuzMensual)} />
                    <Fila2 label="Días de gracia (luz)" value={`${prop.diasGraciaLuz} días`} />
                    <Fila2 label="Mora diaria (luz)" value={fmt(prop.moraDiariaLuz)} />
                  </>
                )}
              </div>
              <button onClick={abrirCondiciones} className="flex items-center gap-1.5 text-xs bg-[#2A3547] hover:bg-[#3a4864] px-3 py-2 rounded-md">
                <Lock size={13} /> Modificar (requiere confirmar tu contraseña)
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {hayPagosRegistrados && (
                <div className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-800 rounded-md p-2.5">
                  Esta propiedad ya tiene cuotas pagadas, así que precio, enganche, tasa y plazo quedan bloqueados para no alterar el historial. Si necesitas corregirlos, contáctanos.
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <CampoMoneda label="Precio de venta" disabled={hayPagosRegistrados} value={condForm.precio} onChange={(n) => setCondForm({ ...condForm, precio: n })} />
                <CampoMoneda label="Enganche" disabled={hayPagosRegistrados} value={condForm.enganche} onChange={(n) => setCondForm({ ...condForm, enganche: n })} />
                <Campo label="Tasa anual %" type="number" disabled={hayPagosRegistrados} value={condForm.tasaAnual} onChange={(e) => setCondForm({ ...condForm, tasaAnual: e.target.value })} />
                <Campo label="Plazo (años)" type="number" disabled={hayPagosRegistrados} value={condForm.plazoAnios} onChange={(e) => setCondForm({ ...condForm, plazoAnios: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Días de gracia (crédito)" type="number" value={condForm.diasGracia} onChange={(e) => setCondForm({ ...condForm, diasGracia: e.target.value })} />
                <CampoMoneda label="Mora diaria (crédito)" value={condForm.moraDiaria} onChange={(n) => setCondForm({ ...condForm, moraDiaria: n })} />
              </div>

              <div className="border-t border-[#2A3547] pt-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿Se cobra luz en esta propiedad?</span>
                  <input type="checkbox" checked={condForm.aplicaLuz} onChange={(e) => setCondForm({ ...condForm, aplicaLuz: e.target.checked })} className="w-4 h-4 accent-[#C9A227]" />
                </label>
                {condForm.aplicaLuz && (
                  <div className="mt-3 space-y-3">
                    <CampoMoneda label="Monto mensual de luz" value={condForm.montoLuzMensual} onChange={(n) => setCondForm({ ...condForm, montoLuzMensual: n })} />
                    <div className="grid grid-cols-2 gap-3">
                      <Campo label="Días de gracia (luz)" type="number" value={condForm.diasGraciaLuz} onChange={(e) => setCondForm({ ...condForm, diasGraciaLuz: e.target.value })} />
                      <CampoMoneda label="Mora diaria (luz)" value={condForm.moraDiariaLuz} onChange={(n) => setCondForm({ ...condForm, moraDiariaLuz: n })} />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setCondicionesDesbloqueadas(false); setCondForm(null); }} className="flex-1 text-xs bg-[#2A3547] py-2 rounded-md">Cancelar</button>
                <button onClick={guardarCondiciones} className="flex-1 text-xs bg-[#C9A227] text-[#101826] font-medium py-2 rounded-md">Guardar cambios</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "avisos" && (
        <div className="space-y-2">
          {notifsAdmin.length === 0 && <div className="text-sm text-[#8A93A3]">Sin avisos por ahora.</div>}
          {notifsAdmin.map((n) => (
            <div key={n.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
              <div className="text-sm">{n.mensaje}</div>
              <div className="text-[11px] text-[#8A93A3] mt-1">{fmtDateTime(n.fecha)}</div>
            </div>
          ))}
        </div>
      )}

      {imagenAmpliada && (
        <div onClick={() => setImagenAmpliada(null)} className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
          <img src={imagenAmpliada} alt="Comprobante ampliado" className="max-w-full max-h-full rounded-md" />
          <button onClick={() => setImagenAmpliada(null)} className="absolute top-5 right-5 text-white"><X size={24} /></button>
        </div>
      )}

      {pidiendoPin !== null && (
        <ModalPin
          onCancelar={() => setPidiendoPin(null)}
          onExito={() => {
            if (pidiendoPin === "condiciones") {
              setCondicionesDesbloqueadas(true);
              setCondForm({
                precio: prop.precio, enganche: prop.enganche, tasaAnual: prop.tasaAnual, plazoAnios: prop.plazoAnios,
                diasGracia: prop.diasGracia, moraDiaria: prop.moraDiaria, diasGraciaLuz: prop.diasGraciaLuz, moraDiariaLuz: prop.moraDiariaLuz,
                aplicaLuz: prop.aplicaLuz, montoLuzMensual: prop.montoLuzMensual,
              });
            } else {
              const idx = pidiendoPin;
              const fila = prop.tabla[idx];
              const moraPendiente = calcularMoraCredito(fila, hoy, prop.diasGracia, prop.moraDiaria);
              setCondonarIdx(idx);
              setCondonoMonto(String(Math.round(moraPendiente * 100) / 100));
            }
            setPidiendoPin(null);
          }}
        />
      )}

      {editandoDatos && (
        <ModalEditarDatosPropiedad
          prop={prop}
          onCancelar={() => setEditandoDatos(false)}
          onGuardar={(datos) => {
            actualizar((p) => ({ ...p, ...datos }));
            setEditandoDatos(false);
          }}
        />
      )}
    </div>
  );
}

function ModalEditarDatosPropiedad({ prop, onCancelar, onGuardar }) {
  const [folio, setFolio] = useState(prop.folio || "");
  const [direccion, setDireccion] = useState(prop.direccion || "");
  const [cliente, setCliente] = useState(prop.cliente || "");
  const [telefono, setTelefono] = useState(prop.telefono || "");
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-5 w-full max-w-sm">
        <div className="font-serif text-lg mb-3">Editar datos generales</div>
        <div className="space-y-3">
          <Campo label="Folio / Lote" value={folio} onChange={(e) => setFolio(e.target.value)} />
          <Campo label="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          <Campo label="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
          <Campo label="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onCancelar} className="flex-1 text-xs bg-[#2A3547] py-2 rounded-md">Cancelar</button>
          <button onClick={() => onGuardar({ folio, direccion, cliente, telefono })} disabled={!direccion || !cliente} className="flex-1 text-xs bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded-md">Guardar</button>
        </div>
      </div>
    </div>
  );
}

function Fila2({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#8A93A3]">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function Stat({ label, value, warn }) {
  return (
    <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-[#8A93A3]">{label}</div>
      <div className={`font-mono text-sm mt-0.5 ${warn ? "text-red-400" : ""}`}>{value}</div>
    </div>
  );
}

function Badge({ estado }) {
  const map = {
    pagado: { icon: CheckCircle2, cls: "text-emerald-400 border-emerald-700", txt: "Pagado" },
    vencido: { icon: AlertTriangle, cls: "text-red-400 border-red-800", txt: "Vencido" },
    gracia: { icon: Clock, cls: "text-orange-300 border-orange-700", txt: "En gracia" },
    pendiente: { icon: Clock, cls: "text-[#8A93A3] border-[#3a4864]", txt: "Pendiente" },
    revision: { icon: Upload, cls: "text-amber-400 border-amber-700", txt: "En revisión" },
    parcial: { icon: TrendingDown, cls: "text-blue-300 border-blue-700", txt: "Parcial" },
  }[estado];
  const Icon = map.icon;
  return (
    <span className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border ${map.cls}`}>
      <Icon size={11} /> {map.txt}
    </span>
  );
}

// Formulario de comprobante: pide el monto depositado, calcula si es exacto, de más o de menos,
// y si sobra dinero a tiempo, deja que el cliente elija qué hacer con el excedente.
function FormularioComprobante({ f, prop, hoy, subiendo, onEnviar }) {
  const [monto, setMonto] = useState(0);
  const [destino, setDestino] = useState(null);
  const [archivo, setArchivo] = useState(null);

  const montoNum = Number(monto) || 0;
  const { moraPendiente, luzPendiente, luzMoraPendiente, montoRequerido } = calcularEstadoPago(f, hoy, prop);
  const aTiempo = moraPendiente === 0;
  const excedente = montoNum > 0 ? Math.max(0, montoNum - montoRequerido) : 0;
  const faltante = montoNum > 0 ? Math.max(0, montoRequerido - montoNum) : 0;
  const necesitaDestino = excedente > 0.009 && aTiempo;
  const puedeEnviar = montoNum > 0 && archivo && (!necesitaDestino || destino);

  const enviar = () => {
    const resultado = faltante > 0.009 ? "parcial" : excedente > 0.009 ? "excedente" : "completo";
    onEnviar({
      archivo,
      montoDepositado: montoNum,
      moraAlSubir: moraPendiente,
      montoRequerido,
      excedente,
      faltante,
      resultado,
      destinoExcedente: resultado === "excedente" ? (necesitaDestino ? destino : "creditoSiguiente") : null,
    });
  };

  return (
    <div className="mt-3 space-y-2.5">
      <div className="text-[11px] text-[#8A93A3]">Debes: <span className="font-mono text-[#EDE7D9]">{fmt(montoRequerido)}</span></div>
      {prop.aplicaLuz && (luzPendiente > 0 || luzMoraPendiente > 0) && (
        <div className="text-[11px] text-[#C9A227]">
          Incluye luz de este mes: {fmt(luzPendiente)}{luzMoraPendiente > 0 ? ` + ${fmt(luzMoraPendiente)} de mora` : ""}
        </div>
      )}
      {moraPendiente > 0.009 && (
        <div className="text-[11px] text-red-400 bg-red-950/30 border border-red-800 rounded-md p-2">
          Ya tienes {fmt(moraPendiente)} de mora pendiente. De tu depósito, primero se cubrirá esa mora y el resto se aplicará a la cuota.
        </div>
      )}
      <CampoMoneda label="¿Cuánto depositaste?" value={monto} onChange={setMonto} />

      {montoNum > 0 && faltante > 0.009 && (
        <div className="text-[11px] text-blue-300">Depositando esto, quedarían pendientes {fmt(faltante)} que se sumarán a tu siguiente cuota.</div>
      )}

      {necesitaDestino && (
        <div className="bg-[#0C121C] border border-[#2A3547] rounded-md p-2.5 space-y-1.5">
          <div className="text-[11px] text-[#C9A227]">Depositaste {fmt(excedente)} de más. ¿Qué quieres hacer con eso?</div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="radio" name={`destino-${f.numero}`} checked={destino === "abono"} onChange={() => setDestino("abono")} />
            Abonarlo a capital (reduce el plazo de tu crédito)
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="radio" name={`destino-${f.numero}`} checked={destino === "creditoSiguiente"} onChange={() => setDestino("creditoSiguiente")} />
            Dejarlo como crédito para mi siguiente cuota
          </label>
        </div>
      )}
      {montoNum > 0 && excedente > 0.009 && !aTiempo && (
        <div className="text-[11px] text-[#8A93A3]">Como este pago llega después de los días de gracia, el excedente de {fmt(excedente)} se guardará como crédito para tu siguiente cuota.</div>
      )}

      <label className="flex items-center justify-center gap-1.5 text-xs bg-[#2A3547] hover:bg-[#3a4864] py-2 rounded-md cursor-pointer">
        <Upload size={13} /> {archivo ? archivo.name : "Adjuntar foto del depósito"}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
      </label>

      <button disabled={!puedeEnviar || subiendo} onClick={enviar} className="w-full text-xs bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2 rounded-md">
        {subiendo ? "Enviando..." : "Enviar comprobante"}
      </button>
    </div>
  );
}

// ---------- Vista Cliente ----------

function VistaCliente({ propiedades, proyectos, seleccion, setSeleccion, hoy, actualizar, onImprimir }) {
  const prop = propiedades.find((p) => p.id === seleccion) || propiedades[0];
  const [subiendoIdx, setSubiendoIdx] = useState(null);
  const [verHistorialMoras, setVerHistorialMoras] = useState(false);

  if (!prop) return <div className="text-center text-[#8A93A3] mt-16 text-sm">No hay propiedades registradas.</div>;

  const proyecto = proyectos.find((py) => py.id === prop.proyectoId);
  const { saldoActual, vencidas, moraTotal, luzPendiente, proximaCuota, pendienteActual } = resumenProp(prop, hoy);
  const comparativaAbono = calcularComparativaAbono(prop);
  const alDia = vencidas.length === 0;
  const ventana = useVentana(prop.tabla);
  const notifsCliente = (prop.notificaciones || []).filter((n) => n.para === "cliente");

  const historialMoras = prop.tabla
    .map((f) => ({
      numero: f.numero,
      fecha: f.fecha,
      generada: calcularMoraGenerada(f, hoy, prop.diasGracia, prop.moraDiaria),
      pagada: f.moraPagada || 0,
      condonada: f.moraCondonada || 0,
      pendiente: calcularMoraCredito(f, hoy, prop.diasGracia, prop.moraDiaria),
    }))
    .filter((r) => r.generada > 0 || r.pagada > 0 || r.condonada > 0);
  const totalPagadaHist = historialMoras.reduce((s, r) => s + r.pagada, 0);
  const totalCondonadaHist = historialMoras.reduce((s, r) => s + r.condonada, 0);

  const subirComprobante = async (idx, datos) => {
    setSubiendoIdx(idx);
    try {
      const numero = prop.tabla[idx].numero;
      const base64 = await fileToBase64(datos.archivo);

      // Sube la imagen real a Supabase Storage y registra el comprobante en la base de datos.
      const subido = await subirImagenComprobante(prop.id, numero, datos.archivo);
      if (subido) {
        await guardarComprobanteEnBD(subido.cuotaId, subido.path, datos);
      } else {
        console.error("No se pudo respaldar el comprobante en la nube; se guarda solo localmente por ahora.");
      }

      actualizar(prop.id, (p) => {
        const fila = p.tabla[idx];
        fila.comprobante = {
          imagen: base64,
          fecha: new Date().toISOString(),
          estado: "revision",
          montoDepositado: datos.montoDepositado,
          moraAlSubir: datos.moraAlSubir,
          montoRequerido: datos.montoRequerido,
          excedente: datos.excedente,
          faltante: datos.faltante,
          resultado: datos.resultado,
          destinoExcedente: datos.destinoExcedente,
        };
        fila.estado = "revision";
        p.notificaciones = p.notificaciones || [];
        let msg = `${p.cliente} subió un comprobante de pago para la cuota #${fila.numero} (${fmt(datos.montoDepositado)}).`;
        if (datos.resultado === "parcial") msg += ` Es un pago parcial, falta ${fmt(datos.faltante)}.`;
        if (datos.resultado === "excedente") msg += ` Tiene un excedente de ${fmt(datos.excedente)} (${datos.destinoExcedente === "abono" ? "para abono a capital" : "como crédito"}).`;
        p.notificaciones.unshift(nuevaNotificacion("inmobiliaria", msg));
        return p;
      });
    } finally {
      setSubiendoIdx(null);
    }
  };

  const aplicarSaldoAFavor = (idx) => {
    actualizar(prop.id, (p) => {
      const disponible = p.saldoAFavor || 0;
      if (disponible <= 0) return p;
      const { restante } = aplicarPagoCascada(p.tabla, idx, disponible, hoy, p);
      const aplicado = disponible - restante;
      p.saldoAFavor = restante;
      p.notificaciones = p.notificaciones || [];
      p.notificaciones.unshift(nuevaNotificacion("inmobiliaria", `${p.cliente} aplicó ${fmt(aplicado)} de su saldo a favor a sus cuotas pendientes.`));
      return p;
    });
  };

  const cursorIdx = prop.tabla.findIndex((f) => f.estado !== "pagado");

  const renderFila = (f, idx) => {
    const est = estadoReal(f, hoy, prop.diasGracia);
    const mora = calcularMoraCredito(f, hoy, prop.diasGracia, prop.moraDiaria);
    const esLaQueToca = idx === cursorIdx;
    return (
      <div key={idx} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-[#8A93A3] font-mono">Cuota #{f.numero} · {fmtDate(f.fecha)}</div>
            <div className="font-mono text-sm">{fmt(f.pago)}</div>
            {f.ultimoRechazo && est !== "pagado" && est !== "revision" && <div className="text-[11px] text-red-400">tu comprobante anterior fue rechazado, sube uno nuevo</div>}
          </div>
          <Badge estado={est} />
        </div>

        <DetalleFila f={f} mora={mora} prop={prop} hoy={hoy} />

        {(est === "pendiente" || est === "vencido" || est === "gracia" || est === "parcial") && esLaQueToca && (
          <FormularioComprobante f={f} prop={prop} hoy={hoy} subiendo={subiendoIdx === idx} onEnviar={(datos) => subirComprobante(idx, datos)} />
        )}
        {(est === "pendiente" || est === "vencido" || est === "gracia" || est === "parcial") && !esLaQueToca && cursorIdx > -1 && (
          <div className="mt-3 text-[11px] text-[#8A93A3] bg-[#0C121C] border border-[#2A3547] rounded-md p-2.5">
            Ponte al día con tu cuota #{prop.tabla[cursorIdx].numero} de {fmtDate(prop.tabla[cursorIdx].fecha)} antes de poder pagar esta.
          </div>
        )}
        {est === "revision" && <div className="mt-3 text-[11px] text-amber-400 flex items-center gap-1.5"><Upload size={12} /> Tu comprobante está en revisión por la inmobiliaria.</div>}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto p-5 pb-24">
      {propiedades.length > 1 && (
        <select value={prop.id} onChange={(e) => setSeleccion(e.target.value)} className="mb-4 bg-[#161F2E] border border-[#2A3547] rounded-md px-3 py-2 text-sm w-full">
          {propiedades.map((p) => <option key={p.id} value={p.id}>{p.cliente} · {p.direccion}</option>)}
        </select>
      )}

      <div className="text-center mb-6">
        {proyecto && <div className="text-[10px] uppercase tracking-widest text-[#C9A227] mb-1">{proyecto.nombre}</div>}
        <div className="text-[11px] uppercase tracking-widest text-[#8A93A3]">Hola, {prop.cliente.split(" ")[0]}</div>
        <div className="font-serif text-2xl mt-1">{prop.direccion}</div>
        <button onClick={() => onImprimir({ prop, proyecto, hoy })} className="mt-3 inline-flex items-center gap-1.5 text-xs bg-[#2A3547] hover:bg-[#3a4864] px-3 py-1.5 rounded-md">
          <Printer size={13} /> Descargar tabla de pagos (PDF)
        </button>
      </div>

      {!alDia && (
        <div className="bg-red-950/40 border border-red-800 rounded-lg p-4 mb-4 flex gap-3 items-start">
          <Bell size={18} className="text-red-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-medium text-red-300">Tienes {vencidas.length} pago{vencidas.length > 1 ? "s" : ""} vencido{vencidas.length > 1 ? "s" : ""}</div>
            <div className="text-red-400/80 text-xs mt-0.5">Se está generando un cargo por mora de {fmt(moraTotal)}. Ponte al corriente para evitar que siga creciendo.</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4">
          <div className="text-[10px] uppercase text-[#8A93A3]">Saldo del crédito</div>
          <div className="font-mono text-xl mt-1">{fmt(saldoActual)}</div>
        </div>
        <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4">
          <div className="text-[10px] uppercase text-[#8A93A3]">Próximo pago</div>
          <div className="font-mono text-xl mt-1">{proximaCuota ? fmt(pendienteActual.montoRequerido) : "—"}</div>
          {proximaCuota && <div className="text-[11px] text-[#8A93A3] mt-0.5">vence {fmtDate(proximaCuota.fecha)}</div>}
        </div>
      </div>

      {luzPendiente > 0 && (
        <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4 mb-4 flex justify-between items-center">
          <div className="flex items-center gap-2 text-sm"><Zap size={16} className="text-[#C9A227]" /> Luz pendiente</div>
          <div className="font-mono text-sm">{fmt(luzPendiente)}</div>
        </div>
      )}

      {prop.saldoAFavor > 0 && (
        <div className="bg-emerald-950/30 border border-emerald-800 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-emerald-300">Tienes {fmt(prop.saldoAFavor)} de saldo a favor</div>
            {proximaCuota && (
              <button onClick={() => aplicarSaldoAFavor(prop.tabla.indexOf(proximaCuota))} className="text-xs bg-emerald-800 hover:bg-emerald-700 px-3 py-1.5 rounded-md shrink-0">
                Aplicar a mi próxima cuota
              </button>
            )}
          </div>
        </div>
      )}

      {comparativaAbono && (
        <div className="bg-[#161F2E] border border-[#C9A227]/30 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown size={16} className="text-[#C9A227]" />
            <div className="text-sm font-medium">El beneficio de tus abonos a capital</div>
          </div>
          <div className="text-[11px] text-[#8A93A3] mb-3">
            Has abonado {fmt(comparativaAbono.totalAbonado)} a capital en total. Gracias a eso, te ahorraste{" "}
            <span className="text-[#C9A227] font-medium">{comparativaAbono.cuotasExoneradas} cuota{comparativaAbono.cuotasExoneradas !== 1 ? "s" : ""}</span> de tu crédito
            ({comparativaAbono.cuotasTotalesOriginal} cuotas originales → {comparativaAbono.cuotasTotalesActual} ahora).
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#0C121C] border border-[#2A3547] rounded-md p-3">
              <div className="text-[10px] uppercase text-[#8A93A3]">Saldo sin tus abonos</div>
              <div className="font-mono text-sm mt-1 line-through text-[#8A93A3]">{fmt(comparativaAbono.saldoSinAbono)}</div>
            </div>
            <div className="bg-[#0C121C] border border-emerald-800 rounded-md p-3">
              <div className="text-[10px] uppercase text-[#8A93A3]">Tu saldo real hoy</div>
              <div className="font-mono text-sm mt-1 text-emerald-400">{fmt(comparativaAbono.saldoConAbono)}</div>
            </div>
          </div>
          <div className="text-[11px] text-emerald-400 mt-2 text-center">Debes {fmt(comparativaAbono.ahorroSaldo)} menos gracias a tus abonos.</div>
          {proximaCuota && (
            <div className="text-[11px] text-[#8A93A3] mt-3 bg-[#0C121C] border border-[#2A3547] rounded-md p-2.5">
              💡 En tu próxima cuota, {Math.round((proximaCuota.interes / proximaCuota.pago) * 100)}% es interés y solo {Math.round((proximaCuota.capital / proximaCuota.pago) * 100)}% reduce tu deuda. Por eso entre más pronto abones a capital, más plazo te ahorras — con los años esa proporción se va invirtiendo poco a poco.
            </div>
          )}
        </div>
      )}

      {notifsCliente.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wide text-[#8A93A3] mb-2">Avisos</div>
          <div className="space-y-2">
            {notifsCliente.slice(0, 3).map((n) => (
              <div key={n.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 text-sm flex gap-2 items-start">
                <Bell size={14} className="text-[#C9A227] mt-0.5 shrink-0" />
                <div><div>{n.mensaje}</div><div className="text-[11px] text-[#8A93A3] mt-0.5">{fmtDateTime(n.fecha)}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-[11px] uppercase tracking-wide text-[#8A93A3] mb-2 mt-6">Tus cuotas</div>
      <div className="space-y-2">
        {ventana.hayMasAnt && <BotonMas direccion="arriba" texto="Ver cuotas anteriores" onClick={() => ventana.setExtraAnt((v) => v + 6)} />}
        {ventana.visiblesAnt.map((f) => renderFila(f, prop.tabla.indexOf(f)))}
        <div className="text-center text-[10px] uppercase tracking-widest text-[#8A93A3] py-1">Hoy</div>
        {ventana.visiblesSig.map((f) => renderFila(f, prop.tabla.indexOf(f)))}
        {ventana.hayMasSig && <BotonMas direccion="abajo" texto="Ver cuotas siguientes" onClick={() => ventana.setExtraSig((v) => v + 6)} />}
      </div>

      {historialMoras.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setVerHistorialMoras((v) => !v)} className="w-full flex items-center justify-between text-[11px] uppercase tracking-wide text-[#8A93A3] mb-2">
            <span>Historial de moras</span>
            {verHistorialMoras ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {verHistorialMoras && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 mb-1">
                <Stat label="Mora pagada (histórico)" value={fmt(totalPagadaHist)} />
                <Stat label="Mora condonada (histórico)" value={fmt(totalCondonadaHist)} />
                <Stat label="Mora pendiente hoy" value={fmt(moraTotal)} warn={moraTotal > 0} />
              </div>
              {historialMoras.map((r) => (
                <div key={r.numero} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 text-[11px]">
                  <div className="text-[#8A93A3] font-mono mb-1.5">Cuota #{r.numero} · {fmtDate(r.fecha)}</div>
                  <div className="grid grid-cols-4 gap-2">
                    <div><div className="text-[#8A93A3]">Generada</div><div className="font-mono">{fmt(r.generada)}</div></div>
                    <div><div className="text-[#8A93A3]">Pagada</div><div className="font-mono text-emerald-400">{fmt(r.pagada)}</div></div>
                    <div><div className="text-[#8A93A3]">Condonada</div><div className="font-mono text-[#C9A227]">{fmt(r.condonada)}</div></div>
                    <div><div className="text-[#8A93A3]">Pendiente</div><div className={`font-mono ${r.pendiente > 0 ? "text-red-400" : ""}`}>{fmt(r.pendiente)}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-[11px] text-[#8A93A3] mt-6 text-center leading-relaxed">
        Los avisos automáticos por SMS, WhatsApp o correo no se envían desde esta vista de demostración — requieren conectar un servicio como Twilio o un proveedor de email al backend.
      </div>
    </div>
  );
}

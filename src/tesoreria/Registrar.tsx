// ============================================================
// tesoreria/Registrar.tsx — alta de ingresos, gastos y traslados
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { FileText, Upload, X, CheckCircle2 } from "lucide-react";
import { fmt, llamarFuncionSesion, C_BOLSA, Campo, CampoMoneda, SelectorCategoria, CrearObra, CrearBolsa } from "./comun";

export function RegistrarMovimiento({ bolsas, centros, onGuardado }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [tipo, setTipo] = useState("egreso");
  const [fecha, setFecha] = useState(hoy);
  const [monto, setMonto] = useState(0);
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [centro, setCentro] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [pendiente, setPendiente] = useState(true);
  const [nuevaObra, setNuevaObra] = useState(false);
  const [nuevaBolsa, setNuevaBolsa] = useState(false);
  const [listaCentros, setListaCentros] = useState(centros);
  const [listaBolsas, setListaBolsas] = useState(bolsas);
  const [arbol, setArbol] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [proveedor, setProveedor] = useState("");
  const [nuevoProv, setNuevoProv] = useState("");
  const [archivo, setArchivo] = useState(null);
  const [tipoDoc, setTipoDoc] = useState("factura");
  const [paso, setPaso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(null);

  useEffect(() => { setListaCentros(centros); }, [centros]);
  useEffect(() => { setListaBolsas(bolsas); }, [bolsas]);

  const cargarCatalogos = async () => {
    const [{ data: a }, { data: p }] = await Promise.all([
      supabase.from("v_centros_arbol").select("*").eq("estado", "activo").order("camino"),
      supabase.from("proveedores").select("id, nombre, tipo").order("nombre"),
    ]);
    setArbol(a || []);
    setProveedores(p || []);
  };
  useEffect(() => { cargarCatalogos(); }, []);

  const crearProveedor = async () => {
    if (!nuevoProv.trim()) return;
    const { data, error: e } = await supabase.from("proveedores")
      .insert({ nombre: nuevoProv.trim(), tipo: "persona" }).select("id, nombre").single();
    if (e) { setError(e.message); return; }
    setProveedores([...proveedores, data]);
    setProveedor(data.id);
    setNuevoProv("");
  };

  const limpiar = () => {
    setMonto(0); setCentro(""); setCategoria(""); setDescripcion(""); setProveedor("");
    setFecha(hoy); setPendiente(true); setError("");
    setArchivo(null); setTipoDoc("factura"); setPaso("");
  };

  // Antes se dejaba llegar hasta el final y era el trigger de la base el
  // que rechazaba. Se avisa acá para no llenar obra, categoría y proveedor
  // en balde. La base sigue validando: esto es comodidad, no seguridad.
  const bolsaOrigen = listaBolsas.find((b) => b.id === origen);
  const saldoOrigen = bolsaOrigen ? Number(bolsaOrigen.saldo_actual) : null;
  const saleDeBolsa = tipo === "egreso" || tipo === "traslado";
  const sinSaldo = saleDeBolsa && bolsaOrigen && saldoOrigen <= 0;
  const noAlcanza = saleDeBolsa && bolsaOrigen && saldoOrigen > 0 &&
    Number(monto) > saldoOrigen;

  const listo =
    Number(monto) > 0 &&
    !sinSaldo && !noAlcanza &&
    (tipo === "ingreso" ? destino : tipo === "egreso" ? origen : origen && destino && origen !== destino);

  const guardar = async () => {
    setError(""); setOk(null); setGuardando(true);
    try {
      const fila = {
        tipo, fecha, monto: Number(monto),
        descripcion: descripcion.trim() || null,
        bolsa_origen_id:  tipo === "ingreso" ? null : origen,
        bolsa_destino_id: tipo === "egreso"  ? null : destino,
        centro_costo_id:  tipo === "egreso" ? (centro || null) : null,
        categoria_id:     tipo === "traslado" ? null : (categoria || null),
        factura_pendiente: tipo === "egreso" ? pendiente : false,
        proveedor_id: tipo === "egreso" ? (proveedor || null) : null,
      };
      const { data: mov, error: e } = await supabase
        .from("movimientos").insert(fila).select("id").single();
      if (e) throw new Error(e.message);

      let aviso = `${tipo === "ingreso" ? "Ingreso" : tipo === "egreso" ? "Gasto" : "Traslado"} de ${fmt(monto)} registrado.`;

      // Si se adjuntó un papel, se sube y se enlaza al movimiento recién
      // creado. Si algo falla acá, el movimiento ya quedó guardado: se
      // avisa para que el documento se adjunte después desde Documentar.
      if (archivo && mov?.id) {
        try {
          setPaso("Subiendo el documento...");
          const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase();
          const d = new Date();
          const carpeta = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
          const path = `${carpeta}/${crypto.randomUUID()}.${ext}`;

          const { error: errUp } = await supabase.storage
            .from("facturas").upload(path, archivo, { contentType: archivo.type });
          if (errUp) throw new Error(errUp.message);

          const { data: nueva, error: errIns } = await supabase
            .from("facturas")
            .insert({ storage_path: path, archivo_url: path, tipo_documento: tipoDoc })
            .select("id").single();
          if (errIns) throw new Error(errIns.message);

          setPaso("Leyendo el documento...");
          const res = await llamarFuncionSesion("lector-facturas", { factura_id: nueva.id });

          const { data: leida } = await supabase
            .from("facturas").select("monto_total").eq("id", nueva.id).single();
          const aplicar = Math.min(Number(leida?.monto_total) || Number(monto), Number(monto));

          const { error: errLink } = await supabase.from("factura_movimientos").insert({
            factura_id: nueva.id, movimiento_id: mov.id, monto_aplicado: aplicar,
          });
          if (errLink) throw new Error(errLink.message);

          await supabase.from("facturas")
            .update({ movimiento_id: mov.id, centro_costo_id: centro || null })
            .eq("id", nueva.id);

          if (tipoDoc === "factura" && aplicar >= Number(monto) - 1) {
            await supabase.from("movimientos")
              .update({ factura_pendiente: false }).eq("id", mov.id);
          }

          aviso += res?.ok
            ? " El documento quedó adjunto y leído."
            : " El documento quedó adjunto, pero no se pudo leer: revisalo en Documentar.";
        } catch (errDoc) {
          aviso += ` El movimiento se guardó, pero el documento no: ${errDoc.message}`;
        }
      }

      setPaso("");
      setOk(aviso);
      limpiar();
      onGuardado && onGuardado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  // Para un gasto no se ofrecen las bolsas apartadas: el fondo
  // retenido no se puede tocar, y la reserva de cuotas solo sirve
  // para deuda. Para traslados e ingresos siguen disponibles, que es
  // como se libera ese dinero cuando corresponde.
  const bolsasPara = (esOrigenDeGasto) =>
    esOrigenDeGasto
      ? listaBolsas.filter((b) => (b.uso_permitido || "libre") === "libre")
      : listaBolsas;

  const selBolsa = (valor, set, label, esOrigenDeGasto = false) => {
    const opciones = bolsasPara(esOrigenDeGasto);
    const ocultas = listaBolsas.length - opciones.length;
    return (
      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">{label}</span>
        <select value={valor} onChange={(e) => set(e.target.value)}
          className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]">
          <option value="">Elegí una bolsa</option>
          {opciones.map((b) => {
            const vacia = esOrigenDeGasto && Number(b.saldo_actual) <= 0;
            return (
              <option key={b.id} value={b.id} disabled={vacia}>
                {b.nombre} — {vacia ? "sin saldo" : fmt(b.saldo_actual)}
              </option>
            );
          })}
        </select>
        {esOrigenDeGasto && sinSaldo && (
          <span className="block text-[11px] text-red-400 mt-1">
            Esa bolsa está en cero. Elegí otra, o trasladá dinero hacia ella antes de registrar el gasto.
          </span>
        )}
        {esOrigenDeGasto && noAlcanza && (
          <span className="block text-[11px] text-red-400 mt-1">
            En esa bolsa hay {fmt(saldoOrigen)} y el gasto es de {fmt(monto)}. Faltan {fmt(Number(monto) - saldoOrigen)}.
          </span>
        )}
        {esOrigenDeGasto && ocultas > 0 && (
          <span className="block text-[10px] text-[#6b7280] mt-1">
            {ocultas === 1 ? "Hay una bolsa apartada que no" : `Hay ${ocultas} bolsas apartadas que no`}
            {" "}aparece{ocultas === 1 ? "" : "n"} acá. Para usar ese dinero, trasladalo primero.
          </span>
        )}
      </label>
    );
  };

  return (
    <div className="space-y-4">
      {ok && (
        <div className="text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800 rounded-md p-2.5 flex items-center gap-2">
          <CheckCircle2 size={14} /> {ok}
        </div>
      )}
      {error && (
        <div className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-md p-2.5">{error}</div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[["ingreso", "Entró dinero"], ["egreso", "Se gastó"], ["traslado", "Se movió"]].map(([v, l]) => (
          <button key={v} type="button" onClick={() => { setTipo(v); setError(""); setOk(null); }}
            className={`text-xs py-2.5 rounded-md border ${tipo === v ? "bg-[#C9A227] text-[#101826] border-[#C9A227] font-medium" : "border-[#2A3547] text-[#EDE7D9]"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CampoMoneda label="Monto" value={monto} onChange={setMonto} />
        <Campo label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>

      {tipo === "ingreso" && selBolsa(destino, setDestino, "¿A qué bolsa entró?")}
      {tipo === "egreso" && selBolsa(origen, setOrigen, "¿De qué bolsa salió?", true)}
      {tipo === "traslado" && (
        <div className="space-y-3">
          {selBolsa(origen, setOrigen, "Sale de")}
          {selBolsa(destino, setDestino, "Entra a")}
        </div>
      )}

      <div className="flex justify-end -mt-1">
        <button type="button" onClick={() => setNuevaBolsa(!nuevaBolsa)} className="text-[11px] text-[#C9A227] underline">
          {nuevaBolsa ? "Cancelar" : "+ Crear bolsa nueva"}
        </button>
      </div>
      {nuevaBolsa && (
        <CrearBolsa onCancelar={() => setNuevaBolsa(false)}
          onCreada={(b) => {
            // saldo_actual en 0 y sin banderas hasta que onGuardado recargue
            // la lista completa desde v_saldos_bolsas.
            setListaBolsas([...listaBolsas, { ...b, saldo_actual: 0 }]);
            if (tipo === "ingreso" || tipo === "traslado") setDestino(b.id); else setOrigen(b.id);
            setNuevaBolsa(false);
            onGuardado && onGuardado();
          }} />
      )}

      {tipo === "egreso" && (sinSaldo || noAlcanza) && (
        <p className="text-[11px] text-[#8A93A3] text-center py-2">
          Resolvé lo de la bolsa y seguimos con la obra y la categoría.
        </p>
      )}

      {tipo === "egreso" && !sinSaldo && !noAlcanza && (
        <>
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿Para qué obra?</span>
              <select value={centro} onChange={(e) => setCentro(e.target.value)}
                className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]">
                <option value="">Elegí una obra</option>
                {arbol.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"\u00A0\u00A0".repeat(c.nivel || 0)}{c.nivel > 0 ? "└ " : ""}{c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setNuevaObra(!nuevaObra)}
              className="mb-0.5 text-[11px] bg-[#2A3547] px-2.5 py-2 rounded-md shrink-0">
              {nuevaObra ? "Cancelar" : "+ Nueva"}
            </button>
          </div>
          {nuevaObra && (
            <CrearObra onCancelar={() => setNuevaObra(false)}
              onCreada={(c) => { setListaCentros([...listaCentros, c]); setCentro(c.id); setNuevaObra(false); onGuardado && onGuardado(); }} />
          )}
        </>
      )}

      {tipo !== "traslado" && !sinSaldo && !noAlcanza && (
        <SelectorCategoria tipo={tipo === "ingreso" ? "ingreso" : "egreso"} valor={categoria} onChange={setCategoria} />
      )}

      {tipo === "egreso" && !sinSaldo && !noAlcanza && (
        <div>
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿A quién se le pagó?</span>
              <select value={proveedor} onChange={(e) => setProveedor(e.target.value)}
                className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]">
                <option value="">Sin especificar</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
          </div>
          <div className="flex gap-2 mt-2">
            <input value={nuevoProv} onChange={(e) => setNuevoProv(e.target.value)}
              placeholder="O escribí un nombre nuevo"
              className="flex-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs" />
            <button type="button" onClick={crearProveedor} disabled={!nuevoProv.trim()}
              className="text-[11px] bg-[#2A3547] disabled:opacity-40 px-3 rounded-md">Agregar</button>
          </div>
        </div>
      )}

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿Qué fue exactamente?</span>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej. compra de duchas, comida de albañiles"
          className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]" />
      </label>

      {tipo === "egreso" && (
        <label className="flex items-center justify-between bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 cursor-pointer">
          <span className="text-xs">
            Falta la factura del proveedor
            <span className="block text-[10px] text-[#8A93A3] mt-0.5">
              Apagalo si no van a dar factura, como comida o pasajes.
            </span>
          </span>
          <input type="checkbox" checked={pendiente} onChange={(e) => setPendiente(e.target.checked)}
            className="w-4 h-4 accent-[#C9A227] shrink-0 ml-3" />
        </label>
      )}

      {/* El papel se adjunta acá mismo, sin tener que volver después
          por la pestaña Documentar. */}
      {tipo === "egreso" && (
        <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-[#8A93A3]">
            El papel del gasto <span className="text-[#6b7280]">(opcional)</span>
          </div>

          <div className="flex gap-1.5">
            {[["factura", "Factura"], ["voucher", "Voucher"], ["recibo", "Recibo"]].map(([v, t]) => (
              <button key={v} type="button" onClick={() => setTipoDoc(v)}
                className={`flex-1 text-[11px] py-1.5 rounded-md border ${tipoDoc === v ? "bg-[#C9A227] text-[#101826] border-[#C9A227] font-medium" : "border-[#2A3547] text-[#EDE7D9]"}`}>
                {t}
              </button>
            ))}
          </div>

          {archivo ? (
            <div className="flex items-center gap-2 bg-[#0C121C] border border-[#2A3547] rounded-md p-2">
              <FileText size={14} style={{ color: C_BOLSA }} className="shrink-0" />
              <span className="text-[11px] truncate flex-1">{archivo.name}</span>
              <button type="button" onClick={() => setArchivo(null)}
                className="text-[#8A93A3] hover:text-[#EDE7D9] shrink-0">
                <X size={14} />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-1.5 text-[11px] bg-[#2A3547] hover:bg-[#3a4864] py-2 rounded-md cursor-pointer">
              <Upload size={12} /> Adjuntar {tipoDoc}
              <input type="file" accept="image/*,application/pdf" className="hidden"
                onChange={(e) => setArchivo(e.target.files && e.target.files[0])} />
            </label>
          )}

          <p className="text-[10px] text-[#6b7280]">
            Se sube y se lee al guardar. Si no lo tenés a mano, dejalo así y
            adjuntalo después desde Documentar.
          </p>
        </div>
      )}

      <button onClick={guardar} disabled={!listo || guardando}
        className="w-full bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-3 rounded-md text-sm">
        {guardando ? (paso || "Guardando...") : "Registrar movimiento"}
      </button>

      <p className="text-[10px] text-[#6b7280] text-center leading-relaxed">
        Si la bolsa no tiene saldo suficiente, o si el gasto pasa la inversión declarada de la obra,
        el sistema no lo deja pasar y te dice cuánto queda disponible.
      </p>
    </div>
  );
}

export default RegistrarMovimiento;

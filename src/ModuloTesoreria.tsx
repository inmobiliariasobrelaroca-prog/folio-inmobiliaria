
// ============================================================
// ============================================================
// MÓDULO DE TESORERÍA — autónomo
//
// INTEGRACIÓN: una sola línea en App.tsx.
// Dentro de AppInterno, junto a <AvisoCodigoPendiente />:
//
//     <AvisoCodigoPendiente />
//     <ModuloTesoreria perfil={perfil} />        <-- agregar esto
//
// Nada más. No toca TopBar, ni PERMISOS_DISPONIBLES, ni ninguna
// función, componente o pantalla existente.
//
// Reutiliza sin redefinir: Campo, CampoMoneda, fmt, fmtDate,
// supabase, llamarFuncionSesion, y los íconos ya importados
// (Calculator, X, Upload, FileText, CheckCircle2, AlertTriangle,
// Sparkles, ChevronLeft).
//
// Pegar este bloque en cualquier parte del archivo, antes de
// AppInterno. Sugerido: justo antes de "// ---------- App ----------".
// ============================================================

function ModuloTesoreria({ perfil }) {
  const [abierto, setAbierto] = useState(false);

  // Mismo criterio que la función es_admin_financiero() de la base:
  // administrador general, o permiso explícito gestionar_finanzas.
  const rol = perfil?.usuario?.roles;
  const puedeVer = perfil?.tipo === "staff" && (!!rol?.es_administrador || !!rol?.permisos?.gestionar_finanzas);
  if (!puedeVer) return null;

  return (
    <>
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          title="Tesorería"
          className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-[#C9A227] text-[#101826] shadow-lg flex items-center justify-center hover:brightness-110"
        >
          <Calculator size={20} />
        </button>
      )}
      {abierto && <PanelTesoreria onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function PanelTesoreria({ onCerrar }) {
  const [tab, setTab] = useState("mapa");
  const [bolsas, setBolsas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [cuotas, setCuotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = async () => {
    setCargando(true);
    setError("");
    const [{ data: bs, error: e1 }, { data: cc }, { data: cu }] = await Promise.all([
      supabase.from("v_saldos_bolsas").select("*").order("saldo_actual", { ascending: false }),
      supabase.from("centros_costo").select("*").eq("estado", "activo").order("nombre"),
      supabase.from("v_cuotas_proximas").select("*").limit(6),
    ]);
    if (e1) setError("No se pudo cargar la tesorería: " + e1.message);
    setBolsas(bs || []);
    setCentros(cc || []);
    setCuotas(cu || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const total = bolsas.reduce((s, b) => s + Number(b.saldo_actual || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-[#101826] text-[#EDE7D9] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#0C121C] border-b border-[#2A3547] px-5 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#8A93A3]">Interno</div>
            <div className="font-serif text-xl leading-tight">Tesorería</div>
          </div>
          <button onClick={onCerrar} className="text-[#8A93A3] hover:text-[#EDE7D9] p-1.5"><X size={20} /></button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-5 pb-24">
        <div className="flex gap-1 mb-4 border-b border-[#2A3547] overflow-x-auto">
          {[
            ["mapa", "Mapa", Zap],
            ["resumen", "Resumen", Calculator],
            ["facturas", "Subir factura", Upload],
            ["pendientes", "Documentar", AlertTriangle],
            ["movimientos", "Movimientos", FileText],
          ].map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 -mb-px whitespace-nowrap ${tab === id ? "border-[#C9A227] text-[#EDE7D9]" : "border-transparent text-[#8A93A3]"}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-md p-2.5 mb-4">{error}</div>}

        {cargando ? (
          <div className="text-sm text-[#8A93A3]">Cargando...</div>
        ) : tab === "mapa" ? (
          <MapaFlujo bolsas={bolsas} total={total} />
        ) : tab === "resumen" ? (
          <ResumenTesoreria total={total} bolsas={bolsas} centros={centros} cuotas={cuotas} />
        ) : tab === "facturas" ? (
          <SubirFacturaTesoreria bolsas={bolsas} centros={centros} onRegistrada={cargar} />
        ) : tab === "pendientes" ? (
          <DocumentarGastos onCambio={cargar} />
        ) : (
          <MovimientosTesoreria />
        )}
      </div>
    </div>
  );
}

function ResumenTesoreria({ total, bolsas, centros, cuotas }) {
  return (
    <div className="space-y-5">
      <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4">
        <div className="text-[10px] uppercase tracking-wide text-[#8A93A3]">Disponible en todas las bolsas</div>
        <div className="font-serif text-3xl text-[#C9A227] mt-1">{fmt(total)}</div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-[#8A93A3] mb-2">Bolsas</div>
        <div className="space-y-2">
          {bolsas.map((b) => (
            <div key={b.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">{b.nombre}</div>
                <div className="text-[11px] text-[#8A93A3] truncate">
                  {b.banco ? `${b.banco}${b.titular ? ` · ${b.titular}` : ""}` : "Sin cuenta asignada"}
                </div>
              </div>
              <div className={`font-mono text-sm shrink-0 ${b.tipo === "reserva" ? "text-[#C9A227]" : ""}`}>
                {fmt(b.saldo_actual)}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#6b7280] mt-2">
          La reserva de servicio de deuda ya está apartada para las cuotas — no la uses para obra.
        </p>
      </div>

      {cuotas.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[#8A93A3] mb-2">Próximas cuotas de préstamos</div>
          <div className="space-y-1.5">
            {cuotas.map((c, i) => (
              <div key={i} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-[#8A93A3] truncate">
                    {c.acreedor} · #{c.numero} · {fmtDate(c.fecha_vencimiento)}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.estado === "reservada" && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#C9A227] text-[#C9A227] uppercase tracking-wide">Apartada</span>
                    )}
                    <span className="font-mono text-sm">{fmt(c.cuota_total)}</span>
                  </div>
                </div>
                <div className="text-[10px] text-[#8A93A3] mt-1">
                  Capital {fmt(c.capital)} · Interés {fmt(c.interes)} · Seguro {fmt(c.seguro)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <PresupuestoObras />
    </div>
  );
}

function SubirFacturaTesoreria({ bolsas, centros, onRegistrada }) {
  const [categorias, setCategorias] = useState([]);
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [paso, setPaso] = useState("inicio"); // inicio | leyendo | revision | listo
  const [error, setError] = useState("");

  const [factura, setFactura] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [lectura, setLectura] = useState(null);
  const [centroId, setCentroId] = useState("");
  const [bolsaId, setBolsaId] = useState("");
  const [registrando, setRegistrando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("categorias").select("id, nombre").eq("tipo", "egreso").order("nombre");
      setCategorias(data || []);
    })();
  }, []);

  const elegirArchivo = (f) => {
    if (!f) return;
    setError("");
    setArchivo(f);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };

  const subirYLeer = async () => {
    if (!archivo) return;
    setPaso("leyendo");
    setError("");
    try {
      const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase();
      const hoy = new Date();
      const carpeta = `${hoy.getFullYear()}/${String(hoy.getMonth() + 1).padStart(2, "0")}`;
      const path = `${carpeta}/${crypto.randomUUID()}.${ext}`;

      const { error: errUp } = await supabase.storage.from("facturas").upload(path, archivo, { contentType: archivo.type });
      if (errUp) throw new Error("No se pudo subir el archivo: " + errUp.message);

      const { data: nueva, error: errIns } = await supabase
        .from("facturas").insert({ storage_path: path, archivo_url: path }).select("id").single();
      if (errIns) throw new Error("No se pudo crear el registro: " + errIns.message);

      const res = await llamarFuncionSesion("lector-facturas", { factura_id: nueva.id });
      if (!res?.ok) throw new Error(res?.error || "El lector no devolvió datos");

      const { data: f } = await supabase
        .from("facturas").select("*, proveedores(nombre, nit)").eq("id", nueva.id).single();
      const { data: ls } = await supabase
        .from("factura_lineas").select("*").eq("factura_id", nueva.id).order("orden");

      setFactura(f);
      setLineas(ls || []);
      setLectura(res);
      setPaso("revision");
    } catch (e) {
      setError(e.message);
      setPaso("inicio");
    }
  };

  const editar = (campo, valor) => setFactura((f) => ({ ...f, [campo]: valor }));
  const editarLinea = (id, campo, valor) =>
    setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));

  const registrar = async () => {
    setError("");
    setRegistrando(true);
    try {
      await Promise.all(lineas.map((l) =>
        supabase.from("factura_lineas")
          .update({ categoria_id: l.categoria_id || null, total: Number(l.total) })
          .eq("id", l.id)
      ));

      const { error: errF } = await supabase.from("facturas").update({
        serie: factura.serie,
        numero: factura.numero,
        fecha: factura.fecha,
        monto_total: Number(factura.monto_total),
        centro_costo_id: centroId,
        estado_lectura: "confirmada",
      }).eq("id", factura.id);
      if (errF) throw new Error(errF.message);

      const { error: errR } = await supabase.rpc("registrar_egreso_factura", {
        p_factura_id: factura.id,
        p_bolsa_id: bolsaId,
      });
      if (errR) throw new Error(errR.message);

      setPaso("listo");
      onRegistrada && onRegistrada();
    } catch (e) {
      setError(e.message);
    } finally {
      setRegistrando(false);
    }
  };

  const reiniciar = () => {
    setArchivo(null); setPreview(null); setFactura(null); setLineas([]);
    setLectura(null); setCentroId(""); setBolsaId(""); setError(""); setPaso("inicio");
  };

  const sumaLineas = lineas.reduce((a, l) => a + Number(l.total || 0), 0);
  const descuadre = lineas.length > 0 && Math.abs(sumaLineas - Number(factura?.monto_total || 0)) > 1;
  const puedeRegistrar = centroId && bolsaId && Number(factura?.monto_total) > 0;

  if (paso === "listo") {
    return (
      <div className="bg-[#161F2E] border border-emerald-800 rounded-lg p-5 text-center">
        <CheckCircle2 size={22} className="text-emerald-400 mx-auto mb-2" />
        <div className="font-serif text-lg">Gasto registrado</div>
        <div className="text-xs text-[#8A93A3] mt-1">
          Se descontaron {fmt(factura.monto_total)} de la bolsa que elegiste.
        </div>
        <button onClick={reiniciar} className="mt-4 bg-[#C9A227] text-[#101826] font-medium px-4 py-2 rounded-md text-sm">
          Subir otra factura
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-md p-2.5">{error}</div>}

      {paso !== "revision" && (
        <div>
          <p className="text-xs text-[#8A93A3] mb-3">
            Subí la foto o el PDF de la factura. Los datos se leen solos y los revisás antes de descontar el dinero.
          </p>
          <label
            className="flex flex-col items-center justify-center gap-2 border border-dashed border-[#2A3547] rounded-lg py-8 cursor-pointer hover:border-[#C9A227]/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); elegirArchivo(e.dataTransfer.files && e.dataTransfer.files[0]); }}
          >
            {preview ? (
              <img src={preview} alt="" className="max-h-56 rounded-md" />
            ) : archivo ? (
              <>
                <FileText size={22} className="text-[#C9A227]" />
                <span className="text-sm">{archivo.name}</span>
              </>
            ) : (
              <>
                <Upload size={22} className="text-[#8A93A3]" />
                <span className="text-sm text-[#8A93A3]">Tocá para elegir la factura</span>
                <span className="text-[11px] text-[#6b7280]">Foto o PDF</span>
              </>
            )}
            <input type="file" accept="image/*,application/pdf" className="hidden"
              disabled={paso === "leyendo"} onChange={(e) => elegirArchivo(e.target.files && e.target.files[0])} />
          </label>

          <button onClick={subirYLeer} disabled={!archivo || paso === "leyendo"}
            className="w-full mt-3 bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2.5 rounded-md text-sm flex items-center justify-center gap-1.5">
            <Sparkles size={15} /> {paso === "leyendo" ? "Leyendo la factura..." : "Leer factura"}
          </button>
        </div>
      )}

      {paso === "revision" && factura && (
        <div className="space-y-4">
          <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="font-serif text-lg truncate">
                  {factura.proveedores?.nombre || "Proveedor no identificado"}
                </div>
                {factura.proveedores?.nit && (
                  <div className="text-[11px] text-[#8A93A3]">NIT {factura.proveedores.nit}</div>
                )}
              </div>
              {lectura?.revisar && (
                <span className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-amber-700 text-amber-400 uppercase tracking-wide">
                  <AlertTriangle size={11} /> Revisar
                </span>
              )}
            </div>

            {lectura?.observaciones && (
              <div className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-800 rounded-md p-2.5 mb-3">
                {lectura.observaciones}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Serie" value={factura.serie || ""} onChange={(e) => editar("serie", e.target.value)} />
              <Campo label="Número" value={factura.numero || ""} onChange={(e) => editar("numero", e.target.value)} />
              <Campo label="Fecha" type="date" value={factura.fecha || ""} onChange={(e) => editar("fecha", e.target.value)} />
              <CampoMoneda label="Total" value={factura.monto_total} onChange={(n) => editar("monto_total", n)} />
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#8A93A3] mb-2">Renglones</div>
            {lineas.length === 0 ? (
              <div className="text-xs text-[#8A93A3] bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
                El lector no encontró renglones. Se registra el total directamente.
              </div>
            ) : (
              <div className="space-y-1.5">
                {lineas.map((l) => (
                  <div key={l.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
                    <div className="text-sm mb-2">{l.descripcion}</div>
                    <div className="flex gap-2">
                      <input type="number" value={l.total}
                        onChange={(e) => editarLinea(l.id, "total", e.target.value)}
                        className="w-28 bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs text-right focus:outline-none focus:border-[#C9A227]" />
                      <select value={l.categoria_id || ""}
                        onChange={(e) => editarLinea(l.id, "categoria_id", e.target.value)}
                        className="flex-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#C9A227]">
                        <option value="">Sin categoría</option>
                        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {descuadre && (
              <div className="text-[11px] text-amber-400 mt-2">
                Los renglones suman {fmt(sumaLineas)} y el total dice {fmt(factura.monto_total)}. Revisá cuál está mal.
              </div>
            )}
          </div>

          <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4 space-y-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿A qué obra pertenece?</span>
              <select value={centroId} onChange={(e) => setCentroId(e.target.value)}
                className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]">
                <option value="">Elegí una obra</option>
                {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-[#8A93A3]">¿De qué bolsa sale el dinero?</span>
              <select value={bolsaId} onChange={(e) => setBolsaId(e.target.value)}
                className="w-full mt-1 bg-[#0C121C] border border-[#2A3547] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#C9A227]">
                <option value="">Elegí una bolsa</option>
                {bolsas.map((b) => (
                  <option key={b.id} value={b.id}>{b.nombre} — {fmt(b.saldo_actual)}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={reiniciar} className="flex-1 text-xs bg-[#2A3547] py-2.5 rounded-md">Descartar</button>
            <button onClick={registrar} disabled={!puedeRegistrar || registrando}
              className="flex-1 text-xs bg-[#C9A227] disabled:opacity-40 text-[#101826] font-medium py-2.5 rounded-md">
              {registrando ? "Registrando..." : "Registrar gasto"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MovimientosTesoreria() {
  const [movs, setMovs] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("movimientos")
        .select("*, centros_costo(nombre), categorias(nombre), origen:bolsa_origen_id(nombre), destino:bolsa_destino_id(nombre)")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      setMovs(data || []);
      setCargando(false);
    })();
  }, []);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;
  if (movs.length === 0) return <div className="text-sm text-[#8A93A3]">Sin movimientos todavía.</div>;

  return (
    <div className="space-y-2">
      {movs.map((m) => {
        const color = m.tipo === "ingreso" ? "text-emerald-400" : m.tipo === "egreso" ? "text-red-400" : "text-[#C9A227]";
        const signo = m.tipo === "ingreso" ? "+" : m.tipo === "egreso" ? "−" : "";
        return (
          <div key={m.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">{m.descripcion || "Sin descripción"}</div>
                <div className="text-[11px] text-[#8A93A3] truncate">
                  {fmtDate(m.fecha)}
                  {m.tipo === "traslado"
                    ? ` · ${m.origen?.nombre} → ${m.destino?.nombre}`
                    : ` · ${m.origen?.nombre || m.destino?.nombre || ""}`}
                </div>
                {(m.centros_costo?.nombre || m.categorias?.nombre) && (
                  <div className="text-[10px] text-[#8A93A3] mt-0.5">
                    {[m.centros_costo?.nombre, m.categorias?.nombre].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <div className={`font-mono text-sm shrink-0 ${color}`}>{signo}{fmt(m.monto)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Inversión declarada por obra ----------

function PresupuestoObras() {
  const [filas, setFilas] = useState([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("v_presupuesto_centros").select("*").order("nombre");
      setFilas(data || []);
    })();
  }, []);

  if (filas.length === 0) return null;

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#8A93A3] mb-2">Obras</div>
      <div className="space-y-2">
        {filas.map((c) => {
          const tope = c.inversion_declarada != null;
          const pct = tope && Number(c.inversion_declarada) > 0
            ? Math.min(100, (Number(c.gastado) / Number(c.inversion_declarada)) * 100)
            : 0;
          const apretado = tope && pct >= 85;
          return (
            <div key={c.id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm truncate">{c.nombre}</div>
                <div className="font-mono text-xs shrink-0">{fmt(c.gastado)}</div>
              </div>
              {tope ? (
                <>
                  <div className="h-1.5 bg-[#0C121C] rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${apretado ? "bg-red-500" : "bg-[#C9A227]"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-[#8A93A3] mt-1">
                    Quedan {fmt(c.disponible)} de {fmt(c.inversion_declarada)} declarados
                  </div>
                </>
              ) : (
                <div className="text-[10px] text-[#6b7280] mt-1">Sin inversión declarada</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Adjuntar documentos a gastos ya pagados ----------

function DocumentarGastos({ onCambio }) {
  const [gastos, setGastos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase.from("v_gastos_documentacion").select("*").limit(40);
    setGastos(data || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Cargando...</div>;
  if (gastos.length === 0) return <div className="text-sm text-[#8A93A3]">Todavía no hay gastos registrados.</div>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-[#8A93A3] mb-1">
        Cada gasto puede llevar varios papeles: el voucher del banco y después la factura del
        proveedor. Solo las facturas cierran el pendiente.
      </p>
      {gastos.map((g) => {
        const faltaFactura = Number(g.en_facturas) < Number(g.pagado) - 1;
        return (
          <div key={g.movimiento_id} className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">{g.descripcion || "Sin descripción"}</div>
                <div className="text-[11px] text-[#8A93A3] truncate">
                  {fmtDate(g.fecha)} · {g.centro_costo || "Sin obra"} · {g.bolsa}
                </div>
              </div>
              <div className="font-mono text-sm shrink-0">{fmt(g.pagado)}</div>
            </div>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {faltaFactura ? (
                <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-amber-700 text-amber-400 uppercase tracking-wide">
                  <AlertTriangle size={10} /> Falta factura por {fmt(Number(g.pagado) - Number(g.en_facturas))}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-emerald-700 text-emerald-400 uppercase tracking-wide">
                  <CheckCircle2 size={10} /> Documentado
                </span>
              )}
              {Number(g.en_vouchers) > 0 && (
                <span className="text-[10px] text-[#8A93A3]">Voucher {fmt(g.en_vouchers)}</span>
              )}
              <button
                onClick={() => setAbierto(abierto === g.movimiento_id ? null : g.movimiento_id)}
                className="ml-auto text-[11px] bg-[#2A3547] hover:bg-[#3a4864] px-2.5 py-1 rounded-md"
              >
                {abierto === g.movimiento_id ? "Cerrar" : `Documentos (${g.documentos})`}
              </button>
            </div>

            {abierto === g.movimiento_id && (
              <DocumentosDelGasto
                gasto={g}
                onCambio={() => { cargar(); onCambio && onCambio(); }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DocumentosDelGasto({ gasto, onCambio }) {
  const [docs, setDocs] = useState([]);
  const [tipo, setTipo] = useState("factura");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  const cargar = async () => {
    const { data } = await supabase
      .from("facturas")
      .select("id, tipo_documento, serie, numero, fecha, monto_total, confianza, proveedores(nombre)")
      .eq("movimiento_id", gasto.movimiento_id)
      .order("created_at");
    setDocs(data || []);
  };
  useEffect(() => { cargar(); }, [gasto.movimiento_id]);

  const subir = async (archivo) => {
    if (!archivo) return;
    setSubiendo(true);
    setError("");
    try {
      const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase();
      const hoy = new Date();
      const carpeta = `${hoy.getFullYear()}/${String(hoy.getMonth() + 1).padStart(2, "0")}`;
      const path = `${carpeta}/${crypto.randomUUID()}.${ext}`;

      const { error: errUp } = await supabase.storage
        .from("facturas").upload(path, archivo, { contentType: archivo.type });
      if (errUp) throw new Error("No se pudo subir: " + errUp.message);

      const { data: nueva, error: errIns } = await supabase
        .from("facturas")
        .insert({ storage_path: path, archivo_url: path, tipo_documento: tipo })
        .select("id").single();
      if (errIns) throw new Error(errIns.message);

      const res = await llamarFuncionSesion("lector-facturas", { factura_id: nueva.id });
      if (!res?.ok) throw new Error(res?.error || "El lector no devolvió datos");

      const { error: errLink } = await supabase.rpc("vincular_factura", {
        p_movimiento_id: gasto.movimiento_id,
        p_factura_id: nueva.id,
      });
      if (errLink) throw new Error(errLink.message);

      await cargar();
      onCambio && onCambio();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubiendo(false);
    }
  };

  const etiqueta = { factura: "Factura", voucher: "Voucher", recibo: "Recibo", nota_credito: "Nota de crédito", otro: "Otro" };

  return (
    <div className="mt-3 pt-3 border-t border-[#2A3547] space-y-2">
      {error && <div className="text-[11px] text-red-400 bg-red-950/30 border border-red-800 rounded-md p-2">{error}</div>}

      {docs.length > 0 && (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <div key={d.id} className="bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs truncate">
                  <span className="text-[#C9A227]">{etiqueta[d.tipo_documento] || d.tipo_documento}</span>
                  {d.proveedores?.nombre ? ` · ${d.proveedores.nombre}` : ""}
                </div>
                <div className="text-[10px] text-[#8A93A3] truncate">
                  {[d.serie, d.numero].filter(Boolean).join("-")}
                  {d.fecha ? ` · ${fmtDate(d.fecha)}` : ""}
                </div>
              </div>
              <div className="font-mono text-xs shrink-0">{fmt(d.monto_total)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        {["factura", "voucher", "recibo"].map((t) => (
          <button key={t} type="button" onClick={() => setTipo(t)}
            className={`flex-1 text-[11px] py-1.5 rounded-md border ${tipo === t ? "bg-[#C9A227] text-[#101826] border-[#C9A227] font-medium" : "border-[#2A3547] text-[#EDE7D9]"}`}>
            {etiqueta[t]}
          </button>
        ))}
      </div>

      <label className="flex items-center justify-center gap-1.5 text-[11px] bg-[#2A3547] hover:bg-[#3a4864] py-2 rounded-md cursor-pointer">
        <Upload size={12} /> {subiendo ? "Leyendo..." : `Adjuntar ${etiqueta[tipo].toLowerCase()}`}
        <input type="file" accept="image/*,application/pdf" className="hidden" disabled={subiendo}
          onChange={(e) => subir(e.target.files && e.target.files[0])} />
      </label>
    </div>
  );
}

// ---------- Mapa de flujo del dinero ----------
//
// Tres anillos: el centro es todo el dinero disponible, el primer
// anillo son las bolsas, y el segundo las obras a donde se fue.
// Al tocar una obra se abre el desglose por categoría abajo.
// Todo en SVG, sin librerías externas.

function MapaFlujo({ bolsas, total }) {
  const [flujos, setFlujos] = useState([]);
  const [desglose, setDesglose] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState(null); // { nivel: 'bolsa'|'centro', id, nombre, monto }

  useEffect(() => {
    (async () => {
      const [{ data: f }, { data: d }] = await Promise.all([
        supabase.from("v_flujo_bolsa_centro").select("*"),
        supabase.from("v_flujo_centro_categoria").select("*"),
      ]);
      setFlujos(f || []);
      setDesglose(d || []);
      setCargando(false);
    })();
  }, []);

  if (cargando) return <div className="text-sm text-[#8A93A3]">Armando el mapa...</div>;

  const CX = 180, CY = 195, R1 = 82, R2 = 152;
  const conSaldo = bolsas.filter((b) => Number(b.saldo_actual) > 0 || flujos.some((f) => f.bolsa_id === b.id));
  const maxBolsa = Math.max(1, ...conSaldo.map((b) => Number(b.saldo_actual) || 0));

  // Anillo 1: bolsas repartidas en círculo
  const nodosBolsa = conSaldo.map((b, i) => {
    const ang = (-90 + (i * 360) / Math.max(1, conSaldo.length)) * (Math.PI / 180);
    const salido = flujos.filter((f) => f.bolsa_id === b.id).reduce((s, f) => s + Number(f.total), 0);
    return {
      ...b,
      ang,
      x: CX + R1 * Math.cos(ang),
      y: CY + R1 * Math.sin(ang),
      r: 9 + 11 * Math.sqrt(Math.max(0, Number(b.saldo_actual)) / maxBolsa),
      salido,
    };
  });

  // Anillo 2: obras de la bolsa seleccionada
  const bolsaSel = sel?.nivel === "bolsa" ? sel.id : sel?.nivel === "centro" ? sel.bolsaId : null;
  const hijos = bolsaSel ? flujos.filter((f) => f.bolsa_id === bolsaSel) : [];
  const nodoPadre = nodosBolsa.find((n) => n.id === bolsaSel);
  const maxHijo = Math.max(1, ...hijos.map((h) => Number(h.total)));

  const nodosCentro = hijos.map((h, i) => {
    const abanico = Math.min(120, 34 * Math.max(1, hijos.length)) * (Math.PI / 180);
    const base = nodoPadre ? nodoPadre.ang : 0;
    const ang = hijos.length === 1 ? base : base - abanico / 2 + (i * abanico) / (hijos.length - 1);
    return {
      ...h,
      x: CX + R2 * Math.cos(ang),
      y: CY + R2 * Math.sin(ang),
      r: 7 + 9 * Math.sqrt(Number(h.total) / maxHijo),
    };
  });

  const curva = (x1, y1, x2, y2) => {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const cx = mx + (my - CY) * 0.18, cy = my - (mx - CX) * 0.18;
    return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  };

  const corto = (t, n) => (t && t.length > n ? t.slice(0, n - 1) + "…" : t || "");

  const catsDelCentro = sel?.nivel === "centro"
    ? desglose.filter((d) => d.centro_id === sel.id).sort((a, b) => Number(b.total) - Number(a.total))
    : [];

  return (
    <div>
      <svg viewBox="0 0 360 390" className="w-full" style={{ maxHeight: "62vh" }}>
        {/* Enlaces centro → bolsas */}
        {nodosBolsa.map((n) => (
          <path key={`l-${n.id}`} d={curva(CX, CY, n.x, n.y)} fill="none"
            stroke={bolsaSel === n.id ? "#C9A227" : "#2A3547"}
            strokeWidth={bolsaSel === n.id ? 2 : 1.2} />
        ))}

        {/* Enlaces bolsa → obras */}
        {nodoPadre && nodosCentro.map((n, i) => (
          <path key={`lc-${i}`} d={curva(nodoPadre.x, nodoPadre.y, n.x, n.y)} fill="none"
            stroke={sel?.nivel === "centro" && sel.id === n.centro_id ? "#C9A227" : "#3a4864"}
            strokeWidth={sel?.nivel === "centro" && sel.id === n.centro_id ? 2 : 1.2} />
        ))}

        {/* Obras */}
        {nodosCentro.map((n, i) => {
          const activo = sel?.nivel === "centro" && sel.id === n.centro_id;
          return (
            <g key={`c-${i}`} onClick={() => setSel({ nivel: "centro", id: n.centro_id, nombre: n.centro, monto: n.total, bolsaId: n.bolsa_id })} style={{ cursor: "pointer" }}>
              <circle cx={n.x} cy={n.y} r={n.r} fill={activo ? "#C9A227" : "#1A2333"}
                stroke={activo ? "#C9A227" : "#3a4864"} strokeWidth="1.5" />
              <text x={n.x} y={n.y + n.r + 9} textAnchor="middle" fontSize="7.5"
                fill={activo ? "#C9A227" : "#8A93A3"}>{corto(n.centro, 16)}</text>
              <text x={n.x} y={n.y + n.r + 17} textAnchor="middle" fontSize="7" fill="#8A93A3">
                {fmt(n.total)}
              </text>
            </g>
          );
        })}

        {/* Bolsas */}
        {nodosBolsa.map((n) => {
          const activo = bolsaSel === n.id;
          return (
            <g key={n.id} onClick={() => setSel(activo && sel.nivel === "bolsa" ? null : { nivel: "bolsa", id: n.id, nombre: n.nombre, monto: n.saldo_actual })} style={{ cursor: "pointer" }}>
              <circle cx={n.x} cy={n.y} r={n.r}
                fill={n.tipo === "reserva" ? "#3a2f10" : activo ? "#C9A227" : "#161F2E"}
                stroke={activo ? "#C9A227" : "#2A3547"} strokeWidth="2" />
              <text x={n.x} y={n.y + n.r + 9} textAnchor="middle" fontSize="8"
                fill={activo ? "#C9A227" : "#EDE7D9"}>{corto(n.nombre.split("—")[0].trim(), 14)}</text>
              <text x={n.x} y={n.y + n.r + 17} textAnchor="middle" fontSize="7" fill="#8A93A3">
                {fmt(n.saldo_actual)}
              </text>
            </g>
          );
        })}

        {/* Centro */}
        <g onClick={() => setSel(null)} style={{ cursor: "pointer" }}>
          <circle cx={CX} cy={CY} r="34" fill="#0C121C" stroke="#C9A227" strokeWidth="2" />
          <text x={CX} y={CY - 3} textAnchor="middle" fontSize="9" fill="#8A93A3">Disponible</text>
          <text x={CX} y={CY + 9} textAnchor="middle" fontSize="10" fill="#C9A227" fontWeight="600">
            {fmt(total)}
          </text>
        </g>
      </svg>

      {/* Panel de detalle */}
      {!sel ? (
        <p className="text-[11px] text-[#8A93A3] text-center px-4">
          Tocá una bolsa para ver a dónde se fue su dinero. Tocá el centro para volver.
        </p>
      ) : sel.nivel === "bolsa" ? (
        <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4">
          <div className="font-serif text-lg">{sel.nombre}</div>
          <div className="text-[11px] text-[#8A93A3] mt-0.5">Disponible {fmt(sel.monto)}</div>
          {nodosCentro.length === 0 ? (
            <div className="text-xs text-[#8A93A3] mt-3">Esta bolsa todavía no ha financiado ninguna obra.</div>
          ) : (
            <div className="mt-3 space-y-1.5">
              {nodosCentro.map((n, i) => (
                <button key={i}
                  onClick={() => setSel({ nivel: "centro", id: n.centro_id, nombre: n.centro, monto: n.total, bolsaId: n.bolsa_id })}
                  className="w-full flex justify-between items-baseline text-xs bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-2 hover:border-[#C9A227]/50">
                  <span className="truncate">{n.centro}</span>
                  <span className="font-mono shrink-0 ml-2">{fmt(n.total)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[#161F2E] border border-[#2A3547] rounded-lg p-4">
          <div className="font-serif text-lg">{sel.nombre}</div>
          <div className="text-[11px] text-[#8A93A3] mt-0.5">
            Recibió {fmt(sel.monto)} de esta bolsa
          </div>
          {catsDelCentro.length === 0 ? (
            <div className="text-xs text-[#8A93A3] mt-3">Sin desglose todavía.</div>
          ) : (
            <div className="mt-3 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-[#8A93A3]">En qué se gastó</div>
              {catsDelCentro.map((c, i) => (
                <div key={i} className="flex justify-between items-baseline text-xs bg-[#0C121C] border border-[#2A3547] rounded-md px-2.5 py-2">
                  <span className="truncate">
                    {c.categoria}
                    <span className="text-[#8A93A3]"> · {c.movimientos} mov.</span>
                  </span>
                  <span className="font-mono shrink-0 ml-2">{fmt(c.total)}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setSel({ nivel: "bolsa", id: sel.bolsaId, nombre: bolsas.find((b) => b.id === sel.bolsaId)?.nombre, monto: bolsas.find((b) => b.id === sel.bolsaId)?.saldo_actual })}
            className="mt-3 text-[11px] text-[#C9A227] underline">
            Volver a la bolsa
          </button>
        </div>
      )}
    </div>
  );
}

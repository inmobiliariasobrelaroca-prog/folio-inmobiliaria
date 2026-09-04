// ============================================================
// ModuloTesoreria.tsx — Grupo Sobre la Roca
//
// Punto de entrada del módulo. Las pantallas viven en src/tesoreria/,
// así que para actualizar una parte solo se reemplaza ese archivo.
//
// Instalado con dos líneas en App.tsx:
//   1) junto a los demás imports:
//        import ModuloTesoreria from "./ModuloTesoreria";
//   2) dentro de AppInterno, junto a <AvisoCodigoPendiente />:
//        <ModuloTesoreria perfil={perfil} />
//
// Qué ve cada quien lo deciden los permisos del rol en la base:
//   gestionar_finanzas     entra al módulo
//   finanzas_registrar     puede registrar movimientos
//   finanzas_documentar    puede subir facturas y vouchers
//   finanzas_ver_prestamos ve los créditos
// El alcance (qué bolsas y qué obras) lo filtra el RLS de Supabase.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { Calculator, Zap, Upload, FileText, X, Plus, Clock, AlertTriangle, RefreshCw, Shield, Users, Store, CreditCard, Home } from "lucide-react";
import { fmt } from "./tesoreria/comun";
import MapaFlujo from "./tesoreria/Mapa";
import { ResumenTesoreria, MovimientosTesoreria } from "./tesoreria/Resumen";
import RegistrarMovimiento from "./tesoreria/Registrar";
import SubirFacturaTesoreria from "./tesoreria/Facturas";
import DocumentarGastos from "./tesoreria/Documentos";
import Compromisos from "./tesoreria/Compromisos";
import Permisos from "./tesoreria/Permisos";
import Anticipos from "./tesoreria/Anticipos";
import Rentas from "./tesoreria/Rentas";
import Tarjetas from "./tesoreria/Tarjetas";
import Fuentes from "./tesoreria/Fuentes";

// Se muestra en el encabezado del módulo. Sirve para saber de un
// vistazo qué versión quedó desplegada, sin abrir el repositorio.
const VERSION = "v49";

// Mismo patrón de eventos de ventana que ya usa el aviso de código
// pendiente. Permite poner el botón en el TopBar sin tener que pasar
// props por media app.
const EVENTO_ABRIR = "slr:abrir-tesoreria";
const EVENTO_BOTON = "slr:tesoreria-boton-montado";

// ¿Puede esta persona entrar al módulo? Mismo criterio que la función
// es_admin_financiero() de la base.
function puedeEntrarTesoreria(perfil) {
  const rol = perfil?.usuario?.roles;
  return perfil?.tipo === "staff" &&
    (!!rol?.es_administrador || !!rol?.permisos?.gestionar_finanzas);
}

// Botón para el TopBar. Al montarse avisa, y el módulo esconde su
// botón flotante para que no queden los dos.
export function BotonTesoreria({ perfil }) {
  useEffect(() => {
    window.dispatchEvent(new Event(EVENTO_BOTON));
    const t = setTimeout(() => window.dispatchEvent(new Event(EVENTO_BOTON)), 0);
    return () => clearTimeout(t);
  }, []);

  if (!puedeEntrarTesoreria(perfil)) return null;

  return (
    <button
      onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR))}
      title="Tesorería"
      className="text-[#8A93A3] hover:text-[#EDE7D9] p-1.5"
    >
      <Calculator size={16} />
    </button>
  );
}

export default function ModuloTesoreria({ perfil }) {
  const [abierto, setAbierto] = useState(false);
  const [hayBotonArriba, setHayBotonArriba] = useState(false);

  useEffect(() => {
    const abrir = () => setAbierto(true);
    const marcar = () => setHayBotonArriba(true);
    window.addEventListener(EVENTO_ABRIR, abrir);
    window.addEventListener(EVENTO_BOTON, marcar);
    return () => {
      window.removeEventListener(EVENTO_ABRIR, abrir);
      window.removeEventListener(EVENTO_BOTON, marcar);
    };
  }, []);

  if (!puedeEntrarTesoreria(perfil)) return null;

  return (
    <>
      {/* Respaldo: si el botón del TopBar no está puesto, queda este
          flotante para no perder el acceso al módulo. */}
      {!abierto && !hayBotonArriba && (
        <button
          onClick={() => setAbierto(true)}
          title="Tesorería"
          className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-[#C9A227] text-[#101826] shadow-lg flex items-center justify-center hover:brightness-110"
        >
          <Calculator size={20} />
        </button>
      )}
      {abierto && <PanelTesoreria perfil={perfil} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function PanelTesoreria({ perfil, onCerrar }) {
  const rol = perfil?.usuario?.roles;
  const esSuper = !!rol?.es_administrador;
  const puede = (clave) => esSuper || !!rol?.permisos?.[clave];

  // Las pestañas que no corresponden al permiso ni siquiera se muestran.
  const pestanas = [
    ["mapa", "Mapa", Zap, true],
    ["registrar", "Registrar", Plus, puede("finanzas_registrar")],
    ["resumen", "Resumen", Calculator, true],
    ["facturas", "Subir factura", Upload, puede("finanzas_documentar")],
    ["pendientes", "Documentar", AlertTriangle, puede("finanzas_documentar")],
    ["compromisos", "Por pagar", Clock, true],
    ["anticipos", "Adelantos", Users, esSuper],
    ["rentas", "Rentas", Store, puede("finanzas_registrar")],
    ["tarjetas", "Tarjetas", CreditCard, esSuper],
    ["fuentes", "Fuentes", Home, esSuper],
    ["movimientos", "Movimientos", FileText, true],
    ["permisos", "Permisos", Shield, esSuper],
  ].filter((p) => p[3]);

  const [tab, setTab] = useState("mapa");
  const [bolsas, setBolsas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [cuotas, setCuotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState("");
  // Cambiar esta versión remonta la pestaña visible, así cada pantalla
  // vuelve a pedir sus datos sin tener que cerrar y abrir el módulo.
  const [version, setVersion] = useState(0);

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

  const refrescar = async () => {
    setActualizando(true);
    await cargar();
    setVersion((v) => v + 1);
    setActualizando(false);
  };

  // Al volver a la pestaña del navegador después de un rato, se refresca solo.
  useEffect(() => {
    let ocultaDesde = null;
    const alCambiar = () => {
      if (document.visibilityState === "hidden") {
        ocultaDesde = Date.now();
      } else if (ocultaDesde && Date.now() - ocultaDesde > 60000) {
        ocultaDesde = null;
        refrescar();
      }
    };
    document.addEventListener("visibilitychange", alCambiar);
    return () => document.removeEventListener("visibilitychange", alCambiar);
  }, []);

  // Las obras que llegan acá ya vienen filtradas por el alcance del rol,
  // así que basta con nombrarlas.
  const nombresObras = centros.map((c) => c.nombre);
  const obrasTexto =
    nombresObras.length === 0
      ? ""
      : nombresObras.length <= 2
      ? nombresObras.join(" · ")
      : `${nombresObras.slice(0, 2).join(" · ")} y ${nombresObras.length - 2} más`;

  // El rol no le dice nada a quien lo tiene; su obra sí.
  const etiquetaAlcance = [perfil?.usuario?.nombre, obrasTexto]
    .filter(Boolean)
    .join(" · ");

  // Tres estados del dinero, no dos:
  //   propio   — se puede gastar y lo maneja quien está viendo
  //   delegado — se puede gastar, pero lo maneja otra persona
  //   apartado — no se puede usar (retenido por el banco o ya comprometido)
  const miRol = perfil?.usuario?.rol_id;
  const suma = (filtro) =>
    bolsas.filter(filtro).reduce((acc, b) => acc + Number(b.saldo_actual || 0), 0);

  const esDelegada = (b) =>
    b.delegada_a_rol_id && b.delegada_a_rol_id !== miRol;

  const libre    = suma((b) => b.disponible_para_gasto !== false && !esDelegada(b));
  const delegado = suma((b) => b.disponible_para_gasto !== false && esDelegada(b));
  const apartado = suma((b) => b.disponible_para_gasto === false);

  return (
    <div className="fixed inset-0 z-50 bg-[#101826] text-[#EDE7D9] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[#0C121C] border-b border-[#2A3547] px-5 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#8A93A3]">
              Interno · <span className="text-[#6b7280]">{VERSION}</span>
            </div>
            <div className="font-serif text-xl leading-tight">Tesorería</div>
            {/* Quien ve todo necesita saber con qué sesión entró; a quien
                tiene una obra asignada le sirve más ver cuál es. */}
            <div className="text-[10px] text-[#8A93A3] mt-0.5">
              {esSuper ? (
                <>
                  {perfil?.usuario?.nombre || "Sin nombre"}
                  {rol?.nombre ? ` · ${rol.nombre}` : ""}
                  <span style={{ color: "#C9A227" }}> · ve todo</span>
                </>
              ) : (
                etiquetaAlcance
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={refrescar} disabled={actualizando || cargando}
              title="Actualizar desde la base de datos"
              className="text-[#8A93A3] hover:text-[#EDE7D9] p-1.5 disabled:opacity-40">
              <RefreshCw size={17} className={actualizando ? "animate-spin" : ""} />
            </button>
            <button onClick={onCerrar} title="Cerrar"
              className="text-[#8A93A3] hover:text-[#EDE7D9] p-1.5"><X size={20} /></button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-5 pb-24">
        {/* Las pestañas se acomodan en varias filas si no caben. Antes usaban
            overflow-x-auto y la última quedaba fuera de vista, sin ninguna
            señal de que hubiera más. */}
        <div className="flex flex-wrap gap-x-1 gap-y-0.5 mb-4 border-b border-[#2A3547]">
          {pestanas.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 -mb-px whitespace-nowrap ${tab === id ? "border-[#C9A227] text-[#EDE7D9]" : "border-transparent text-[#8A93A3]"}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-md p-2.5 mb-4">{error}</div>}

        <div key={`${tab}-${version}`}>
        {cargando ? (
          <div className="text-sm text-[#8A93A3]">Cargando...</div>
        ) : tab === "mapa" ? (
          <MapaFlujo bolsas={bolsas} libre={libre} delegado={delegado} apartado={apartado} />
        ) : tab === "registrar" ? (
          <RegistrarMovimiento bolsas={bolsas} centros={centros} onGuardado={cargar} />
        ) : tab === "resumen" ? (
          <ResumenTesoreria libre={libre} delegado={delegado} apartado={apartado} bolsas={bolsas} centros={centros} cuotas={cuotas} />
        ) : tab === "facturas" ? (
          <SubirFacturaTesoreria bolsas={bolsas} centros={centros} onRegistrada={cargar} />
        ) : tab === "pendientes" ? (
          <DocumentarGastos onCambio={cargar} />
        ) : tab === "compromisos" ? (
          <Compromisos bolsas={bolsas} onCambio={cargar} />
        ) : tab === "anticipos" ? (
          <Anticipos bolsas={bolsas} onCambio={cargar} />
        ) : tab === "rentas" ? (
          <Rentas onCambio={cargar} />
        ) : tab === "tarjetas" ? (
          <Tarjetas bolsas={bolsas} onCambio={cargar} />
        ) : tab === "fuentes" ? (
          <Fuentes onCambio={cargar} />
        ) : tab === "permisos" ? (
          <Permisos />
        ) : (
          <MovimientosTesoreria />
        )}
        </div>
      </div>
    </div>
  );
}

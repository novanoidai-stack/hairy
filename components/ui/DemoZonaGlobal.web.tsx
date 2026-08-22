import { useEffect, useRef, useState } from 'react';
import { DemoSpotlight } from './DemoSpotlight';
import { traerAlFoco } from '@/lib/demoScroll';

// Enfoque guiado GENERICO para la demo (web).
//
// El recorrido de demo.html manda acciones del tipo `zona-<clave>`; aqui
// buscamos en el DOM el elemento marcado con `data-demo="<clave>"`, lo traemos a
// la vista y lo iluminamos con el mismo spotlight que usan la agenda o la ficha.
//
// Asi cualquier pantalla puede exponer un detalle enfocable sin escribir logica
// de demo: basta con `dataSet={{ demo: 'caja-cobro' }}` en la View (o
// `data-demo` en un div). Se monta una sola vez, en el layout raiz.
//
// Se reintenta unos frames porque el paso navega y la pantalla acaba de montarse.

const ETIQUETAS: Record<string, string> = {
  'citas-stats': 'Resumen del periodo',
  'citas-filtros': 'Buscador y filtros',
  'citas-sinconfirmar': 'Sin confirmar por el cliente',
  'espera-lista': 'Lista de espera',
  'espera-acciones': 'Agendar y acciones',
  'presupuestos-estados': 'Estados del presupuesto',
  'presupuestos-lista': 'Listado de presupuestos',
  'inventario-kpis': 'Métricas de stock',
  'inventario-stock': 'Stock bajo mínimo',
  'inventario-categorias': 'Categorías de producto',
  'caja-cobro': 'Pendientes de cobro',
  'caja-arqueo': 'Arqueo del día',
  'caja-facturas': 'Registros descargables',
  'caja-cobrar': 'Cobrar: método, propina y señal',
  'caja-venta': 'Vender producto sin cita',
  'equipo-vistas': 'Fichas · rendimiento · horario',
  'equipo-fichas': 'Tu equipo',
  'equipo-ficha': 'Horario, control horario y bloqueos',
  'equipo-comisiones': 'Rendimiento y comisiones',
  'jornada-fichaje': 'Fichaje de jornada',
  'jornada-resumen': 'Resumen de jornada IA',
  'bandeja-mensajes': 'Mensajes de clientes',
  'bandeja-filtros': 'Filtro de conversaciones',
  'campanas-plantillas': 'Plantillas de campaña',
  'campanas-segmento': 'A quién se lo mandas',
  'resenas-categorias': 'Valoración por categorías',
  'resenas-filtros': 'Filtros de opiniones',
  'resenas-lista': 'Reseñas de clientes',
  'informes-kpis': 'Tus números del periodo',
  'informes-evolucion': 'Evolución mes a mes',
  'informes-ocupacion': 'Reparto de las citas',
  'portal-cabecera': 'Tu página de reservas',
  'portal-servicios': 'Tu catálogo, tal y como lo ve la clienta',
  'portal-extras': 'Lo que se suele olvidar',
  'portal-profesional': 'Elegir con quién',
  'portal-hora': 'Solo huecos reales',
  'ia-hub': 'Qué hace la IA',
  'ayuda-manuales': 'Manuales y guías',
};

export function DemoZonaGlobal() {
  const [zona, setZona] = useState<string | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onDemo = (e: Event) => {
      const action = (e as CustomEvent).detail?.action;
      if (typeof action !== 'string') return;
      if (action === 'cerrar') {
        targetRef.current = null;
        setZona(null);
        return;
      }
      if (action.indexOf('zona-') !== 0) {
        // Otra accion (cita, ficha, config…): esta capa se aparta.
        targetRef.current = null;
        setZona(null);
        return;
      }
      // Ojo: el contenedor reenvia la accion del paso varias veces (la pantalla
      // destino puede tardar en montarse). Si en cada reenvio soltaramos el
      // objetivo, el foco se quedaria a oscuras un instante una y otra vez
      // durante el mismo paso. Solo se suelta al CAMBIAR de zona.
      const nueva = action.slice('zona-'.length);
      setZona((prev) => {
        if (prev !== nueva) targetRef.current = null;
        return nueva;
      });
    };
    window.addEventListener('mecha-demo', onDemo);
    return () => window.removeEventListener('mecha-demo', onDemo);
  }, []);

  // Localiza el elemento marcado y lo trae a la vista.
  // Si la zona vive detras de una pestana, la abre primero: basta con marcar el
  // boton que la despliega con `data-demo-abrir="<clave>"`.
  useEffect(() => {
    if (!zona) return;
    let raf = 0;
    let scrolled = false;
    // Botones ya pulsados en ESTA zona. Antes era un simple booleano "abierto":
    // se pulsaba UNO y se daba por hecho que la zona ya estaba a la vista. Eso
    // no vale cuando hacen falta varios clics encadenados — en el portal hay que
    // abrir primero la categoria del acordeon (que arranca plegada) y solo
    // entonces existe la fila del servicio que destapa extras, profesional y
    // hora. Con un unico clic esos tres pasos del recorrido no enfocaban NADA.
    const pulsados = new Set<HTMLElement>();
    const abrir = () => {
      // `~=` en vez de `=`: un mismo boton puede ser la puerta de varias zonas
      // seguidas (en el portal, elegir servicio es lo que hace aparecer tanto el
      // paso del profesional como el de la hora).
      const btns = document.querySelectorAll(`[data-demo-abrir~="${zona}"]`);
      for (let i = 0; i < btns.length; i++) {
        const b = btns[i] as HTMLElement;
        if (pulsados.has(b)) continue;
        const r = b.getBoundingClientRect();
        if (r.height <= 0 || r.width <= 0) continue;   // aun no esta pintado
        pulsados.add(b);
        b.click();
        // Uno por vuelta: el clic provoca un render y el siguiente eslabon de la
        // cadena todavia no existe en el DOM. La siguiente pasada lo encuentra.
        return;
      }
    };
    // Ojo: expo-router deja montadas varias pantallas a la vez, asi que puede
    // haber MAS de un elemento con la misma clave (uno oculto, otro visible).
    // Nos quedamos con el primero que este realmente pintado.
    const visible = (): HTMLElement | null => {
      // `zona-nav-<pantalla>` enfoca el BOTON del menu por el que se llega a esa
      // pantalla. Los items del menu (lateral y barra movil) ya vienen marcados
      // con data-coach, asi que reusamos esa marca en vez de duplicarla.
      const esNav = zona.indexOf('nav-') === 0;
      const primeroPintado = (sel: string): HTMLElement | null => {
        const todos = document.querySelectorAll(sel);
        for (let i = 0; i < todos.length; i++) {
          const cand = todos[i] as HTMLElement;
          const r = cand.getBoundingClientRect();
          if (r.height > 0 && r.width > 0) return cand;
        }
        return null;
      };
      // `data-demo-alt` deja que un mismo bloque responda a dos claves: la ficha
      // del profesional es a la vez "tu equipo" y "la ficha de dentro".
      if (!esNav) return primeroPintado(`[data-demo="${zona}"],[data-demo-alt="${zona}"]`);
      // En movil la barra solo lleva cinco pestanas: el resto de pantallas viven
      // dentro de "Mas". Si la pestana de esta pantalla no esta en la barra,
      // enfocamos "Mas", que es por donde se llega de verdad.
      return primeroPintado(`[data-coach="${zona}"]`) || primeroPintado('[data-coach="nav-mas"]');
    };
    // Vigilamos mientras la zona este activa (la pantalla puede re-renderizar y
    // cambiar el nodo), pero consultando el DOM solo cada ~120 ms: el rAF suelto
    // haria un querySelectorAll por frame sin ganar nada.
    let ultimo = 0;
    const buscar = (t: number) => {
      raf = requestAnimationFrame(buscar);
      if (t - ultimo < 120) return;
      ultimo = t;
      abrir();
      const el = visible();
      if (!el) return;
      targetRef.current = el;
      if (!scrolled && typeof el.scrollIntoView === 'function') {
        scrolled = true;
        // Los items del menu solo se acercan lo justo ('nearest'): centrarlos
        // moveria la pantalla de debajo sin motivo, pero sin nada de scroll los
        // ultimos del menu lateral (Resenas, Informes, Ayuda) se quedaban fuera
        // de pantalla y su paso se quedaba sin foco.
        if (zona.indexOf('nav-') === 0) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        else traerAlFoco(el);
      }
    };
    raf = requestAnimationFrame(buscar);
    // Al salir de la zona se recoge lo que se abrio para verla. Sin esto, los
    // paneles que abre un paso se quedan encima de los siguientes: en Caja, los
    // modales de "Cobro rapido" y "Venta rapida" se apilaban sobre el paso del
    // arqueo y el visitante veia dos ventanas tapando lo que se le explicaba.
    // El cierre se marca con `data-demo-cerrar="<clave>"` en el boton de cerrar.
    return () => {
      cancelAnimationFrame(raf);
      if (!pulsados.size) return;
      const cierres = document.querySelectorAll(`[data-demo-cerrar~="${zona}"]`);
      for (let i = 0; i < cierres.length; i++) {
        const c = cierres[i] as HTMLElement;
        if (c.getBoundingClientRect().height > 0) c.click();
      }
    };
  }, [zona]);

  if (!zona) return null;
  return (
    <DemoSpotlight
      targetRef={targetRef}
      active
      label={ETIQUETAS[zona] || ''}
      padding={12}
      radius={16}
    />
  );
}

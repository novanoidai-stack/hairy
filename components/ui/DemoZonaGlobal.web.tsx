import { useEffect, useRef, useState } from 'react';
import { DemoSpotlight } from './DemoSpotlight';

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
  'equipo-vistas': 'Fichas · rendimiento · horario',
  'equipo-fichas': 'Tu equipo',
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
    let abierto = false;
    const abrir = () => {
      if (abierto) return;
      const btn = document.querySelector(`[data-demo-abrir="${zona}"]`) as HTMLElement | null;
      if (btn) {
        abierto = true;
        btn.click();
      }
    };
    // Ojo: expo-router deja montadas varias pantallas a la vez, asi que puede
    // haber MAS de un elemento con la misma clave (uno oculto, otro visible).
    // Nos quedamos con el primero que este realmente pintado.
    const visible = (): HTMLElement | null => {
      const todos = document.querySelectorAll(`[data-demo="${zona}"]`);
      for (let i = 0; i < todos.length; i++) {
        const cand = todos[i] as HTMLElement;
        const r = cand.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) return cand;
      }
      return null;
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
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
    raf = requestAnimationFrame(buscar);
    return () => cancelAnimationFrame(raf);
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

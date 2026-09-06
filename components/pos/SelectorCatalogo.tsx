import { useEffect, useMemo, useRef, useState } from 'react';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';

// Selector unico del catalogo para cobrar (peticiones 3, 5, 10 y 11 de Jose).
//
// Antes cada linea del ticket salia de un desplegable que solo cargaba
// `productos`, asi que cobrar un servicio suelto obligaba a escribirlo a mano
// (nombre y precio) y la linea quedaba sin `ref_id`: invisible para el desglose
// de ingresos por servicio de Informes.
//
// Y el desplegable era una lista dentro de un modal de 420 px con `maxHeight:
// 200`. Con los 178 servicios del salon de Jose eso es un scroll dentro de otro
// scroll. Subir el `maxHeight` no lo arregla -- vuelve en cuanto el catalogo
// crece --, asi que aqui la lista va VIRTUALIZADA: se pintan solo las filas
// visibles, valga el catalogo 20 o 2.000.

export type TipoCatalogo = 'servicio' | 'producto' | 'suplemento';

export interface ItemCatalogo {
  id: string;
  tipo: TipoCatalogo;
  nombre: string;
  // Categoria del catalogo; 'general' cuando el registro no trae ninguna.
  categoria: string;
  precioCents: number;
  // Solo servicios: minutos de trabajo activo. Informativo, no se cobra por el.
  duracionMin?: number;
}

interface SelectorCatalogoProps {
  items: ItemCatalogo[];
  cargando?: boolean;
  onElegir: (item: ItemCatalogo) => void;
  onCerrar: () => void;
}

// Etiqueta y color por tipo. 'suplemento' es como se llama un add-on en
// cobro_lineas (cobro_lineas_tipo_check), pero al usuario se le dice "Extra",
// que es la palabra que usa Jose y la que aparece en la ficha de la cita.
const META_TIPO: Record<TipoCatalogo, { etiqueta: string; plural: string; color: string; fondo: string }> = {
  servicio: { etiqueta: 'Servicio', plural: 'Servicios', color: T.primaryHi, fondo: T.primarySoft },
  producto: { etiqueta: 'Producto', plural: 'Productos', color: T.cyan, fondo: T.cyanSoft },
  suplemento: { etiqueta: 'Extra', plural: 'Extras', color: T.successHi, fondo: T.successSoft },
};

const ORDEN_TIPOS: TipoCatalogo[] = ['servicio', 'producto', 'suplemento'];

const ALTO_FILA = 48;
// Colchon de filas fuera de pantalla: sin el, un scroll rapido deja huecos.
const COLCHON = 5;

// Busqueda tolerante a tildes: "matiz" tiene que encontrar "Matiz" y
// "coloracion" tiene que encontrar "Coloración".
const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function SelectorCatalogo({ items, cargando, onElegir, onCerrar }: SelectorCatalogoProps) {
  const [busqueda, setBusqueda] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoCatalogo | 'todos'>('todos');
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');
  const [resaltada, setResaltada] = useState(0);

  const listaRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  // Alto util de la lista: se calcula del alto de la ventana para que en un
  // portatil bajo o en una tablet el modal no se salga de la pantalla.
  const [altoLista, setAltoLista] = useState(400);

  useEffect(() => {
    const recalcular = () => {
      const alto = typeof window === 'undefined' ? 800 : window.innerHeight;
      setAltoLista(Math.max(200, Math.min(440, alto - 300)));
    };
    recalcular();
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', recalcular);
    return () => window.removeEventListener('resize', recalcular);
  }, []);

  // Cuantos hay de cada tipo: la pildora lo dice, para no entrar a un filtro vacio.
  const porTipo = useMemo(() => {
    const cuenta: Record<TipoCatalogo, number> = { servicio: 0, producto: 0, suplemento: 0 };
    for (const it of items) cuenta[it.tipo] += 1;
    return cuenta;
  }, [items]);

  // Las categorias se sacan del tipo elegido: mezclar las de productos con las
  // de servicios daba una fila de pildoras que no cabia y no significaba nada.
  const categorias = useMemo(() => {
    const vistas = new Set<string>();
    for (const it of items) {
      if (tipoFiltro !== 'todos' && it.tipo !== tipoFiltro) continue;
      vistas.add(it.categoria);
    }
    return Array.from(vistas).sort((a, b) => a.localeCompare(b, 'es'));
  }, [items, tipoFiltro]);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda);
    return items.filter(
      (it) =>
        (tipoFiltro === 'todos' || it.tipo === tipoFiltro) &&
        (categoriaFiltro === 'todas' || it.categoria === categoriaFiltro) &&
        (!q || normalizar(it.nombre).includes(q)),
    );
  }, [items, busqueda, tipoFiltro, categoriaFiltro]);

  // Cambiar de filtro con el scroll a mitad dejaba la lista en blanco: la
  // ventana virtual apuntaba a filas que ya no existen.
  useEffect(() => {
    setScrollTop(0);
    setResaltada(0);
    if (listaRef.current) listaRef.current.scrollTop = 0;
  }, [busqueda, tipoFiltro, categoriaFiltro]);

  // Si el tipo elegido no tiene la categoria activa, se vuelve a "todas".
  useEffect(() => {
    if (categoriaFiltro !== 'todas' && !categorias.includes(categoriaFiltro)) {
      setCategoriaFiltro('todas');
    }
  }, [categorias, categoriaFiltro]);

  const desde = Math.max(0, Math.floor(scrollTop / ALTO_FILA) - COLCHON);
  const hasta = Math.min(filtrados.length, Math.ceil((scrollTop + altoLista) / ALTO_FILA) + COLCHON);
  const visibles = filtrados.slice(desde, hasta);

  const irA = (indice: number) => {
    const destino = Math.max(0, Math.min(filtrados.length - 1, indice));
    setResaltada(destino);
    const nodo = listaRef.current;
    if (!nodo) return;
    const arriba = destino * ALTO_FILA;
    const abajo = arriba + ALTO_FILA;
    if (arriba < nodo.scrollTop) nodo.scrollTop = arriba;
    else if (abajo > nodo.scrollTop + altoLista) nodo.scrollTop = abajo - altoLista;
  };

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onCerrar(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); irA(resaltada + 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); irA(resaltada - 1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const elegido = filtrados[resaltada];
      if (elegido) onElegir(elegido);
    }
  };

  const pildora = (activa: boolean, colorActivo?: string) => ({
    flexShrink: 0,
    padding: '6px 12px',
    borderRadius: 99,
    fontSize: 12,
    fontWeight: 700 as const,
    cursor: 'pointer',
    background: activa ? (colorActivo ? `${colorActivo}22` : T.primarySoft) : T.bgCard,
    border: `1px solid ${activa ? (colorActivo ?? T.primary) : T.border}`,
    color: activa ? (colorActivo ?? T.primaryHi) : T.textSec,
    whiteSpace: 'nowrap' as const,
  });

  return (
    <div
      onClick={onCerrar}
      // Por encima del overlay de CobroSheet (zIndex 210): este se abre desde el.
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 260, display: 'grid', placeItems: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={teclado}
        role="dialog"
        aria-label="Añadir al ticket"
        style={{
          background: T.bgPanel, border: `1px solid ${T.borderHi}`, borderRadius: 16,
          width: '100%', maxWidth: 760, maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 70px rgba(40,30,24,0.35)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: T.text }}>Añadir al ticket</h4>
              <div style={{ fontSize: 12, color: T.textTer, marginTop: 2 }}>
                Servicios, productos y extras del catálogo del salón.
              </div>
            </div>
            <button
              type="button" onClick={onCerrar} aria-label="Cerrar"
              style={{ background: 'none', border: 'none', color: T.textSec, cursor: 'pointer', fontSize: 22, fontWeight: 700, lineHeight: 1, padding: '0 4px' }}
            >
              &times;
            </button>
          </div>

          <input
            type="text" autoFocus value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre..."
            style={{
              width: '100%', padding: '11px 14px', background: T.bgCard, border: `1px solid ${T.borderHi}`,
              borderRadius: 10, color: T.text, fontSize: 14, boxSizing: 'border-box',
            }}
          />

          <div style={{ display: 'flex', gap: 6, marginTop: 12, overflowX: 'auto' }}>
            <button type="button" onClick={() => setTipoFiltro('todos')} style={pildora(tipoFiltro === 'todos')}>
              Todo ({items.length})
            </button>
            {ORDEN_TIPOS.map((tipo) => (
              <button
                key={tipo} type="button" onClick={() => setTipoFiltro(tipo)}
                style={pildora(tipoFiltro === tipo, META_TIPO[tipo].color)}
              >
                {META_TIPO[tipo].plural} ({porTipo[tipo]})
              </button>
            ))}
          </div>

          {categorias.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, overflowX: 'auto' }}>
              {['todas', ...categorias].map((cat) => (
                <button
                  key={cat} type="button" onClick={() => setCategoriaFiltro(cat)}
                  style={{ ...pildora(categoriaFiltro === cat), padding: '4px 10px', fontSize: 11, textTransform: 'capitalize' }}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          ref={listaRef}
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          style={{ height: altoLista, overflowY: 'auto', position: 'relative' }}
        >
          {cargando ? (
            <div style={{ padding: 24, fontSize: 13, color: T.textTer, textAlign: 'center' }}>Cargando catálogo...</div>
          ) : filtrados.length === 0 ? (
            <div style={{ padding: 24, fontSize: 13, color: T.textTer, textAlign: 'center', lineHeight: 1.5 }}>
              Nada con ese nombre.
              <br />
              Cierra esta ventana y escribe la línea a mano si es algo puntual.
            </div>
          ) : (
            // Lienzo del alto TOTAL de la lista: la barra de scroll representa el
            // catalogo entero aunque solo existan en el DOM las filas visibles.
            <div style={{ height: filtrados.length * ALTO_FILA, position: 'relative' }}>
              {visibles.map((it, i) => {
                const indice = desde + i;
                const meta = META_TIPO[it.tipo];
                const activa = indice === resaltada;
                return (
                  <button
                    key={`${it.tipo}-${it.id}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setResaltada(indice)}
                    onClick={() => onElegir(it)}
                    style={{
                      position: 'absolute', top: indice * ALTO_FILA, left: 0, right: 0, height: ALTO_FILA,
                      display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px',
                      border: 'none', borderLeft: `3px solid ${activa ? meta.color : 'transparent'}`,
                      background: activa ? T.bgCardHi : 'transparent', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{
                      flexShrink: 0, padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 800,
                      background: meta.fondo, color: meta.color, textTransform: 'uppercase', letterSpacing: 0.3,
                    }}>
                      {meta.etiqueta}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.nombre}
                    </span>
                    {it.duracionMin ? (
                      <span style={{ flexShrink: 0, fontSize: 11, color: T.textTer }}>{it.duracionMin} min</span>
                    ) : null}
                    <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: T.text, minWidth: 62, textAlign: 'right' }}>
                      {(it.precioCents / 100).toFixed(2)} &euro;
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: '10px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 11.5, color: T.textTer }}>
            {filtrados.length} de {items.length} · flechas para moverte, Intro para añadir
          </span>
          <button
            type="button" onClick={onCerrar}
            style={{ padding: '8px 16px', background: T.bgCard, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

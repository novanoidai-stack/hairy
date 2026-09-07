// EL AVISO FUERTE DE LA AGENDA (peticiones 1 y 7 de Jose, 6 sep 2026).
//
// Hasta ahora, citar fuera de horario, encima de una ausencia o pisando a otra
// clienta era IMPOSIBLE: el formulario cortaba con un `return` y la base de
// datos remataba con un 23P01. Un salon real necesita poder saltarselo -- la
// clienta de siempre que aparece a deshora, el hueco que se dobla porque el
// tinte de la otra esta en reposo.
//
// Jose lo pidio con estas palabras: "queremos evitar solapamientos, pero si
// ellos por lo que sea quieren un solapamiento, debemos de dejarles, pero con un
// aviso bien claro y fuerte".
//
// DONDE ESTA LA FRICCION, que es lo unico que hace que un aviso sirva:
//   * El boton grande y relleno es CANCELAR. Seguir adelante es el secundario,
//     en rojo y con borde. Pulsar sin leer cancela, que es el fallo seguro.
//   * Los motivos se listan TODOS de golpe. Encadenar cuatro dialogos seguidos
//     es la forma mas rapida de que se acepten sin mirar.
//   * No es un `confirm()` del navegador: esos se descartan con Enter sin leer,
//     y ademas el vigilante de silencios los caza como fallo del sistema.
//
// Vive aparte porque lo usan los DOS modales de agenda (alta y detalle). Tenerlo
// dos veces seria justo el invariante repartido del que avisa la decision 10 del
// CLAUDE.md: el dia que cambie el texto o la friccion, cambiaria en uno solo.

import { DESIGN_TOKENS as TOKENS } from '@/lib/designTokens';

export function AvisosAgendaPanel({
  avisos,
  onCancelar,
  onForzar,
  etiquetaForzar = 'Crear igualmente',
}: {
  /** Motivos por los que esto pisa la agenda. Vacio o null = no se pinta nada. */
  avisos: string[] | null;
  /** Volver al formulario sin guardar. Es la accion por defecto. */
  onCancelar: () => void;
  /** Guardar aceptando los avisos. */
  onForzar: () => void;
  /** "Crear igualmente" al dar de alta, "Guardar igualmente" al editar. */
  etiquetaForzar?: string;
}) {
  if (!avisos || avisos.length === 0) return null;

  return (
    <div
      role="alert"
      style={{
        background: 'rgba(226,59,52,0.10)',
        border: `2px solid ${TOKENS.danger}`,
        borderRadius: 12,
        padding: 14,
        marginBottom: 18,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: TOKENS.danger,
          marginBottom: 8,
        }}
      >
        {avisos.length === 1
          ? 'Esto pisa la agenda'
          : `Esto pisa la agenda (${avisos.length} avisos)`}
      </div>

      <ul style={{ margin: '0 0 12px 0', paddingLeft: 18 }}>
        {avisos.map((a, i) => (
          <li
            key={i}
            style={{
              fontSize: 12,
              color: TOKENS.text,
              marginBottom: 4,
              lineHeight: 1.45,
            }}
          >
            {a}
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onCancelar}
          style={{
            padding: '9px 16px',
            background: TOKENS.primary,
            color: '#fff',
            border: 'none',
            borderRadius: 9,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Volver y cambiarlo
        </button>
        <button
          onClick={onForzar}
          style={{
            padding: '9px 16px',
            background: 'transparent',
            color: TOKENS.danger,
            border: `1px solid ${TOKENS.danger}`,
            borderRadius: 9,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {etiquetaForzar}
        </button>
      </div>
    </div>
  );
}

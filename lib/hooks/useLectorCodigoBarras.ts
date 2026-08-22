import { useEffect, useRef } from 'react';
import { interpretarLectura, type TeclaLeida } from '@/lib/pos/lectorCodigoBarras';

// Escucha el teclado para cazar lecturas de un escaner de codigo de barras.
//
// El escaner se presenta al navegador como un teclado, asi que no hay API que
// valga: hay que mirar como se teclea. Toda la decision de "esto es una maquina
// y no una persona" vive en lib/pos/lectorCodigoBarras.ts, que si tiene test.
//
// El listener va en la ventana en fase de captura para que funcione tenga el
// foco donde lo tenga. Si el foco esta en un campo de texto normal no se hace
// nada: ahi el usuario esta escribiendo de verdad.

type Opciones = {
  activo?: boolean;
  onCodigo: (codigo: string) => void;
  /** Lectura demasiado rapida para ser humana pero con el digito de control mal. */
  onLecturaMala?: () => void;
};

export function useLectorCodigoBarras({ activo = true, onCodigo, onLecturaMala }: Opciones) {
  const buferRef = useRef<TeclaLeida[]>([]);
  const onCodigoRef = useRef(onCodigo);
  const onMalaRef = useRef(onLecturaMala);
  onCodigoRef.current = onCodigo;
  onMalaRef.current = onLecturaMala;

  useEffect(() => {
    if (!activo || typeof window === 'undefined') return;

    const escribiendoEnUnCampo = (destino: EventTarget | null) => {
      const el = destino as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      // Los escaneres tambien "escriben" en campos, pero si el usuario tiene el
      // cursor puesto es que esta rellenando algo a mano.
      return tag === 'input' || tag === 'textarea' || el.isContentEditable;
    };

    const alPulsar = (e: KeyboardEvent) => {
      if (escribiendoEnUnCampo(e.target)) {
        buferRef.current = [];
        return;
      }

      if (e.key === 'Enter') {
        const teclas = buferRef.current;
        buferRef.current = [];
        if (teclas.length === 0) return;

        const res = interpretarLectura(teclas);
        if (res.tipo === 'codigo') {
          // Que el Enter del escaner no envie el formulario que haya debajo.
          e.preventDefault();
          onCodigoRef.current(res.codigo);
        } else if (res.motivo === 'control') {
          onMalaRef.current?.();
        }
        return;
      }

      if (e.key.length !== 1) return;
      buferRef.current.push({ char: e.key, tMs: e.timeStamp });

      // Un codigo no pasa de 14 digitos: si se acumula mas es que alguien
      // aporrea el teclado, y no interesa guardarlo indefinidamente.
      if (buferRef.current.length > 14) buferRef.current.shift();
    };

    window.addEventListener('keydown', alPulsar, true);
    return () => window.removeEventListener('keydown', alPulsar, true);
  }, [activo]);
}

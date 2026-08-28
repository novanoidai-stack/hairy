// Tipos compartidos de la agenda.
//
// Viven aparte del componente a proposito: en cuanto un modal se extrae a su
// propio fichero, si los tipos siguieran dentro de AgendaCalendar.web.tsx el
// modal tendria que importar DE la agenda y la agenda importar EL modal, o sea
// un ciclo. Con los tipos en un modulo neutro, las dos importan de aqui y nadie
// importa a nadie.
//
// Son los mismos que habia dentro del componente, sin tocar un campo.

export interface Cita {
  id: string;
  inicio: string;
  fin: string;
  fin_activa?: string;
  fin_espera?: string;
  estado: string;
  profesional_id: string;
  servicio_id?: string;
  cliente_id?: string;
  cobrada?: boolean | null;
  cobro_id?: string | null;
  profesionales?: { nombre: string; color: string };
  servicios?: { nombre: string };
  clientes?: { nombre: string };
}

export interface Profesional {
  id: string;
  nombre: string;
  color: string;
  activo: boolean;
  rol?: string;
  foto_perfil?: string;
}

// Compatibilidad: lib/agendaOps.ts evoluciono al ejecutor GENERAL de Chispa en
// lib/chispaOps.ts (Sesion 3 del PLAN-IA-CHISPA). Se mantiene este modulo como
// re-export para no romper los imports existentes (@/lib/agendaOps).
export { ejecutarAccion } from '@/lib/chispaOps';
export type { AccionPropuesta, EjecucionResultado } from '@/lib/chispaOps';

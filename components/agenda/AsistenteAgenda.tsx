// Stub nativo. El asistente de agenda es web-first (ver AsistenteAgenda.web.tsx);
// en nativo no se renderiza. Existe para que el import resuelva en typecheck/native.
export interface AsistenteAgendaProps {
  negocioId: string;
  profile: { id: string; role?: string | null };
  onAgendaChanged: () => void;
}

export default function AsistenteAgenda(_props: AsistenteAgendaProps) {
  return null;
}

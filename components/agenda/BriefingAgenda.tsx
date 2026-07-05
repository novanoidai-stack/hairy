// El briefing proactivo del copiloto vive en la web (.web.tsx). En nativo no se
// renderiza (paridad de import y de tipos para el split .tsx/.web.tsx).

export interface BriefingAgendaProps {
  negocioId: string;
  profile: { id: string; role?: string | null };
  onClose: () => void;
}

export default function BriefingAgenda(_props: BriefingAgendaProps) {
  return null;
}

import AgendaCalendar from '@/components/agenda/AgendaCalendar';
import { withClientDataGate } from '@/components/PrivacyGateOverlay';

function AgendaScreen() {
  return <AgendaCalendar />;
}

export default withClientDataGate(AgendaScreen, 'Agenda');

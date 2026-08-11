import { supabase } from './supabase';
import { reportarError } from './reportarError';

// Sincroniza alergias escritas en una cita hacia la ficha del cliente.
// Anade el texto al campo alergias del cliente si no esta ya presente
// (comparacion case-insensitive por substring para evitar duplicados).
export async function syncAlergiasACliente(clienteId: string | null | undefined, alergiaTexto: string | null | undefined) {
  if (!clienteId) return;
  const texto = (alergiaTexto ?? '').trim();
  if (!texto) return;

  const { data: cliente, error: e1 } = await supabase
    .from('clientes')
    .select('alergias')
    .eq('id', clienteId)
    .maybeSingle();

  if (e1) {
    reportarError(e1, { origen: 'app', tipo: 'operativo' });
    return;
  }

  if (!cliente) return;

  const actualNotas = (cliente.alergias ?? '').trim();

  // Si el texto ya esta contenido (case-insensitive), no hacer nada
  if (actualNotas.toLowerCase().includes(texto.toLowerCase())) return;

  const nuevoNotas = actualNotas ? `${actualNotas}\n${texto}` : texto;

  const { error: e2 } = await supabase.from('clientes').update({ alergias: nuevoNotas }).eq('id', clienteId);
  if (e2) {
    reportarError(e2, { origen: 'app', tipo: 'operativo' });
  }
}

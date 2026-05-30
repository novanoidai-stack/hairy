import { supabase } from './supabase';

// Sincroniza alergias escritas en una cita hacia la ficha del cliente.
// Anade el texto al campo alergias del cliente si no esta ya presente
// (comparacion case-insensitive por substring para evitar duplicados).
export async function syncAlergiasACliente(clienteId: string | null | undefined, alergiaTexto: string | null | undefined) {
  if (!clienteId) return;
  const texto = (alergiaTexto ?? '').trim();
  if (!texto) return;

  const { data: cliente } = await supabase
    .from('clientes')
    .select('alergias')
    .eq('id', clienteId)
    .maybeSingle();

  if (!cliente) return;

  const actualNotas = (cliente.alergias ?? '').trim();

  // Si el texto ya esta contenido (case-insensitive), no hacer nada
  if (actualNotas.toLowerCase().includes(texto.toLowerCase())) return;

  const nuevoNotas = actualNotas ? `${actualNotas}\n${texto}` : texto;

  await supabase.from('clientes').update({ alergias: nuevoNotas }).eq('id', clienteId);
}

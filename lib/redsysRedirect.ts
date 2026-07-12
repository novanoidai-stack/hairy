// Envia al TPV virtual de Redsys (S6): construye un form oculto con los params firmados por el
// edge y lo auto-submitea (Redsys exige POST de formulario, no un redirect por URL como Stripe).
export function irARedsys(url: string, params: Record<string, string>) {
  if (typeof document === 'undefined') return;
  const f = document.createElement('form');
  f.method = 'POST';
  f.action = url;
  for (const [name, value] of Object.entries(params)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    f.appendChild(input);
  }
  document.body.appendChild(f);
  f.submit();
}

// Seleccion DETERMINISTA del candidato de upsell en Caja (Sesion 6,
// PLAN-IA-CHISPA-V2-REDISENO.md): "determinista para elegir candidatos por
// servicio/ficha; LLM solo para el copy". Que producto se sugiere lo decide
// esta regla pura (sin IO, sin LLM); Chispa solo redacta la frase comercial
// sobre el candidato ya elegido. Ver informes/PATRON-IA-POR-PAGINA.md.
export interface ProductoUpsellCandidato {
  id: string;
  nombre: string;
  precio_cents: number;
  categoria: string | null;
}

// Palabras clave del NOMBRE DEL SERVICIO -> categoria de producto afin
// (productos.categoria: 'shampoo' | 'color' | 'tratamiento' | 'accesorios' |
// 'general', ver migrations/inventario-v0.sql). Lista curada y corta a
// proposito: mejor no sugerir nada que sugerir algo irrelevante.
const REGLAS_UPSELL: { patron: RegExp; categoria: string }[] = [
  { patron: /color|tinte|mecha|balayage|decolora|matiz|reflejo|coloraci[oó]n/i, categoria: 'color' },
  { patron: /keratina|hidrat|tratamiento|nutri|reconstru|botox|mascarilla|alisado/i, categoria: 'tratamiento' },
  { patron: /corte|peinado|recogido|flequillo|degradado/i, categoria: 'shampoo' },
];

// Elige UN producto candidato (o null si no hay match razonable). Entre varios
// productos de la misma categoria, elige el primero por orden alfabetico
// (deterministico y estable entre llamadas).
export function elegirCandidatoUpsell(
  servicioNombre: string | null | undefined,
  productos: ProductoUpsellCandidato[],
): ProductoUpsellCandidato | null {
  if (!servicioNombre || productos.length === 0) return null;
  const nombreLower = servicioNombre.toLowerCase();
  const regla = REGLAS_UPSELL.find((r) => r.patron.test(nombreLower));
  if (!regla) return null;

  const candidatos = productos
    .filter((p) => (p.categoria || '').toLowerCase() === regla.categoria)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return candidatos[0] ?? null;
}

Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md (Sesion 12).
Esta es la PARTE B de la Sesión 12 (Frontend "Manos Sucias" e Integración).
Requiere que la Sesión 12-A y la Sesión 5 (infraestructura de voz) estén implementadas.

IMPORTANTE: Haz énfasis en la calidad de la interfaz. Los profesionales usan esto con guantes manchados de tinte, así que la UX "manos sucias" es vital: botones enormes, feedback visual y sonoro claro, y alta tolerancia a toques imprecisos. Usa `useResponsive`. NO cambies estilos ya establecidos (código en inglés, comentarios en español sin emojis, tokens de diseño).

CONSTRUYE (Frontend UI):
1) DICTADO MANOS-LIBRES: Botón gigante "Dictar Fórmula" en la pestaña técnica del cliente y en la cita en curso. Usa la infraestructura de STT (Sesión 5) para capturar el audio.
2) FLUJO DE CONFIRMACIÓN: Envía el texto transcrito a la edge function `color-formula-parser` (creada en 12-A). Muestra un preview editable grande y claro -> confirmar -> guardar en BD.
3) PROTECCIÓN DE SALUD: Si la API devuelve `health_warning: true`, muestra una alerta roja inconfundible redirigiendo a rellenar las notas de salud manualmente.
4) TRADUCTOR UI: En la vista de una fórmula existente, añade un botón "Traducir Marca" que llame a `traductor-marcas`. Muestra la equivalencia propuesta resaltando fuertemente el disclaimer ("orientativo"). Permite guardar como fórmula alternativa.
5) NOTAS POST-SERVICIO: Usa el mismo componente de grabación de voz para dictar notas generales en la cita (guardando como texto).

VERIFICA en demo:
- UI en móvil (375px) es perfecta, botones grandes y feedback claro.
- El flujo de dictado -> preview -> guardado funciona.
- Build web sin errores de TypeScript (`npx tsc --noEmit` y `npm run build:web`).
- Una frase con mención de alergia NO acaba guardada y salta el warning.

CIERRE: commit + push a master; actualiza informes/MEGA_INFORME_MECHA.md y marca "Sesión 12-B HECHA (completa S12)" en informes/PLAN-IA-CHISPA.md.

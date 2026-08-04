# Alta de autónomo — checklist ejecutable

**P0-009 · P0-010 · P0-011 · P0-012 · B2-046 · B2-047 · 4 de agosto de 2026 · Carlos**

Estas seis tareas no las puede hacer nadie por ti: llevan tu identidad, tu certificado y tu firma. Lo que sí se puede es que llegues con todo decidido y no pierdas una tarde delante de la web de la AEAT. Eso es este documento.

> **Aviso:** esto no es asesoramiento fiscal. Es el trabajo previo para que la conversación con la gestoría dure diez minutos en vez de una hora. **La gestoría confirma el epígrafe antes de presentar nada.**

---

## ⚠️ Corrección importante al plan de lanzamiento

El plan dice *"epígrafe IAE **763 o 769.9**"*. **Los dos son incorrectos para Mecha.**

- **769.9** es "otros servicios de telecomunicación". No es lo nuestro. Descartar.
- **763** ("Programadores y analistas de informática") es **Sección 2ª, actividad profesional**. Es el epígrafe de quien factura horas de desarrollo, no de quien explota un producto.

**El correcto es el 845 — "Explotación electrónica por cuenta de terceros", Sección 1ª (empresarial).** La Dirección General de Tributos lo aclaró expresamente para SaaS de suscripción en la **consulta vinculante V0979/2025**: una empresa que factura por suscripción la explotación de una aplicación va al Grupo 845, y *no* puede quedar en actividades profesionales de la Sección 2ª. Lo que determina la clasificación es la naturaleza económica real, no la etiqueta comercial.

**Por qué te importa en euros, no en teoría:** los epígrafes de Sección 2ª llevan **retención de IRPF del 15 % (7 % los tres primeros años)** en las facturas a empresas y autónomos. Tus clientes son salones, que en su mayoría son empresas o autónomos. Con el 763, cada salón tendría que retenerte un porcentaje de cada factura de 39 €. Con el 845 (Sección 1ª) **no hay retención**. Es la diferencia entre una facturación limpia y un lío mensual con 10 salones.

Equivocarse tiene un coste concreto: se corrige con otro 036 marcando la casilla 127, y la infracción por datos erróneos sin consecuencia en cuota son **250 €**.

**Lo que llevas decidido a la gestoría:** epígrafe **845, Sección 1ª**. Si además vais a facturar horas de desarrollo o consultoría a terceros, se puede dar de alta **también** el 763 — son compatibles y es habitual tener los dos.

---

## El orden. No se puede alterar

Cada paso depende del anterior. Hacerlos en desorden es la forma más común de perder una semana.

### 1 · Certificado digital FNMT o Cl@ve — `P0-009`

**Sin esto no puedes hacer nada de lo demás.** Es la llave.

1. Entra en [sede.fnmt.gob.es](https://www.sede.fnmt.gob.es/certificados/persona-fisica) → "Obtener certificado software".
2. Solicita el certificado. Te dan un **código de solicitud** por email.
3. **Acredita tu identidad en persona**: con el código, el DNI y una oficina de registro (Agencia Tributaria o Seguridad Social, con cita previa). Este es el paso que tiene cola: **pide la cita hoy**.
4. Vuelve a la web y descarga el certificado. **Instálalo y expórtalo a un `.pfx` con contraseña**, y guarda el respaldo fuera del portátil. Si pierdes el equipo sin respaldo, vuelves a empezar desde el paso 1.

**Coste 0 €. Plazo 1–3 días**, casi todo esperando la cita presencial.

*Alternativa: Cl@ve PIN sirve para el 036, pero el certificado te hará falta igualmente para VeriFactu y para la facturación. Saca el certificado.*

### 2 · Alta censal — modelo 036 — `P0-010`

Antes que el RETA. Hacienda primero, Seguridad Social después.

- **Casilla 400**: descripción de la actividad.
- **Casilla 402**: **epígrafe 845, Sección 1ª** (ver la corrección de arriba).
- Fecha de inicio de actividad: **la misma que vayas a poner en el RETA**. Que no bailen.
- Régimen de IVA: general. Un SaaS a empresas españolas lleva **IVA 21 %**.

**Coste 0 €. Se hace el mismo día**, online con el certificado.

### 3 · Alta en RETA — modelo TA.0521 — `P0-011`

🔴 **La casilla de tarifa plana. Si se te olvida marcarla, la pierdes para siempre.** No es recuperable ni con recurso. Es el único punto de esta lista donde un despiste cuesta ~1.000 € el primer año.

- Se presenta en [Importass](https://portal.seg-social.gob.es/) con el certificado.
- Plazo: hasta 60 días antes del inicio, y como muy tarde el día anterior.
- **Cuota con tarifa plana: ~88,72 €/mes el primer año** (80 € de base reducida + el MEI).
- Marca la casilla de **reducción de cuota para nuevos autónomos**. Revísalo dos veces antes de firmar.

**Plazo 1–2 días.**

### 4 · Gestoría — `P0-012`

Contrátala **antes** del primer cobro, no después. Presupuestado: **40 €/mes**.

Lo que tiene que cubrir por ese precio: IVA trimestral (modelo 303), IRPF (130), resumen anual (390), renta, y **facturación con numeración correlativa**. Pregunta explícitamente dos cosas, porque son las que te van a doler:

- **¿Lleváis VeriFactu?** Es obligatorio para sociedades en enero de 2027 y para autónomos en julio de 2027. Tú además lo vendes como característica del producto: necesitas una gestoría que sepa de qué le hablas.
- **¿Quién emite las facturas a los salones y con qué numeración?** Stripe Invoicing emite el documento, pero **la numeración fiscal correlativa española es responsabilidad tuya**, no de Stripe. Que te diga el formato antes de que Alexandro monte el Billing (P0-001).

### 5 · Cuenta bancaria de negocio — `B2-046`

Esto lo abres tú; yo no puedo ni debo tocar datos bancarios.

Separada de la personal desde el primer euro, aunque como autónomo no sea legalmente obligatorio: cuando tengas 10 salones pagando y la gestoría te pida los movimientos, agradecerás no tener que separarlos de la compra del súper.

Neobancos (0 €/mes) o banco tradicional (~10 €/mes). Requisito real: que se lleve bien con Stripe para las transferencias.

### 6 · Cuota cero autonómica — `B2-047`

**No es una alternativa a la tarifa plana: va encima.** Es una ayuda autonómica que te **reembolsa** lo que ya pagaste de tarifa plana. Por eso el orden importa: **primero tarifa plana** (paso 3), y la cuota cero después.

Y el detalle que casi todo el mundo se salta: **en la mayoría de comunidades se solicita al cumplir los 12 meses de actividad, no al darte de alta.** No es algo que hagas esta semana; es algo que tienes que **apuntar en el calendario para agosto de 2027** o lo pierdes por plazo.

**Estado en 2026:**

| Comunidad | Situación |
|---|---|
| **Madrid** | Solicitud continua y permanente. Presupuesto ampliado un 17,7 % (37,1 M€). Cubre el primer año y puede llegar a 24–36 meses. ⚠️ **No bonifica el MEI** (~8,64 €/mes) |
| **Andalucía** | Convocatoria abierta hasta septiembre de 2026. Sí cubre el MEI |
| **Aragón** | Convocatoria abierta, sin fecha de cierre |
| **Cantabria** | Plazo indefinido |
| **Castilla-La Mancha** | Cubre **dos años** + ayuda directa adicional de 3.000 € |
| Galicia, Canarias, Murcia, CyL, Baleares, Extremadura | La ofrecen, pero **por convocatoria**: hay que estar pendiente de cuándo abre |
| **La Rioja** | ⚠️ Sin convocatoria nueva desde 2024. El plan la daba por vigente |
| **Cataluña, País Vasco, Navarra, C. Valenciana** | **No la ofrecen.** Tienen otras ayudas distintas |

**Requisitos comunes:** estar al corriente con Seguridad Social, Hacienda y la administración autonómica; empadronamiento en la comunidad; justificantes de las cuotas pagadas el primer año. No aplica a autónomos colaboradores, y Murcia excluye además a los societarios.

> ❓ **Esto es lo único que no puedo cerrar: no sé en qué comunidad estás.** Dímelo y te digo el plazo exacto, el importe y el enlace de tu convocatoria.

---

## Resumen: qué haces tú esta semana

| # | Acción | Dónde | Tiempo real |
|---|---|---|---|
| 1 | **Pedir la cita presencial de la FNMT** ← hazlo hoy | sede.fnmt.gob.es | 5 min + la cola |
| 2 | 036, epígrafe **845 Sección 1ª** | AEAT, con certificado | 20 min |
| 3 | TA.0521 **marcando tarifa plana** | Importass | 20 min |
| 4 | Llamar a 2–3 gestorías con las dos preguntas de arriba | — | 1 h |
| 5 | Abrir la cuenta de negocio | Tu banco | 30 min |
| 6 | Apuntar "solicitar cuota cero" en el calendario a 12 meses | — | 1 min |

Coste total de trámites: **0 €**. Coste recurrente que arrancas: 88,72 € de cuota + 40 € de gestoría.

---

## Fuentes

- [DGT, consulta vinculante sobre IAE de servicios digitales (Grupo 845)](https://asecasesoria.com/iae-grupo-845-inteligencia-artificial-servicios-digitales/)
- [Declarando — IAE de profesiones digitales](https://declarando.es/alta-como-autonomo/iae-profesiones-digitales)
- [Infoautónomos — Epígrafes IAE](https://www.infoautonomos.com/fiscalidad/los-epigrafes-iae/)
- [Autónomos y Emprendedor — Comunidades con cuota cero en 2026](https://www.autonomosyemprendedor.es/articulo/autonomos/son-comunidades-autonomas-que-ofreceran-cuota-cero-autonomos-2026/20260216182652051989.html)
- [Holded — Comunidades que mantienen la cuota cero](https://www.holded.com/es/blog/comunidades-anuncian-mantienen-cuota-cero)
- [Infoautónomos — Tarifa plana 2026](https://www.infoautonomos.com/seguridad-social/tarifa-plana-autonomos/)
